/**
 * phase 2 の差し込み口（未実装）。Leaderboard・課金は今は何もしない。
 * 認証は src/lib/auth.ts、LLM の日次上限は api/_lib/suAuth.ts に実装済み。
 * 実装するときはここの型を保ったまま中身を差し替える。
 */
import type { RunRecord } from "./society/record";

export interface LeaderboardEntry { seed: number; ending: RunRecord["ending"]["type"]; hits: number; createdAt: string }

export async function submitToLeaderboard(_record: RunRecord): Promise<void> {
  /* phase 2 */
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return [];
}
