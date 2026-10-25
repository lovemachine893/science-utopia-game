/**
 * Supabase クライアント（ログイン用）。VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY が
 * 無いビルドでは null になり、全員ゲスト（LLM を使わずテンプレートで遊ぶ）として動く。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const authAvailable = supabase !== null;

/** 現在のアクセストークン。未ログイン・未設定なら null。 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
