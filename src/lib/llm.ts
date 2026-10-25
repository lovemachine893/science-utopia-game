/**
 * /api/su-llm の呼び出し。ログインしているときだけ Supabase のアクセストークンを
 * Authorization: Bearer で付けて呼ぶ。ゲスト（未ログイン・Supabase 未設定）は呼ばない。
 * 失敗・タイムアウト・形の不一致・401・429 はすべて null を返し、
 * 呼び出し側が同梱テンプレートに切り替える（ゲームは止めない）。
 */
import { getAccessToken } from "./supabase";

export type LlmTask = "personas" | "map_free" | "year_news" | "ending";

export const usageTotal = { calls: 0, failures: 0, input_tokens: 0, output_tokens: 0 };

/** サーバーが返した今日の残り回数。429 を受けたら limitReached=true。 */
export const llmQuota: { limit: number | null; remaining: number | null; limitReached: boolean } = {
  limit: null,
  remaining: null,
  limitReached: false,
};

export async function callLlm<T>(
  task: LlmTask,
  input: unknown,
  validate: (raw: unknown) => T | null,
  timeoutMs = 30000,
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) return null; // ゲスト: LLM は使わない
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  usageTotal.calls++;
  try {
    const res = await fetch("/api/su-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, input }),
      signal: ctrl.signal,
    });
    if (res.status === 429) {
      const d = await res.json().catch(() => ({}));
      llmQuota.limitReached = true;
      llmQuota.remaining = 0;
      if (typeof d?.limit === "number") llmQuota.limit = d.limit;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (typeof data?.remaining === "number") llmQuota.remaining = data.remaining;
    if (typeof data?.limit === "number") llmQuota.limit = data.limit;
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
