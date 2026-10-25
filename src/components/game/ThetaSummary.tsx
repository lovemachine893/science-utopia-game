import { ALL_FIELDS, FIELD_DEFS, labelOf } from "@/lib/society/cards";
import type { Theta } from "@/lib/society/types";

export function ThetaSummary({ theta, highlight = [] }: { theta: Theta; highlight?: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label="現在の制度">
      {ALL_FIELDS.map((f) => (
        <li
          key={f}
          className={`rounded-full border px-3 py-1 ${highlight.includes(f) ? "border-primary font-bold text-primary" : "text-muted-foreground"}`}
        >
          {FIELD_DEFS[f].title}: {labelOf(f, theta[f])}
        </li>
      ))}
    </ul>
  );
}
