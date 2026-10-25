/**
 * phase 2 の差し込み口（未実装）。認証・Leaderboard・課金・日次上限は今は何もしない。
 * 実装するときはここの型を保ったまま中身を差し替える。
 */
import type { RunRecord } from "./society/record";

export interface PlayerSession { userId: string | null; signedIn: boolean }
export interface LeaderboardEntry { seed: number; ending: RunRecord["ending"]["type"]; hits: number; createdAt: string }

export function useSession(): PlayerSession {
  return { userId: null, signedIn: false };
}

export async function submitToLeaderboard(_record: RunRecord): Promise<void> {
  /* phase 2 */
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return [];
}

export function useDailyLimit(): { remaining: number | null } {
  return { remaining: null };
}
