/**
 * /api/su-llm の呼び出し。失敗・タイムアウト・形の不一致はすべて null を返し、
 * 呼び出し側が同梱テンプレートに切り替える（ゲームは止めない）。
 */
export type LlmTask = "personas" | "map_free" | "year_news" | "ending";

export const usageTotal = { calls: 0, failures: 0, input_tokens: 0, output_tokens: 0 };

export async function callLlm<T>(
  task: LlmTask,
  input: unknown,
  validate: (raw: unknown) => T | null,
  timeoutMs = 30000,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  usageTotal.calls++;
  try {
    const res = await fetch("/api/su-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    usageTotal.input_tokens += data?.usage?.input_tokens ?? 0;
    usageTotal.output_tokens += data?.usage?.output_tokens ?? 0;
    const v = validate(data?.result);
    if (v === null) throw new Error("invalid shape");
    return v;
  } catch {
    usageTotal.failures++;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const isStringArray = (x: unknown, n: number): x is string[] =>
  Array.isArray(x) && x.length >= n && x.slice(0, n).every((s) => typeof s === "string" && s.trim().length > 0);
