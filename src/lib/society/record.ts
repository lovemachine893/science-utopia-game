import type { EndingType, Persona, Theta, ThetaKey, YearMetrics } from "./types";
import type { OptionKey } from "./cards";

export type Source = "llm" | "fallback";

export interface Choice {
  field: ThetaKey;
  option: OptionKey | "free";
  /** 自由記述（option = "free" のとき） */
  free_text?: string;
  /** 自由記述を写した先 */
  mapped_option?: OptionKey;
  mapped_by?: Source;
  mapped_reason?: string;
}

export interface TurnRecord { year: number; theta: Theta; choices: Choice[] }

export interface Survey { rating: 1 | 2 | 3 | 4 | 5 | null; comment: string }

export const SURVEY_QUESTION = "この社会は良い科学でしたか？";

export interface RunRecord {
  schema: "science-utopia/run-v1";
  created_at: string;
  seed: number;
  personas_source: Source;
  personas: Persona[];
  theta_initial: Theta;
  theta_series: TurnRecord[];
  metrics: YearMetrics[];
  ending: { type: EndingType; label: string; review: string[]; review_source: Source };
  survey: { question: string; rating: Survey["rating"]; comment: string };
}

export function downloadJson(record: RunRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `science-utopia-${record.seed}-${record.created_at.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
