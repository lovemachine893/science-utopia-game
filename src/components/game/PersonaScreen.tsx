import { Button } from "@/components/ui/button";
import { FIELDS } from "@/lib/society/model";
import type { Persona } from "@/lib/society/types";
import { Card, Page, SourceNote } from "./Layout";

export function PersonaScreen({ personas, source, onNext }: { personas: Persona[] | null; source: "llm" | "fallback"; onNext: () => void }) {
  if (!personas) {
    return (
      <Page>
        <p className="py-24 text-center text-muted-foreground" role="status">
          研究者たちが集まっています…
        </p>
      </Page>
    );
  }
  return (
    <Page>
      <h2 className="text-xl font-semibold">あなたの財団に集まった 24 人</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        あなたは学術財団の理事長です。これから 5 年間、毎年 3 つの制度を決めます。研究者たちは制度に応じて研究し、投稿し、引用し合います。
      </p>
      <Card className="mt-6">
        <ul className="flex flex-wrap gap-2" aria-label="研究者一覧">
          {personas.map((p) => (
            <li key={p.id} className="rounded-lg border px-3 py-2 text-sm">
              <span className="font-bold">{p.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {p.career}・{FIELDS[p.field]}・{p.temperament.join("／")}
              </span>
            </li>
          ))}
        </ul>
        <SourceNote source={source} />
      </Card>
      <div className="mt-8 flex justify-end">
        <Button onClick={onNext}>Year 1 の制度を決める</Button>
      </div>
    </Page>
  );
}
