import type { EndingType, Persona, Theta, YearEvents, YearMetrics } from "./types";
import { FIELDS } from "./model";
import { labelOf } from "./cards";

export const ENDING_LABEL: Record<EndingType, string> = {
  utopia: "ユートピア",
  monoculture: "モノカルチャー",
  cartel: "引用カルテル",
  depletion: "枯渇",
};

export const ENDING_SUMMARY: Record<EndingType, string> = {
  utopia: "多様な問いが並び、正しい成果が正当に評価される社会になりました。",
  monoculture: "全員が同じ方向を向き、別の問いを立てる人がいなくなりました。",
  cartel: "注目と引用がごく一部に集まり、互いを引用し合う輪ができました。",
  depletion: "研究者が去り、採択される論文もわずかになりました。",
};

export interface YearText { news: string[]; voices: { name: string; text: string }[] }

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function yearNewsTemplate(
  m: YearMetrics, prev: YearMetrics | undefined, theta: Theta, personas: Persona[], ev: YearEvents,
): YearText {
  const news: string[] = [];
  news.push(
    prev
      ? `Year ${m.year}: 投稿は ${m.papers} 本（前年 ${prev.papers} 本）、採択は ${m.accepted} 本でした。`
      : `Year ${m.year}: 最初の 1 年、${m.papers} 本の投稿から ${m.accepted} 本が採択されました。`,
  );
  if (ev.caught > 0) news.push(`査読と追試で ${ev.caught} 件の再現できない結果が見つかりました（制度: ${labelOf("verify", theta.verify)}）。`);
  else if (m.fraud_rate >= 0.15) news.push(`採択論文の ${pct(m.fraud_rate)} が、のちに再現できないと分かりました。`);
  else news.push(`採択論文のうち再現できないものは ${pct(m.fraud_rate)} にとどまりました。`);
  const top = personas[ev.topCited[0]];
  if (m.Gini >= 0.6 && top) news.push(`${top.name} の研究室に引用が集中しています（Gini ${m.Gini.toFixed(2)}）。`);
  else if (ev.switched > 0) news.push(`${ev.switched} 人の研究者が分野を移りました（多様性 ${m.pluralism.toFixed(2)}）。`);
  else news.push(`「当たり」と呼べる成果は ${m.hit} 本でした。`);

  const young = personas.find((p) => p.career === "若手" && !ev.topCited.includes(p.id));
  const elder = top ?? personas[0];
  const voices = [
    { name: elder.name, text: `${FIELDS[elder.field]}の仲間と議論が尽きない一年でした。評価が${labelOf("incentive", theta.incentive)}である限り、わたしたちの書き方も変わります。` },
    {
      name: (young ?? personas[1]).name,
      text: theta.funding_frac >= 1
        ? "研究費が届いたので、ずっと温めていた問いに手をつけられました。"
        : "研究費の審査に通るか、毎年が勝負です。安全な題目を選びたくなります。",
    },
  ];
  return { news: news.slice(0, 3), voices };
}

export function endingTemplate(type: EndingType, history: YearMetrics[], thetas: Theta[]): string[] {
  const first = history[0];
  const last = history[history.length - 1];
  const th = thetas[thetas.length - 1];
  const hits = history.reduce((a, m) => a + m.hit, 0);
  const next: Record<EndingType, string> = {
    utopia: "次は採択率を変えて、この均衡がどこまで保てるかを試してみてください。",
    monoculture: "次は「多島＋交流」で、分野が残るかどうかを確かめてみてください。",
    cartel: "次は資金の均等配分か再現性評価で、引用の偏りがほどけるかを見てください。",
    depletion: "次は資金を広く配り、採択率を少し上げて、人が残るかどうかを見てください。",
  };
  return [
    `5 年後、この社会は「${ENDING_LABEL[type]}」になりました。${ENDING_SUMMARY[type]}`,
    `投稿は ${first.papers} 本から ${last.papers} 本へ、5 年間の「当たり」は合計 ${hits} 本でした。`,
    `最後の年の資金配分は「${labelOf("funding_frac", th.funding_frac)}」、評価指標は「${labelOf("incentive", th.incentive)}」でした。`,
    `被引用の偏り（Gini）は ${last.Gini.toFixed(2)}、多様性は ${last.pluralism.toFixed(2)}、再現できない採択は ${pct(last.fraud_rate)} でした。`,
    next[type],
  ];
}
