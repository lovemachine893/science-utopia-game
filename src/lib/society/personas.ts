import type { Career, Persona } from "./types";
import { N_FIELDS } from "./model";

/** LLM 不通時に使う固定の 24 人（架空の AI 研究者）。 */
const RAW: [string, number, [string, string, string], Career, number][] = [
  ["朝霧 レン", 0, ["慎重", "粘り強い", "皮肉屋"], "大御所", 0.85],
  ["Ilse Varga", 1, ["厳密", "寡黙", "頑固"], "大御所", 0.8],
  ["鳴海 透", 2, ["野心的", "社交的", "せっかち"], "大御所", 0.9],
  ["Tomas Okafor", 3, ["実直", "職人肌", "楽観的"], "大御所", 0.7],
  ["白石 ユイ", 4, ["誠実", "疑い深い", "几帳面"], "大御所", 0.75],
  ["Priya Raman", 5, ["好奇心旺盛", "越境的", "早口"], "大御所", 0.8],
  ["九条 カイ", 0, ["論理的", "負けず嫌い", "多作"], "中堅", 0.55],
  ["Mara Lindqvist", 1, ["内省的", "丁寧", "完璧主義"], "中堅", 0.5],
  ["陸奥 サラ", 2, ["流行に敏感", "大胆", "器用"], "中堅", 0.6],
  ["Diego Santos", 3, ["手を動かす", "陽気", "雑"], "中堅", 0.45],
  ["芹沢 ノア", 4, ["倫理的", "粘着質", "冷静"], "中堅", 0.5],
  ["Hana Kowalski", 5, ["学際的", "温厚", "計画的"], "中堅", 0.5],
  ["真壁 リク", 2, ["戦略的", "目立ちたがり", "速い"], "中堅", 0.55],
  ["Aiko Brennan", 0, ["静か", "深い", "遅筆"], "中堅", 0.4],
  ["日向 ソラ", 1, ["素直", "勤勉", "心配性"], "若手", 0.25],
  ["Leon Duarte", 2, ["挑戦的", "楽天的", "飽きっぽい"], "若手", 0.3],
  ["氷室 ミオ", 3, ["独創的", "人見知り", "夜型"], "若手", 0.2],
  ["Nadia Haddad", 4, ["正義感", "率直", "議論好き"], "若手", 0.25],
  ["桐生 アオイ", 5, ["好奇心旺盛", "散漫", "人懐こい"], "若手", 0.2],
  ["Felix Moreau", 0, ["反骨", "ひらめき型", "雑多"], "若手", 0.15],
  ["灯 ハルカ", 1, ["粘り強い", "控えめ", "誠実"], "若手", 0.2],
  ["Kwame Asante", 3, ["実験好き", "忍耐強い", "朗らか"], "若手", 0.25],
  ["瀬名 ユウ", 4, ["疑い深い", "几帳面", "皮肉屋"], "若手", 0.3],
  ["Sofia Petrova", 5, ["越境的", "野心的", "多弁"], "若手", 0.2],
];

export const FALLBACK_PERSONAS: Persona[] = RAW.map(([name, field, temperament, career, reputation], id) => ({
  id, name, field, temperament, career, reputation,
}));

const CAREERS: Career[] = ["若手", "中堅", "大御所"];

/** LLM 出力を検証して 24 人に整える。形が合わなければ null。 */
export function sanitizePersonas(raw: unknown, n = 24): Persona[] | null {
  if (!Array.isArray(raw) || raw.length < n) return null;
  const out: Persona[] = [];
  for (let i = 0; i < n; i++) {
    const r = raw[i] as Record<string, unknown>;
    if (!r || typeof r.name !== "string" || !r.name.trim()) return null;
    const field = Number(r.field);
    const t = Array.isArray(r.temperament) ? r.temperament.map(String) : [];
    const career = CAREERS.includes(r.career as Career) ? (r.career as Career) : FALLBACK_PERSONAS[i].career;
    const rep = Number(r.reputation);
    out.push({
      id: i,
      name: r.name.trim().slice(0, 24),
      field: Number.isFinite(field) ? ((Math.round(field) % N_FIELDS) + N_FIELDS) % N_FIELDS : FALLBACK_PERSONAS[i].field,
      temperament: [t[0] ?? "—", t[1] ?? "—", t[2] ?? "—"].map((x) => x.slice(0, 12)) as [string, string, string],
      career,
      reputation: Number.isFinite(rep) ? Math.max(0, Math.min(1, rep)) : FALLBACK_PERSONAS[i].reputation,
    });
  }
  return out;
}
