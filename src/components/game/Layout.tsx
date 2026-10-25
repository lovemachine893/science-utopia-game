import type { ReactNode } from "react";
import { llmQuota } from "@/lib/llm";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? "max-w-[880px]" : "max-w-[720px]"} px-6 py-10 md:px-10`}>{children}</main>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-card p-6 shadow-sm ${className}`}>{children}</section>;
}

export function YearBadge({ year }: { year: number }) {
  return (
    <p className="font-mono text-xs font-bold tracking-widest text-primary">
      YEAR {year} / 5
    </p>
  );
}

export function SourceNote({ source }: { source: "llm" | "fallback" }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {source === "llm" ? "文章: LLM が生成" : `文章: 同梱テンプレート（${fallbackReason()}）`}
    </p>
  );
}

/** テンプレートに切り替えた理由の表示 */
export function fallbackReason(): string {
  return llmQuota.limitReached ? "今日の LLM 利用上限に達したため" : "ゲスト、または LLM に接続できなかったため";
}
