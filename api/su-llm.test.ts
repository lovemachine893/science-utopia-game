import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, buildPrompt, parseJsonLoose } from "./su-llm";

const req = (body: unknown) =>
  new Request("http://x/api/su-llm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("api/su-llm", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("鍵が無ければ 500（画面側がテンプレートに切り替える）", async () => {
    vi.stubEnv("AZURE_LUNA_API_KEY", "");
    const res = await POST(req({ task: "year_news", input: {} }));
    expect(res.status).toBe(500);
  });
  it("未知の task は 400", async () => {
    const res = await POST(req({ task: "free_prompt", input: "x" }));
    expect(res.status).toBe(400);
  });
  it("AZURE_LUNA_* を読み、Responses API の output から JSON を取り出す", async () => {
    vi.stubEnv("AZURE_LUNA_API_KEY", "test-key");
    vi.stubEnv("AZURE_LUNA_ENDPOINT", "https://example.invalid/responses");
    vi.stubEnv("AZURE_LUNA_MODEL", "m-test");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output: [{ type: "message", content: [{ text: '```json\n{"choice":"c","reason":"r"}\n```' }] }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ task: "map_free", input: { text: "みんなに配る" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toEqual({ choice: "c", reason: "r" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.invalid/responses");
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe("m-test");
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect((init.headers as Record<string, string>)["api-key"]).toBe("test-key");
  });
  it("入力は長さを切る", () => {
    expect(buildPrompt("map_free", { text: "x".repeat(20000) }).length).toBeLessThan(7000);
  });
  it("前後に文があっても JSON を拾う", () => {
    expect(parseJsonLoose('はい。{"a":1} 以上')).toEqual({ a: 1 });
  });
});
