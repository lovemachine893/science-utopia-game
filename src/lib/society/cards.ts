import type { Theta, ThetaKey, YearMetrics } from "./types";
import { mulberry32 } from "./rng";

export type OptionKey = "a" | "b" | "c";
export const ALL_FIELDS: ThetaKey[] = ["funding_frac", "acceptance", "incentive", "verify", "youth_share", "islands"];

interface OptionDef { value: Theta[ThetaKey]; label: string; text: string }
interface FieldDef { title: string; options: [OptionDef, OptionDef, OptionDef] }

export const FIELD_DEFS: Record<ThetaKey, FieldDef> = {
  funding_frac: {
    title: "資金配分",
    options: [
      { value: 0.05, label: "上位 5% に集中投資", text: "評判の高い一握りに研究費を集中させる。" },
      { value: 0.3, label: "上位 3 割に配分", text: "評判の上位 3 割に研究費を配る。" },
      { value: 1.0, label: "全員に均等配分", text: "全員に同じ額の研究費を配る。" },
    ],
  },
  acceptance: {
    title: "採択率",
    options: [
      { value: 0.1, label: "狭き門（10%）", text: "投稿の 1 割しか採らない、選び抜かれた学会にする。" },
      { value: 0.3, label: "標準（30%）", text: "投稿の 3 割を採る。" },
      { value: 0.6, label: "寛容（60%）", text: "投稿の 6 割を採り、まず世に出してから評価する。" },
    ],
  },
  incentive: {
    title: "評価指標",
    options: [
      { value: "citations", label: "引用数で評価", text: "昇進と研究費の審査で引用数を重く見る。" },
      { value: "replication", label: "再現性・検証で評価", text: "追試に耐えた成果と、他人の追試への貢献を評価する。" },
      { value: "novelty", label: "新規性で評価", text: "誰もやっていない問いへの挑戦を評価する。" },
    ],
  },
  verify: {
    title: "検証義務",
    options: [
      { value: "none", label: "検証なし", text: "査読者の目に任せ、追加の検証は求めない。" },
      { value: "spot", label: "抜き打ち検証", text: "投稿の一部を抜き打ちで再実行する。" },
      { value: "all", label: "全件検証", text: "すべての投稿でコードとデータの再実行を義務づける。" },
    ],
  },
  youth_share: {
    title: "人材",
    options: [
      { value: "elders", label: "大御所に厚く", text: "実績のある研究者を優先して支える。" },
      { value: "neutral", label: "中立", text: "経歴に関係なく評判だけで扱う。" },
      { value: "youth", label: "若手に厚く", text: "若手枠を設け、査読も匿名性を強める。" },
    ],
  },
  islands: {
    title: "多元性",
    options: [
      { value: "mono", label: "一極", text: "最も勢いのある分野に共同体をまとめる。" },
      { value: "two", label: "2 つの島", text: "共同体を 2 つの大きな島に分けて運営する。" },
      { value: "multi", label: "多島＋交流", text: "小さな島をたくさん残し、島どうしの交流を後押しする。" },
    ],
  },
};

export const OPTION_KEYS: OptionKey[] = ["a", "b", "c"];

export function optionKeyOf(field: ThetaKey, value: Theta[ThetaKey]): OptionKey {
  const i = FIELD_DEFS[field].options.findIndex((o) => o.value === value);
  return OPTION_KEYS[Math.max(0, i)];
}

export function valueOf(field: ThetaKey, key: OptionKey): Theta[ThetaKey] {
  return FIELD_DEFS[field].options[OPTION_KEYS.indexOf(key)].value;
}

export function labelOf(field: ThetaKey, value: Theta[ThetaKey]): string {
  return FIELD_DEFS[field].options.find((o) => o.value === value)?.label ?? String(value);
}

export function applyChoice(theta: Theta, field: ThetaKey, key: OptionKey): Theta {
  return { ...theta, [field]: valueOf(field, key) } as Theta;
}

/** その年の 3 分野（重複なし、seed と年で決まる） */
export function drawFields(seed: number, year: number): ThetaKey[] {
  const rng = mulberry32((seed * 31 + year * 7919) >>> 0);
  const arr = [...ALL_FIELDS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 3);
}

export interface CardOption { key: OptionKey; label: string; text: string; isCurrent: boolean }
export interface PolicyCard { field: ThetaKey; title: string; context: string; options: CardOption[] }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 前年の指標から、カード冒頭の一文を作る */
function contextLine(field: ThetaKey, last?: YearMetrics): string {
  if (!last) {
    const first: Record<ThetaKey, string> = {
      funding_frac: "財団の研究費をどう配るか。最初の 1 年を決めます。",
      acceptance: "財団が主催する学会の門の広さを決めます。",
      incentive: "研究者は評価されるものを作ります。何を評価しますか。",
      verify: "論文の主張を誰がどこまで確かめるかを決めます。",
      youth_share: "誰の挑戦を優先して支えるかを決めます。",
      islands: "研究者の共同体をどんな形にしておくかを決めます。",
    };
    return first[field];
  }
  switch (field) {
    case "funding_frac":
      return last.Gini > 0.6
        ? `昨年の被引用の偏り（Gini）は ${last.Gini.toFixed(2)}。一部の研究室に注目が集まっています。`
        : `昨年の被引用の偏り（Gini）は ${last.Gini.toFixed(2)}。まだ注目は分散しています。`;
    case "acceptance":
      return `昨年は ${last.papers} 本の投稿のうち ${last.accepted} 本を採りました。`;
    case "incentive":
      return last.hit <= 1
        ? `昨年の「当たり」（新しくて正しい成果）は ${last.hit} 本でした。評価の物差しを見直しますか。`
        : `昨年の「当たり」（新しくて正しい成果）は ${last.hit} 本でした。`;
    case "verify":
      return last.fraud_rate >= 0.15
        ? `昨年の採択論文の ${pct(last.fraud_rate)} は追試に耐えない結果でした。`
        : `昨年の採択論文で追試に耐えなかったのは ${pct(last.fraud_rate)} でした。`;
    case "youth_share":
      return last.hit <= 1 ? "新しい発想が出にくくなった、という声が若手から上がっています。" : "若手と大御所の配分について、理事会で議論が続いています。";
    case "islands":
      return last.pluralism < 0.5
        ? `研究の多様性（pluralism）は ${last.pluralism.toFixed(2)}。分野が一つに寄りつつあります。`
        : `研究の多様性（pluralism）は ${last.pluralism.toFixed(2)} です。`;
  }
}

/**
 * カードを作る。前年に同じ分野を変えていれば、その事実を選択肢文に書く。
 * 「現状維持」は今の θ と同じ選択肢。
 */
export function buildCard(field: ThetaKey, theta: Theta, last?: YearMetrics, prevTheta?: Theta): PolicyCard {
  const def = FIELD_DEFS[field];
  const changedLastYear = prevTheta !== undefined && prevTheta[field] !== theta[field];
  const options: CardOption[] = def.options.map((o, i) => {
    const isCurrent = o.value === theta[field];
    let text = o.text;
    if (isCurrent && changedLastYear) text = `昨年あなたが選んだ制度。続けて効果を見る。 ${o.text}`;
    else if (isCurrent) text = `今の制度のまま続ける。 ${o.text}`;
    else if (changedLastYear && prevTheta && o.value === prevTheta[field]) text = `昨年までの制度に戻す。 ${o.text}`;
    return { key: OPTION_KEYS[i], label: o.label, text, isCurrent };
  });
  return { field, title: def.title, context: contextLine(field, last), options };
}
