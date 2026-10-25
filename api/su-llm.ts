// Vercel Function（Node）。Science Utopia の文章生成をまとめて受け持つ。
// LLM は文章だけを書く。数値モデル（src/lib/society/model.ts）には関与しない。
// ログイン（Supabase Auth）したユーザーだけが使える。Bearer が無い・検証できないと 401、
// 1 日の上限（既定 60 回）を超えると 429。どちらも LLM は呼ばない（api/_lib/suAuth.ts）。
// 失敗時は 4xx/5xx を返し、画面側（src/lib/llm.ts）が同梱テンプレートに切り替える。
import { gate, recordTokens } from "./_lib/suAuth.js";

export const config = { maxDuration: 60 };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "gpt-6-luna";

export type Task = "personas" | "map_free" | "year_news" | "ending";
const TASKS: Task[] = ["personas", "map_free", "year_news", "ending"];
const MAX_TOKENS: Record<Task, number> = { personas: 4000, map_free: 400, year_news: 1200, ending: 1200 };
const MAX_INPUT_CHARS = 6000;

const WORLD =
  "あなたは架空の AI 研究者社会を描く語り手です。プレイヤーは学術財団の理事長で、研究制度を設計しています。" +
  "実在の人物・機関・論文の名前は出さないでください。差別的・攻撃的な表現は使わないでください。" +
  "出力は指定された JSON オブジェクト 1 つだけにしてください。説明文やコードフェンスは不要です。";

export function buildPrompt(task: Task, input: unknown): string {
  const data = JSON.stringify(input ?? {}).slice(0, MAX_INPUT_CHARS);
  switch (task) {
    case "personas":
      return `次の条件で AI 研究者 24 人を作ってください。条件: ${data}
分野 field は 0〜5 の整数（0 推論・計画, 1 学習理論, 2 生成モデル, 3 ロボティクス, 4 AI 安全性, 5 科学のための AI）で、各分野 4 人ずつ。
career は "若手" 10 人・"中堅" 8 人・"大御所" 6 人。reputation は 0〜1（大御所ほど高い）。
name は架空の名前（日本語名と各国の名前を混ぜる、24 文字以内）。temperament は気質を表す日本語の 3 語。
形式: {"personas":[{"name":"...","field":0,"temperament":["...","...","..."],"career":"若手","reputation":0.2}, ...]}`;
    case "map_free":
      return `理事長が制度カードに自由記述で答えました。最も近い選択肢を a/b/c から 1 つ選んでください。
カードと回答: ${data}
形式: {"choice":"a"|"b"|"c","reason":"30 字以内の理由"}`;
    case "year_news":
      return `この 1 年の研究社会の出来事を書いてください。数値はシミュレーション結果で、変えてはいけません。
データ: ${data}
news は 3 行（各 60 字以内、新聞の見出し風ではなく短い記事の一文）。voices は研究者 2 人の声（データの researchers から選び、name はそのまま、text は 80 字以内の一人称）。
形式: {"news":["...","...","..."],"voices":[{"name":"...","text":"..."},{"name":"...","text":"..."}]}`;
    case "ending":
      return `5 年間の制度設計の結果、この研究社会は「${String((input as { label?: string })?.label ?? "")}」になりました。理事長への講評を書いてください。
データ: ${data}
review は 5 行（各 70 字以内）。1 行目で何が起きたか、2〜4 行目で制度と結果のつながり、5 行目で次に試すとよい制度を書く。断定しすぎず、モデルの中の話であることを踏まえる。
形式: {"review":["...","...","...","...","..."]}`;
  }
}

export function parseJsonLoose(content: string): unknown {
  let s = content.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("LLM output is not JSON");
  }
}

async function complete(prompt: string, maxTokens: number) {
  const key = process.env.AZURE_LUNA_API_KEY;
  if (!key) throw new Error("AZURE_LUNA_API_KEY is not set");
  const url = process.env.AZURE_LUNA_ENDPOINT;
  if (!url) throw new Error("AZURE_LUNA_ENDPOINT is not set");
  const model = process.env.AZURE_LUNA_MODEL || DEFAULT_MODEL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: WORLD },
        { role: "user", content: prompt },
      ],
      max_output_tokens: maxTokens,
      reasoning: { effort: "low" },
    }),
  });
  if (!res.ok) throw new Error(`LLM error [${res.status}]`);
  const data = await res.json();
  let content: string = data.output_text ?? "";
  if (!content && Array.isArray(data.output)) {
    for (const o of data.output) for (const c of o?.content ?? []) content += c?.text ?? "";
  }
  if (!content) throw new Error("LLM returned no content");
  return {
    content,
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: { task?: string; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const task = body.task as Task;
  if (!TASKS.includes(task)) return json({ error: "Unknown task" }, 400);
  const g = await gate(req);
  if (!g.ok) return json(g.body, g.status);
  try {
    const { content, usage } = await complete(buildPrompt(task, body.input), MAX_TOKENS[task]);
    await recordTokens(g, usage.input_tokens, usage.output_tokens);
    const parsed = parseJsonLoose(content);
    return json({ result: parsed, usage, limit: g.limit, remaining: g.remaining });
  } catch (e) {
    console.error("su-llm error:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
}

export const POST = handler;
export const OPTIONS = handler;
