import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OptionKey, PolicyCard } from "@/lib/society/cards";
import type { Theta, ThetaKey } from "@/lib/society/types";
import { Card, Page, YearBadge } from "./Layout";
import { ThetaSummary } from "./ThetaSummary";

export interface DraftChoice { option: OptionKey | "free"; freeText: string }

function initialDraft(cards: PolicyCard[]): Record<string, DraftChoice> {
  const d: Record<string, DraftChoice> = {};
  for (const c of cards) d[c.field] = { option: c.options.find((o) => o.isCurrent)?.key ?? "b", freeText: "" };
  return d;
}

export function TurnScreen({
  year, theta, cards, busy, onSubmit,
}: {
  year: number;
  theta: Theta;
  cards: PolicyCard[];
  busy: boolean;
  onSubmit: (choices: Record<ThetaKey, DraftChoice>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, DraftChoice>>(() => initialDraft(cards));
  const set = (field: string, patch: Partial<DraftChoice>) => setDraft((d) => ({ ...d, [field]: { ...d[field], ...patch } }));
  const invalid = cards.some((c) => draft[c.field]?.option === "free" && !draft[c.field].freeText.trim());

  return (
    <Page>
      <YearBadge year={year} />
      <h2 className="mt-2 text-xl font-semibold md:text-2xl">今年決める 3 つの制度</h2>
      <div className="mt-4">
        <ThetaSummary theta={theta} highlight={cards.map((c) => c.field)} />
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {cards.map((card) => {
          const d = draft[card.field];
          const name = `card-${card.field}`;
          return (
            <Card key={card.field}>
              <fieldset>
                <legend className="font-serif text-lg font-semibold">{card.title}</legend>
                <p className="mt-1 text-sm text-muted-foreground">{card.context}</p>
                <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={card.title}>
                  {card.options.map((o) => {
                    const selected = d.option === o.key;
                    return (
                      <label
                        key={o.key}
                        className={`flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-primary bg-primary/5" : "hover:border-foreground/40"}`}
                      >
                        <input
                          type="radio"
                          name={name}
                          value={o.key}
                          checked={selected}
                          onChange={() => set(card.field, { option: o.key })}
                          className="mt-1 h-4 w-4 accent-[#1A2B6B]"
                        />
                        <span className="text-sm">
                          <span className="font-mono text-xs text-muted-foreground">{o.key}.</span>{" "}
                          <span className="font-bold">{o.label}</span>
                          {o.isCurrent && <span className="ml-2 rounded border border-primary px-1.5 text-xs text-primary">現状維持</span>}
                          {selected && <span className="ml-2 text-xs font-bold text-primary">✓ 選択中</span>}
                          <span className="mt-1 block text-muted-foreground">{o.text}</span>
                        </span>
                      </label>
                    );
                  })}
                  <label className={`flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 ${d.option === "free" ? "border-primary bg-primary/5" : "hover:border-foreground/40"}`}>
                    <input
                      type="radio"
                      name={name}
                      value="free"
                      checked={d.option === "free"}
                      onChange={() => set(card.field, { option: "free" })}
                      className="mt-1 h-4 w-4 accent-[#1A2B6B]"
                    />
                    <span className="w-full text-sm">
                      <span className="font-bold">自由に書く</span>
                      <span className="mt-1 block text-muted-foreground">あなたの言葉を、最も近い制度に置き換えます。</span>
                      {d.option === "free" && (
                        <input
                          type="text"
                          maxLength={200}
                          value={d.freeText}
                          onChange={(e) => set(card.field, { freeText: e.target.value })}
                          aria-label={`${card.title}の自由記述`}
                          placeholder="例: 若手にも少しずつ配りたい"
                          className="mt-2 min-h-[44px] w-full rounded-lg border bg-background px-3 text-sm"
                        />
                      )}
                    </span>
                  </label>
                </div>
              </fieldset>
            </Card>
          );
        })}
      </div>
      <div className="mt-8 flex items-center justify-end gap-4">
        {busy && <p className="text-sm text-muted-foreground" role="status">自由記述を制度に置き換えています…</p>}
        <Button disabled={busy || invalid} onClick={() => onSubmit(draft as Record<ThetaKey, DraftChoice>)}>
          この制度で 1 年を進める
        </Button>
      </div>
    </Page>
  );
}
