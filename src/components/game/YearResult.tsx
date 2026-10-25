import { Button } from "@/components/ui/button";
import { FIELD_DEFS, labelOf } from "@/lib/society/cards";
import type { Choice } from "@/lib/society/record";
import type { YearText } from "@/lib/society/templates";
import type { Persona, SocietyState, Theta, YearMetrics } from "@/lib/society/types";
import { CitationGraph } from "./CitationGraph";
import { Card, Page, SourceNote, YearBadge } from "./Layout";
import { MetricsCharts } from "./MetricsCharts";

const NUMBERS: { key: keyof YearMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: "papers", label: "投稿", fmt: String },
  { key: "accepted", label: "採択", fmt: String },
  { key: "citations", label: "引用", fmt: String },
  { key: "hit", label: "当たり", fmt: String },
  { key: "Gini", label: "Gini", fmt: (v) => v.toFixed(2) },
  { key: "H", label: "H", fmt: (v) => v.toFixed(2) },
  { key: "fraud_rate", label: "fraud", fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "pluralism", label: "多様性", fmt: (v) => v.toFixed(2) },
];

export function YearResult({
  state, personas, theta, choices, text, onNext,
}: {
  state: SocietyState;
  personas: Persona[];
  theta: Theta;
  choices: Choice[];
  text: { value: YearText; source: "llm" | "fallback" } | null;
  onNext: () => void;
}) {
  const m = state.history[state.history.length - 1];
  const isLast = m.year >= 5;
  return (
    <Page>
      <YearBadge year={m.year} />
      <h2 className="mt-2 text-xl font-semibold md:text-2xl">Year {m.year} の結果</h2>

      <Card className="mt-6">
        <h3 className="text-base font-semibold">今年の制度</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {choices.map((c) => (
            <li key={c.field}>
              <span className="text-muted-foreground">{FIELD_DEFS[c.field].title}:</span>{" "}
              <span className="font-bold">{labelOf(c.field, theta[c.field])}</span>
              {c.option === "free" && (
                <span className="block text-xs text-muted-foreground">
                  自由記述「{c.free_text}」→ {c.mapped_option}
                  {c.mapped_by === "llm" ? `（${c.mapped_reason ?? "LLM が判断"}）` : "（LLM に接続できなかったため b）"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <h3 className="text-base font-semibold">この 1 年のできごと</h3>
        {text ? (
          <>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
              {text.value.news.slice(0, 3).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <div className="mt-4 flex flex-col gap-3">
              {text.value.voices.slice(0, 2).map((v, i) => (
                <blockquote key={i} className="border-l-2 border-primary pl-3 text-sm">
                  <p>「{v.text}」</p>
                  <footer className="mt-1 text-xs text-muted-foreground">— {v.name}</footer>
                </blockquote>
              ))}
            </div>
            <SourceNote source={text.source} />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground" role="status">記者が取材しています…</p>
        )}
      </Card>

      <Card className="mt-4">
        <h3 className="text-base font-semibold">指標</h3>
        <dl className="mt-3 grid grid-cols-4 gap-3 text-center">
          {NUMBERS.map((n) => (
            <div key={n.key}>
              <dt className="text-xs text-muted-foreground">{n.label}</dt>
              <dd className="font-mono text-lg font-bold">{n.fmt(Number(m[n.key]))}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <MetricsCharts history={state.history} />
        </div>
      </Card>

      <Card className="mt-4">
        <h3 className="text-base font-semibold">引用のつながり</h3>
        <div className="mt-3">
          <CitationGraph state={state} personas={personas} />
        </div>
      </Card>

      <div className="mt-8 flex justify-end">
        <Button onClick={onNext}>{isLast ? "5 年後の社会を見る" : `Year ${m.year + 1} の制度を決める`}</Button>
      </div>
    </Page>
  );
}
