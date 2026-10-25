/**
 * Science Utopia の数値モデル τ_θ。
 * 論文 §5 の「制度 θ をスイープして科学社会の応答を測る」写像を、1 年ずつ進めるゲーム版にしたもの。
 * 決定論的（seed と θ 系列が同じなら結果も同じ）。式の説明は docs/model.md。
 */
import type {
  Career, EndingType, Paper, Persona, ResearcherState, SocietyState, Theta, YearEvents, YearMetrics,
} from "./types";
import { gauss, mulberry32, poisson, weightedPick } from "./rng";

export const FIELDS = ["推論・計画", "学習理論", "生成モデル", "ロボティクス", "AI 安全性", "科学のための AI"] as const;
export const N_FIELDS = FIELDS.length;
/** islands = "two" のときの島分け */
export const ISLAND_OF = [0, 0, 0, 1, 1, 1];

/** 定数はここに集める。変えたら docs/model.md と方向性テストを見直す。 */
export const C = {
  budgetPerHead: 1,
  // 投稿数 λ = base + gain·√funding、制度による倍率
  lambdaBase: 0.8,
  lambdaGain: 1.1,
  submitByAcceptance: { 0.1: 0.75, 0.3: 1.0, 0.6: 1.3 } as Record<number, number>,
  submitByVerify: { none: 1.0, spot: 0.9, all: 0.7 },
  submitByIncentive: { citations: 1.1, replication: 0.85, novelty: 0.95 },
  // 新規性
  noveltyBase: 0.4,
  noveltySd: 0.15,
  noveltyByIncentive: { citations: 0, replication: -0.08, novelty: 0.12 },
  noveltyByCareer: { 若手: 0.1, 中堅: 0.03, 大御所: 0 } as Record<Career, number>,
  noveltyByIslands: { mono: 0, two: 0.02, multi: 0.06 },
  crowdingPenalty: 0.3,
  hypeOfFalse: 0.15,
  // 不正（偽の結果）の出やすさ
  fraudBase: 0.04,
  fraudFromIntegrity: 0.3,
  fraudMax: 0.6,
  pressureByIncentive: { citations: 1.2, replication: 0.5, novelty: 1.4 },
  pressureByAcceptance: { 0.1: 0.8, 0.3: 1.0, 0.6: 1.5 } as Record<number, number>,
  deterrence: 0.6,
  // 査読
  detectByVerify: { none: 0.1, spot: 0.45, all: 0.9 },
  scrutinyGain: 0.2,
  repBiasByYouth: { elders: 0.35, neutral: 0.2, youth: 0.1 },
  reviewSd: 0.15,
  caughtRepPenalty: 0.12,
  expelAfterCaught: 2,
  // 引用
  refsPerPaper: 6,
  alphaByIncentive: { citations: 1.1, novelty: 0.6, replication: 0.4 },
  recency: 0.7,
  falseCiteWeightUnderReplication: 0.3,
  affinityOther: { mono: 0.15, two: 0.05, multi: 0.5 },
  affinitySameIsland: 0.4,
  postPubReplicationCatch: 0.3,
  // 分野の移動
  herdByIslands: { mono: 0.22, two: 0.15, multi: 0 },
  herdByIncentive: { citations: 1.3, replication: 1.0, novelty: 0.6 },
  exchangeMulti: 0.08,
  // 離脱
  leaveRepThreshold: 0.3,
  leaveProb: 0.1,
  leaveProbHarsh: 0.15,
  // 評判
  repKeep: 0.75,
  repFromCites: 0.25,
  repPerAccepted: 0.03,
  // ヒット
  hitNovelty: 0.65,
} as const;

export const THETA_STATUS_QUO: Theta = {
  funding_frac: 0.3,
  acceptance: 0.3,
  incentive: "citations",
  verify: "none",
  youth_share: "elders",
  islands: "two",
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function initSociety(personas: Persona[], seed: number): SocietyState {
  const rng = mulberry32(seed ^ 0x5eed);
  const researchers: ResearcherState[] = personas.map((p, i) => {
    const r = rng();
    const integrity = r < 0.2 ? 0.2 + 0.3 * rng() : 0.65 + 0.35 * rng();
    return {
      id: i,
      field: ((p.field % N_FIELDS) + N_FIELDS) % N_FIELDS,
      career: p.career,
      reputation: clamp01(p.reputation),
      integrity,
      citationsCum: 0,
      acceptedCum: 0,
      funding: 0,
      caughtCum: 0,
      active: true,
    };
  });
  return { seed, year: 0, researchers, papers: [], edges: {}, history: [] };
}

export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

/** Shannon エントロピー（bit） */
export function entropyBits(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / total) * Math.log2(c / total);
  return h;
}

function fundingScore(r: ResearcherState, theta: Theta): number {
  switch (theta.youth_share) {
    case "elders":
      return r.reputation + (r.career === "大御所" ? 0.3 : r.career === "中堅" ? 0.1 : 0);
    case "youth":
      return 0.3 * r.reputation + (r.career === "若手" ? 0.5 : r.career === "中堅" ? 0.2 : 0);
    default:
      return r.reputation;
  }
}

/** 1 年進める。入力 state は変更しない。 */
export function stepYear(prev: SocietyState, theta: Theta): { state: SocietyState; metrics: YearMetrics; events: YearEvents } {
  const s: SocietyState = structuredClone(prev);
  const year = s.year + 1;
  s.year = year;
  const rng = mulberry32((s.seed ^ Math.imul(year, 0x9e3779b1)) >>> 0);
  const active = s.researchers.filter((r) => r.active);

  // 1) 分野の移動（島の構造）
  let switched = 0;
  const fieldCount = new Array(N_FIELDS).fill(0);
  for (const r of active) fieldCount[r.field]++;
  const herd = C.herdByIslands[theta.islands] * C.herdByIncentive[theta.incentive];
  for (const r of active) {
    if (theta.islands === "multi") {
      if (rng() < C.exchangeMulti) {
        const to = Math.floor(rng() * (N_FIELDS - 1));
        r.field = to >= r.field ? to + 1 : to;
        switched++;
      }
      continue;
    }
    let target = -1;
    let best = -1;
    for (let f = 0; f < N_FIELDS; f++) {
      if (theta.islands === "two" && ISLAND_OF[f] !== ISLAND_OF[r.field]) continue;
      if (fieldCount[f] > best) { best = fieldCount[f]; target = f; }
    }
    if (target !== r.field && rng() < herd) { r.field = target; switched++; }
  }
  const fieldCountNow = new Array(N_FIELDS).fill(0);
  for (const r of active) fieldCountNow[r.field]++;

  // 2) 資金配分
  const nActive = active.length;
  const ranked = [...active].sort((a, b) => fundingScore(b, theta) - fundingScore(a, theta) || a.id - b.id);
  const nFunded = Math.max(1, Math.round(nActive * theta.funding_frac));
  const budget = s.researchers.length * C.budgetPerHead;
  for (const r of s.researchers) r.funding = 0;
  ranked.slice(0, nFunded).forEach((r) => (r.funding = budget / nFunded));

  // 3) 投稿と論文の性質
  const detect = C.detectByVerify[theta.verify];
  const pressure = C.pressureByIncentive[theta.incentive] * C.pressureByAcceptance[theta.acceptance] * (1 - C.deterrence * detect);
  const mult = C.submitByAcceptance[theta.acceptance] * C.submitByVerify[theta.verify] * C.submitByIncentive[theta.incentive];
  const submissions: Paper[] = [];
  let nextId = s.papers.length ? s.papers[s.papers.length - 1].id + 1 : 0;
  for (const r of active) {
    const lambda = (C.lambdaBase + C.lambdaGain * Math.sqrt(r.funding)) * mult;
    const k = poisson(rng, lambda);
    const share = nActive ? fieldCountNow[r.field] / nActive : 0;
    for (let j = 0; j < k; j++) {
      const pFalse = Math.min(C.fraudMax, (C.fraudBase + C.fraudFromIntegrity * (1 - r.integrity)) * pressure);
      const isTrue = rng() >= pFalse;
      const novelty = clamp01(
        C.noveltyBase + C.noveltyByIncentive[theta.incentive] + C.noveltyByCareer[r.career] + C.noveltyByIslands[theta.islands]
          - C.crowdingPenalty * Math.max(0, share - 1 / N_FIELDS) + C.noveltySd * gauss(rng) + (isTrue ? 0 : C.hypeOfFalse),
      );
      submissions.push({ id: nextId++, author: r.id, year, field: r.field, novelty, isTrue, citations: 0 });
    }
  }

  // 4) 査読
  const detectEff = clamp01(detect + C.scrutinyGain * (0.3 - theta.acceptance));
  const repBias = C.repBiasByYouth[theta.youth_share];
  const caughtThisYear = new Map<number, number>();
  const candidates: { p: Paper; q: number }[] = [];
  for (const p of submissions) {
    if (!p.isTrue && rng() < detectEff) {
      caughtThisYear.set(p.author, (caughtThisYear.get(p.author) ?? 0) + 1);
      continue;
    }
    candidates.push({ p, q: p.novelty + repBias * s.researchers[p.author].reputation + C.reviewSd * gauss(rng) });
  }
  candidates.sort((a, b) => b.q - a.q || a.p.id - b.p.id);
  const quota = Math.round(theta.acceptance * submissions.length);
  const accepted = candidates.slice(0, quota).map((c) => c.p);
  for (const p of accepted) s.researchers[p.author].acceptedCum++;
  s.papers.push(...accepted);

  // 5) 引用
  const alpha = C.alphaByIncentive[theta.incentive];
  const citesThisYear = new Array(s.researchers.length).fill(0);
  const events = Math.round(accepted.length * C.refsPerPaper);
  let citationsGiven = 0;
  const pool = s.papers;
  const weights = new Array(pool.length).fill(0);
  for (let e = 0; e < events && accepted.length; e++) {
    const citer = accepted[Math.floor(rng() * accepted.length)];
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.author === citer.author) { weights[i] = 0; continue; }
      let aff = 1;
      if (p.field !== citer.field) {
        aff = theta.islands === "two" && ISLAND_OF[p.field] === ISLAND_OF[citer.field] ? C.affinitySameIsland : C.affinityOther[theta.islands];
      }
      const fake = theta.incentive === "replication" && !p.isTrue ? C.falseCiteWeightUnderReplication : 1;
      weights[i] = Math.pow(1 + p.citations, alpha) * (0.3 + p.novelty) * aff * Math.pow(C.recency, year - p.year) * fake;
    }
    const t = weightedPick(rng, weights);
    if (t < 0) continue;
    const target = pool[t];
    target.citations++;
    s.researchers[target.author].citationsCum++;
    citesThisYear[target.author]++;
    const key = `${citer.author}-${target.author}`;
    s.edges[key] = (s.edges[key] ?? 0) + 1;
    citationsGiven++;
  }

  // 6) 出版後の再現検証（評価指標が再現性のとき）
  if (theta.incentive === "replication") {
    for (const p of accepted) {
      if (!p.isTrue && rng() < C.postPubReplicationCatch) {
        caughtThisYear.set(p.author, (caughtThisYear.get(p.author) ?? 0) + 1);
      }
    }
  }

  // 7) 評判と離脱
  const maxCites = Math.max(1, ...citesThisYear);
  const acceptedBy = new Map<number, number>();
  for (const p of accepted) acceptedBy.set(p.author, (acceptedBy.get(p.author) ?? 0) + 1);
  let caught = 0;
  for (const r of active) {
    const c = caughtThisYear.get(r.id) ?? 0;
    caught += c;
    r.caughtCum += c;
    r.reputation = clamp01(
      C.repKeep * r.reputation + C.repFromCites * (citesThisYear[r.id] / maxCites) + C.repPerAccepted * (acceptedBy.get(r.id) ?? 0) - C.caughtRepPenalty * c,
    );
    if (r.caughtCum >= C.expelAfterCaught) { r.active = false; continue; }
    if (r.funding === 0 && r.reputation < C.leaveRepThreshold) {
      const p = C.leaveProb + (theta.acceptance === 0.1 ? C.leaveProbHarsh : 0);
      if (rng() < p) r.active = false;
    }
  }

  // 8) 指標
  const acceptedFieldCount = new Array(N_FIELDS).fill(0);
  for (const p of accepted) acceptedFieldCount[p.field]++;
  const researcherFieldCount = new Array(N_FIELDS).fill(0);
  for (const r of s.researchers) if (r.active) researcherFieldCount[r.field]++;
  const hNat = entropyBits(researcherFieldCount) * Math.LN2;
  const falseAccepted = accepted.filter((p) => !p.isTrue).length;
  const metrics: YearMetrics = {
    year,
    papers: submissions.length,
    accepted: accepted.length,
    citations: citationsGiven,
    Gini: gini(s.researchers.map((r) => r.citationsCum)),
    H: entropyBits(acceptedFieldCount),
    hit: accepted.filter((p) => p.isTrue && p.novelty >= C.hitNovelty).length,
    fraud_rate: accepted.length ? falseAccepted / accepted.length : 0,
    pluralism: Math.exp(hNat) / N_FIELDS,
  };
  s.history.push(metrics);
  const topCited = [...s.researchers].sort((a, b) => b.citationsCum - a.citationsCum || a.id - b.id).slice(0, 3).map((r) => r.id);
  return { state: s, metrics, events: { caught, topCited, switched, funded: nFunded } };
}

/** 上位 3 名が累積引用に占める割合 */
export function top3Share(s: SocietyState): number {
  const c = s.researchers.map((r) => r.citationsCum).sort((a, b) => b - a);
  const total = c.reduce((a, b) => a + b, 0);
  return total ? (c[0] + c[1] + c[2]) / total : 0;
}

export const ENDING_THRESHOLDS = {
  depletionActiveFrac: 0.65,
  depletionAccepted: 6,
  cartelGini: 0.6,
  cartelTop3: 0.45,
  monoPluralism: 0.45,
} as const;

/** エンディング判定（枯渇 > モノカルチャー > 引用カルテル > ユートピアの順） */
export function classifyEnding(s: SocietyState): EndingType {
  const last = s.history[s.history.length - 1];
  if (!last) return "utopia";
  const activeFrac = s.researchers.filter((r) => r.active).length / s.researchers.length;
  if (activeFrac < ENDING_THRESHOLDS.depletionActiveFrac || last.accepted < ENDING_THRESHOLDS.depletionAccepted) return "depletion";
  if (last.pluralism < ENDING_THRESHOLDS.monoPluralism) return "monoculture";
  if (last.Gini >= ENDING_THRESHOLDS.cartelGini && top3Share(s) >= ENDING_THRESHOLDS.cartelTop3) return "cartel";
  return "utopia";
}

/** θ 系列で最後まで回す（テスト・事前計算用） */
export function runAll(personas: Persona[], seed: number, thetas: Theta[]): SocietyState {
  let s = initSociety(personas, seed);
  for (const th of thetas) s = stepYear(s, th).state;
  return s;
}
