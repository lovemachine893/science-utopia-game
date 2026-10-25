import { describe, expect, it } from "vitest";
import { classifyEnding, gini, initSociety, runAll, stepYear, THETA_STATUS_QUO } from "./model";
import { FALLBACK_PERSONAS, sanitizePersonas } from "./personas";
import type { Theta, YearMetrics } from "./types";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

/** θ を 5 年固定で回し、全 seed・全年でプールした指標を返す */
function pooled(delta: Partial<Theta>) {
  const th = { ...THETA_STATUS_QUO, ...delta } as Theta;
  let papers = 0, accepted = 0, falseAcc = 0, giniLast = 0, H = 0, plur = 0, hit = 0;
  for (const seed of SEEDS) {
    const s = runAll(FALLBACK_PERSONAS, seed, [th, th, th, th, th]);
    for (const m of s.history) {
      papers += m.papers;
      accepted += m.accepted;
      falseAcc += m.fraud_rate * m.accepted;
      H += m.H;
      hit += m.hit;
    }
    const last = s.history[4] as YearMetrics;
    giniLast += last.Gini;
    plur += last.pluralism;
  }
  const n = SEEDS.length;
  return { papers: papers / n, fraud: falseAcc / Math.max(1, accepted), Gini: giniLast / n, H: H / (n * 5), pluralism: plur / n, hit: hit / n };
}

describe("方向性（論文 §5 の定性的な予想を固定する）", () => {
  it("資金の集中 → Gini↑", () => {
    expect(pooled({ funding_frac: 0.05 }).Gini).toBeGreaterThan(pooled({ funding_frac: 1.0 }).Gini);
  });
  it("資金の集中 → 総投稿数↓（逓減する収穫）", () => {
    expect(pooled({ funding_frac: 0.05 }).papers).toBeLessThan(pooled({ funding_frac: 1.0 }).papers);
  });
  it("全件検証 → fraud↓ かつ papers↓", () => {
    const all = pooled({ verify: "all" });
    const none = pooled({ verify: "none" });
    expect(all.fraud).toBeLessThan(none.fraud);
    expect(all.papers).toBeLessThan(none.papers);
  });
  it("寛容な採択 → papers↑ fraud↑", () => {
    const loose = pooled({ acceptance: 0.6 });
    const std = pooled({ acceptance: 0.3 });
    expect(loose.papers).toBeGreaterThan(std.papers);
    expect(loose.fraud).toBeGreaterThan(std.fraud);
  });
  it("引用数評価 → 再現性評価より Gini↑", () => {
    expect(pooled({ incentive: "citations" }).Gini).toBeGreaterThan(pooled({ incentive: "replication" }).Gini);
  });
  it("再現性評価 → fraud↓", () => {
    expect(pooled({ incentive: "replication" }).fraud).toBeLessThan(pooled({ incentive: "citations" }).fraud);
  });
  it("新規性評価 → hit↑（再現性評価より）", () => {
    expect(pooled({ incentive: "novelty" }).hit).toBeGreaterThan(pooled({ incentive: "replication" }).hit);
  });
  it("多島＋交流 → H と pluralism を保つ（一極より高い）", () => {
    const multi = pooled({ islands: "multi" });
    const mono = pooled({ islands: "mono" });
    expect(multi.H).toBeGreaterThan(mono.H);
    expect(multi.pluralism).toBeGreaterThan(mono.pluralism);
  });
  it("若手に厚く → hit↑（大御所に厚くより）", () => {
    expect(pooled({ youth_share: "youth" }).hit).toBeGreaterThan(pooled({ youth_share: "elders" }).hit);
  });
});

describe("決定論・性能・判定", () => {
  it("同じ seed と θ 系列なら同じ結果", () => {
    const th = [THETA_STATUS_QUO, THETA_STATUS_QUO, THETA_STATUS_QUO];
    expect(runAll(FALLBACK_PERSONAS, 7, th).history).toEqual(runAll(FALLBACK_PERSONAS, 7, th).history);
  });
  it("stepYear は入力 state を変更しない", () => {
    const s0 = initSociety(FALLBACK_PERSONAS, 3);
    const snap = JSON.stringify(s0);
    stepYear(s0, THETA_STATUS_QUO);
    expect(JSON.stringify(s0)).toBe(snap);
  });
  it("5 年分が 1 秒以内", () => {
    const t0 = performance.now();
    runAll(FALLBACK_PERSONAS, 11, Array(5).fill(THETA_STATUS_QUO));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it("指標が値域に収まる", () => {
    const s = runAll(FALLBACK_PERSONAS, 5, Array(5).fill(THETA_STATUS_QUO));
    for (const m of s.history) {
      expect(m.Gini).toBeGreaterThanOrEqual(0);
      expect(m.Gini).toBeLessThanOrEqual(1);
      expect(m.fraud_rate).toBeGreaterThanOrEqual(0);
      expect(m.fraud_rate).toBeLessThanOrEqual(1);
      expect(m.H).toBeLessThanOrEqual(Math.log2(6) + 1e-9);
      expect(m.pluralism).toBeLessThanOrEqual(1 + 1e-9);
      expect(m.accepted).toBeLessThanOrEqual(m.papers);
    }
  });
  it("gini の基本値", () => {
    expect(gini([1, 1, 1, 1])).toBeCloseTo(0);
    expect(gini([0, 0, 0, 4])).toBeCloseTo(0.75);
  });
  it("4 種のエンディングがすべて到達可能", () => {
    const seen = new Set<string>();
    const cases: Partial<Theta>[] = [
      {},
      { islands: "mono" },
      { funding_frac: 0.05, acceptance: 0.1, verify: "all" },
      { funding_frac: 1.0, incentive: "replication", verify: "spot", youth_share: "youth", islands: "multi" },
    ];
    for (const d of cases) {
      const th = { ...THETA_STATUS_QUO, ...d } as Theta;
      for (const seed of SEEDS.slice(0, 10)) seen.add(classifyEnding(runAll(FALLBACK_PERSONAS, seed, Array(5).fill(th))));
    }
    expect([...seen].sort()).toEqual(["cartel", "depletion", "monoculture", "utopia"]);
  });
});

describe("ペルソナ", () => {
  it("固定 24 人", () => {
    expect(FALLBACK_PERSONAS).toHaveLength(24);
  });
  it("壊れた LLM 出力は null", () => {
    expect(sanitizePersonas([{ name: "x" }])).toBeNull();
    expect(sanitizePersonas("oops")).toBeNull();
  });
  it("値域外は丸める", () => {
    const raw = FALLBACK_PERSONAS.map((p) => ({ ...p, field: 13, reputation: 3, career: "教授" }));
    const out = sanitizePersonas(raw)!;
    expect(out[0].field).toBe(1);
    expect(out[0].reputation).toBe(1);
    expect(out[0].career).toBe(FALLBACK_PERSONAS[0].career);
  });
});
