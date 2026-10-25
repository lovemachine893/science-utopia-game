import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ALL_FIELDS, FIELD_DEFS, labelOf } from "@/lib/society/cards";
import { SURVEY_QUESTION, type Survey, type TurnRecord } from "@/lib/society/record";
import { ENDING_LABEL, ENDING_SUMMARY } from "@/lib/society/templates";
import type { EndingType } from "@/lib/society/types";
import { Card, Page, SourceNote } from "./Layout";

const RATINGS = [
  { v: 1, label: "まったく良くない" },
  { v: 2, label: "あまり良くない" },
  { v: 3, label: "どちらとも言えない" },
  { v: 4, label: "まあ良い" },
  { v: 5, label: "とても良い" },
] as const;

export function EndingScreen({
  type, review, turns, onDownload, onRestart,
}: {
  type: EndingType;
  review: { lines: string[]; source: "llm" | "fallback" } | null;
  turns: TurnRecord[];
  onDownload: (survey: Survey) => void;
  onRestart: () => void;
}) {
  const [survey, setSurvey] = useState<Survey>({ rating: null, comment: "" });
  return (
    <Page>
      <p className="font-mono text-xs font-bold tracking-widest text-primary">ENDING</p>
      <h2 className="mt-2 text-2xl font-semibold md:text-3xl">{ENDING_LABEL[type]}</h2>
      <p className="mt-3 text-muted-foreground">{ENDING_SUMMARY[type]}</p>

      <Card className="mt-6">
        <h3 className="text-base font-semibold">講評</h3>
        {review ? (
          <>
            <ol className="mt-2 flex flex-col gap-2 text-sm">
              {review.lines.slice(0, 5).map((l, i) => <li key={i}>{l}</li>)}
            </ol>
            <SourceNote source={review.source} />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground" role="status">講評を書いています…</p>
        )}
      </Card>

      <Card className="mt-4">
        <h3 className="text-base font-semibold">あなたが選んだ制度 θ</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pr-2 font-normal">制度</th>
                {turns.map((t) => <th key={t.year} className="py-1 pr-2 font-normal">Y{t.year}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_FIELDS.map((f) => (
                <tr key={f} className="border-t">
                  <th className="py-1 pr-2 font-bold">{FIELD_DEFS[f].title}</th>
                  {turns.map((t) => {
                    const touched = t.choices.some((c) => c.field === f);
                    return <td key={t.year} className={`py-1 pr-2 ${touched ? "font-bold text-primary" : "text-muted-foreground"}`}>{labelOf(f, t.theta[f])}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">太字はその年に決めた制度です。</p>
        </div>
      </Card>

      <Card className="mt-4">
        <fieldset>
          <legend className="font-serif text-lg font-semibold">{SURVEY_QUESTION}</legend>
          <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={SURVEY_QUESTION}>
            {RATINGS.map((r) => (
              <label key={r.v} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 ${survey.rating === r.v ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="rating" checked={survey.rating === r.v} onChange={() => setSurvey((s) => ({ ...s, rating: r.v }))} className="h-4 w-4 accent-[#1A2B6B]" />
                <span className="font-mono text-xs">{r.v}</span>
                <span className="text-sm">{r.label}</span>
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm">
            ひとこと（任意）
            <input
              type="text"
              maxLength={200}
              value={survey.comment}
              onChange={(e) => setSurvey((s) => ({ ...s, comment: e.target.value }))}
              className="mt-1 min-h-[44px] w-full rounded-lg border bg-background px-3"
            />
          </label>
        </fieldset>
        <p className="mt-4 text-xs text-muted-foreground">
          JSON には制度 θ の系列・年次指標・判定・この回答が入ります。ファイルはこの端末に保存され、どこにも送信されません。
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onRestart}>もう一度育てる</Button>
          <Button onClick={() => onDownload(survey)}>記録を JSON でダウンロード</Button>
        </div>
      </Card>
    </Page>
  );
}
