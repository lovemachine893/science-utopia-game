import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, buildPrompt, parseJsonLoose } from "./su-llm";
import { jstDay, nextJstMidnight } from "./_lib/suAuth";

const req = (body: unknown, token?: string) =>
  new Request("http://x/api/su-llm", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const LLM_URL = "https://example.invalid/responses";
const SB_URL = "https://sb.example.invalid";
const USER_ID = "00000000-0000-4000-8000-000000000001";

type Opts = { validToken?: string; consume?: number; consumeError?: boolean };

/** Supabase（auth / rpc）と LLM を URL で振り分けるモック */
function backend({ validToken = "good-token", consume = 1, consumeError = false }: Opts = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const headers = new Headers(init.headers);
    if (url.startsWith(`${SB_URL}/auth/v1/user`)) {
      if (headers.get("authorization") === `Bearer ${validToken}`) {
        return new Response(JSON.stringify({ id: USER_ID, aud: "authenticated", email: "u@example.invalid" }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 401, msg: "invalid JWT" }), { status: 401 });
    }
    if (url.startsWith(`${SB_URL}/rest/v1/rpc/su_llm_consume`)) {
      if (consumeError) return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
      return new Response(JSON.stringify(consume), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith(`${SB_URL}/rest/v1/rpc/su_llm_add_tokens`)) return new Response(null, { status: 204 });
    if (url === LLM_URL) {
      return new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ text: '```json\n{"choice":"c","reason":"r"}\n```' }] }],
          usage: { input_tokens: 11, output_tokens: 7 },
        }),
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const llmCalls = () => calls.filter((c) => c.url === LLM_URL);
  const rpc = (name: string) => calls.filter((c) => c.url.includes(`/rpc/${name}`));
  return { fetchMock, calls, llmCalls, rpc };
}

describe("api/su-llm", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_LUNA_API_KEY", "test-key");
    vi.stubEnv("AZURE_LUNA_ENDPOINT", LLM_URL);
    vi.stubEnv("AZURE_LUNA_MODEL", "m-test");
    vi.stubEnv("SUPABASE_URL", SB_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
    vi.stubEnv("SU_LLM_DAILY_LIMIT", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Bearer が無ければ 401 で、Supabase も LLM も呼ばない", async () => {
    const b = backend();
    const res = await POST(req({ task: "map_free", input: { text: "x" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).guest).toBe(true);
    expect(b.fetchMock).not.toHaveBeenCalled();
  });

  it("検証できないトークンは 401 で、LLM を呼ばず回数も数えない", async () => {
    const b = backend();
    const res = await POST(req({ task: "map_free", input: {} }, "forged-token"));
    expect(res.status).toBe(401);
    expect(b.llmCalls()).toHaveLength(0);
    expect(b.rpc("su_llm_consume")).toHaveLength(0);
  });

  it("Supabase の env が無ければ 503 で LLM を呼ばない（ゲスト扱いの本番を壊さない）", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const b = backend();
    const res = await POST(req({ task: "map_free", input: {} }, "good-token"));
    expect(res.status).toBe(503);
    expect(b.fetchMock).not.toHaveBeenCalled();
  });

  it("日次上限を超えると 429 と残り 0 回・リセット時刻を返し、LLM を呼ばない", async () => {
    const b = backend({ consume: -1 });
    const res = await POST(req({ task: "year_news", input: {} }, "good-token"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ limit: 60, remaining: 0 });
    expect(typeof body.reset_at).toBe("string");
    expect(b.llmCalls()).toHaveLength(0);
    const sent = JSON.parse(String(b.rpc("su_llm_consume")[0].init.body));
    expect(sent).toEqual({ p_user_id: USER_ID, p_day: jstDay(), p_limit: 60 });
  });

  it("SU_LLM_DAILY_LIMIT で上限を変えられる", async () => {
    vi.stubEnv("SU_LLM_DAILY_LIMIT", "5");
    const b = backend({ consume: 5 });
    const res = await POST(req({ task: "map_free", input: {} }, "good-token"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ limit: 5, remaining: 0 });
    expect(JSON.parse(String(b.rpc("su_llm_consume")[0].init.body)).p_limit).toBe(5);
  });

  it("回数の記録に失敗したら 503 で LLM を呼ばない", async () => {
    const b = backend({ consumeError: true });
    const res = await POST(req({ task: "map_free", input: {} }, "good-token"));
    expect(res.status).toBe(503);
    expect(b.llmCalls()).toHaveLength(0);
  });

  it("正常: service role でトークンを検証し、回数を予約して LLM を呼び、トークン数を記録する", async () => {
    const b = backend({ consume: 3 });
    const res = await POST(req({ task: "map_free", input: { text: "みんなに配る" } }, "good-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({ choice: "c", reason: "r" });
    expect(body).toMatchObject({ limit: 60, remaining: 57 });
    // auth.getUser(token): apikey は service role、Authorization はユーザーのトークン
    const auth = b.calls.find((c) => c.url.includes("/auth/v1/user"))!;
    expect(new Headers(auth.init.headers).get("apikey")).toBe("service-role-test");
    expect(new Headers(auth.init.headers).get("authorization")).toBe("Bearer good-token");
    // 回数の予約は service role で
    expect(new Headers(b.rpc("su_llm_consume")[0].init.headers).get("authorization")).toBe("Bearer service-role-test");
    // LLM は 1 回、AZURE_LUNA_* で
    expect(b.llmCalls()).toHaveLength(1);
    const llm = b.llmCalls()[0];
    const sent = JSON.parse(String(llm.init.body));
    expect(sent.model).toBe("m-test");
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect((llm.init.headers as Record<string, string>)["api-key"]).toBe("test-key");
    // トークン数の加算
    expect(JSON.parse(String(b.rpc("su_llm_add_tokens")[0].init.body))).toEqual({ p_user_id: USER_ID, p_day: jstDay(), p_in: 11, p_out: 7 });
  });

  it("鍵が無ければ 500（画面側がテンプレートに切り替える）", async () => {
    vi.stubEnv("AZURE_LUNA_API_KEY", "");
    backend();
    const res = await POST(req({ task: "year_news", input: {} }, "good-token"));
    expect(res.status).toBe(500);
  });

  it("未知の task は 400（回数を消費しない）", async () => {
    const b = backend();
    const res = await POST(req({ task: "free_prompt", input: "x" }, "good-token"));
    expect(res.status).toBe(400);
    expect(b.fetchMock).not.toHaveBeenCalled();
  });

  it("日本時間で日付を切り替える", () => {
    expect(jstDay(new Date("2026-10-25T14:59:59Z"))).toBe("2026-10-25");
    expect(jstDay(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-26");
    expect(nextJstMidnight(new Date("2026-10-25T03:00:00Z"))).toBe("2026-10-25T15:00:00.000Z");
  });

  it("入力は長さを切る", () => {
    expect(buildPrompt("map_free", { text: "x".repeat(20000) }).length).toBeLessThan(7000);
  });

  it("前後に文があっても JSON を拾う", () => {
    expect(parseJsonLoose('はい。{"a":1} 以上')).toEqual({ a: 1 });
  });
});
