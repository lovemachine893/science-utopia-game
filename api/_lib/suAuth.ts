// /api/su-llm の認証と日次上限。Supabase の service role で
//   1) Bearer トークンを auth.getUser(token) で検証し、
//   2) public.su_llm_consume でユーザーごとの当日の呼出し回数を 1 つ予約する。
// 鍵はすべて環境変数から読む（値はコードに書かない）。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_DAILY_LIMIT = 60;

export type Gate =
  | { ok: true; userId: string; day: string; calls: number; limit: number; remaining: number; db: SupabaseClient }
  | { ok: false; status: 401 | 429 | 503; body: Record<string, unknown> };

/** 日本時間の日付（YYYY-MM-DD）。上限は日本時間 0 時に戻る。 */
export function jstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 次の日本時間 0 時（ISO 文字列）。 */
export function nextJstMidnight(now = new Date()): string {
  const d = jstDay(now);
  return new Date(Date.parse(`${d}T00:00:00+09:00`) + 24 * 3600_000).toISOString();
}

export function dailyLimit(): number {
  const n = Number(process.env.SU_LLM_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // テストで差し替えた fetch を使えるよう、呼ぶたびに globalThis.fetch を引く
    global: { fetch: (...a: Parameters<typeof fetch>) => fetch(...a) },
  });
}

/** LLM を呼ぶ前に必ず通す。ok:false のときは LLM を呼ばずに status を返す。 */
export async function gate(req: Request, now = new Date()): Promise<Gate> {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, body: { error: "Login required", guest: true } };

  const db = serviceClient();
  if (!db) {
    console.error("su-llm: Supabase is not configured");
    return { ok: false, status: 503, body: { error: "Auth is not configured" } };
  }

  let userId: string | undefined;
  try {
    const { data, error } = await db.auth.getUser(token);
    userId = error ? undefined : data.user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) return { ok: false, status: 401, body: { error: "Invalid or expired session" } };

  const limit = dailyLimit();
  const day = jstDay(now);
  const { data: calls, error } = await db.rpc("su_llm_consume", { p_user_id: userId, p_day: day, p_limit: limit });
  if (error || typeof calls !== "number") {
    console.error("su-llm: usage check failed", error?.message ?? "bad response");
    return { ok: false, status: 503, body: { error: "Usage check failed" } };
  }
  if (calls < 0) {
    return {
      ok: false,
      status: 429,
      body: { error: "Daily limit reached", limit, remaining: 0, reset_at: nextJstMidnight(now) },
    };
  }
  return { ok: true, userId, day, calls, limit, remaining: Math.max(0, limit - calls), db };
}

/** 応答後のトークン加算。失敗してもゲームの応答は止めない。 */
export async function recordTokens(g: Extract<Gate, { ok: true }>, tokensIn: number, tokensOut: number) {
  try {
    const { error } = await g.db.rpc("su_llm_add_tokens", { p_user_id: g.userId, p_day: g.day, p_in: tokensIn, p_out: tokensOut });
    if (error) console.error("su-llm: token record failed", error.message);
  } catch (e) {
    console.error("su-llm: token record failed", e instanceof Error ? e.message : e);
  }
}
