import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const token = { value: null as string | null };
vi.mock("./supabase", () => ({ getAccessToken: async () => token.value, supabase: null, authAvailable: false }));

import { callLlm, llmQuota } from "./llm";

const ok = (x: unknown) => x as { choice: string };

describe("callLlm", () => {
  beforeEach(() => {
    token.value = null;
    llmQuota.limitReached = false;
    llmQuota.remaining = null;
    llmQuota.limit = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ゲスト（トークン無し）は fetch せず null", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await callLlm("map_free", {}, ok)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("ログイン中は Authorization: Bearer を付け、残り回数を覚える", async () => {
    token.value = "tok-1";
    const f = vi.fn(async () => new Response(JSON.stringify({ result: { choice: "a" }, limit: 60, remaining: 59 })));
    vi.stubGlobal("fetch", f);
    expect(await callLlm("map_free", {}, ok)).toEqual({ choice: "a" });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(llmQuota).toMatchObject({ limit: 60, remaining: 59, limitReached: false });
  });

  it("429 は null（テンプレートへ）で、上限到達を覚える", async () => {
    token.value = "tok-1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Daily limit reached", limit: 60, remaining: 0 }), { status: 429 })));
    expect(await callLlm("year_news", {}, ok)).toBeNull();
    expect(llmQuota).toMatchObject({ limit: 60, remaining: 0, limitReached: true });
  });

  it("401 は null（テンプレートへ）", async () => {
    token.value = "expired";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await callLlm("ending", {}, ok)).toBeNull();
    expect(llmQuota.limitReached).toBe(false);
  });
});
