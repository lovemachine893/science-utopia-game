# Science Utopia

**あなたの考える良い科学を育ててください。**

研究制度を設計して、AI 研究者 24 人の社会が 5 年でどう育つかを見るブラウザゲームです。
プレイヤーは学術財団の理事長です。毎年 6 分野の制度（資金配分・採択率・評価指標・検証義務・人材・多元性）のうち 3 つを決めると、数値モデルが 1 年分の投稿・査読・引用・資金・分野の移動を計算します。5 年後の社会は「ユートピア」「モノカルチャー」「引用カルテル」「枯渇」のどれかになります。

## 研究との関係

このゲームは、LLM 研究者の集団を制度 θ のもとで走らせて科学社会の応答を測る研究（実験基盤: [SUTO, arXiv:2610.01257](https://arxiv.org/abs/2610.01257)）を、別の形で見せるものです。

- 研究では θ を**スイープ**して応答 τ_θ を測ります。
- ゲームでは**プレイヤーが** θ を 1 年ずつ選び、同じ τ_θ の応答を見ます。

同じ関数の呼び方が違うだけです。指標名（`papers` `accepted` `citations` `Gini` `H` `hit` `fraud_rate` `pluralism`）も SUTO に合わせています。
ただし、ゲームの τ_θ はブラウザで 1 秒以内に動く小さなおもちゃのモデルで、SUTO の LLM 研究者そのものではありません。式・定数・方向性テストは [docs/model.md](docs/model.md) にあります。

## 遊び方

1. タイトルで「はじめる」を押すと、LLM が研究者 24 人（名前・分野・気質・初期評判）を作ります。
2. Year 1〜5 の各年で、制度カード 3 枚それぞれに a/b/c を選ぶか、自由に書きます。自由記述は LLM が最も近い選択肢に置き換えます。
3. 年次結果で、指標の推移・研究者どうしの引用グラフ・その年のニュースと研究者の声を見ます。
4. 5 年後にエンディングと講評が出ます。
5. 「この社会は良い科学でしたか？」に答え、制度 θ の系列・年次指標・判定・回答を 1 つの JSON でダウンロードできます（JSON は端末に保存されるだけで、どこにも送信されません）。

URL パラメータ: `?seed=123` で乱数の種を固定、`?offline=1` で LLM を呼ばずに同梱テンプレートで遊べます。

## LLM とログイン

文章（研究者のペルソナ、自由記述の置き換え、年次ニュース、講評）は Vercel Function `api/su-llm.ts` が Azure OpenAI の Responses API で生成します。**数値には関与しません。**

- **ゲスト（未ログイン）**: LLM は使いません。同梱の固定 24 人とテンプレート文で最後まで遊べます（自由記述は b 扱い）。JSON ダウンロードもできます。
- **ログイン**: Supabase Auth のメール magic link でログインします（メールに 6 桁のコードがあればそれでも可）。ログイン中は画面が Supabase のアクセストークンを `Authorization: Bearer` で `/api/su-llm` に付けます。
- `/api/su-llm` は Bearer が無い・検証できないと **401**（LLM を呼ばない）。トークンは service role で `auth.getUser(token)` 相当（`/auth/v1/user`）で検証します。
- 乱用防止のため、ユーザーごとに **1 日 60 回**（日本時間 0 時に戻る。1 ゲームは約 32 回）。超えると **429** と `remaining: 0`・`reset_at` を返し、画面はテンプレートに切り替えます。回数とトークン数は Supabase のテーブル `su_llm_usage` に記録します（`supabase/migrations/20261025190000_su_llm_usage.sql`）。
- LLM の失敗・タイムアウト・401・429 のときも、同梱テンプレートに切り替わり、ゲームは止まりません。

### 環境変数

| 名前 | 置き場所 | 用途 | 既定 |
|---|---|---|---|
| `AZURE_LUNA_API_KEY` | サーバー | Azure OpenAI の API キー | なし |
| `AZURE_LUNA_ENDPOINT` | サーバー | Responses API の URL（`…/openai/v1/responses`） | なし（必須） |
| `AZURE_LUNA_MODEL` | サーバー | モデル（デプロイ）名 | `gpt-6-luna` |
| `SUPABASE_URL` | サーバー | Supabase の URL（トークン検証・利用回数の記録）。無ければ `VITE_SUPABASE_URL` を使う | なし |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー | Supabase の service role キー（**画面に出さない**） | なし |
| `SU_LLM_DAILY_LIMIT` | サーバー（任意） | 1 ユーザー 1 日の LLM 呼出し上限 | `60` |
| `SU_LLM_IP_DAILY_LIMIT` | サーバー（任意） | 1 つの IP の 1 日の LLM 呼出し上限（共有回線を考え大きめ） | `300` |
| `SU_IP_SALT` | サーバー（任意） | IP ハッシュの塩 | `su-llm` |
| `VITE_SUPABASE_URL` | 画面（ビルド時） | Supabase の URL（ログイン） | なし |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 画面（ビルド時） | Supabase の publishable（anon）キー | なし |

名前は koshimizu-futures と同じです。`VITE_SUPABASE_*` が無いビルドではログイン欄が「準備中」になり、**全員ゲストとして動きます**（ビルド・起動は落ちません）。`SUPABASE_*` が無いサーバーでは `/api/su-llm` が 401／503 を返し LLM を呼びません。

Supabase 側では migration（`supabase/migrations/` の 2 本）を 1 回流してください（`supabase db push`、または SQL Editor に貼る）。Auth の Redirect URLs に本番の URL を入れてください。

`.env.example` に名前だけを書いています。値はコミットしないでください。

## 開発

Node 22 が必要です。

```bash
npm ci
npm run dev        # http://localhost:8080 （/api/su-llm も dev サーバー内で動く）
npm test           # vitest（数値モデルの方向性テスト・カード・API・通しプレイ）
npm run build      # tsc（app / api）+ vite build → dist/
```

ローカルで LLM を使うときは、シェルの環境変数に `AZURE_LUNA_*` と `SUPABASE_*`・`VITE_SUPABASE_*` を入れてから `npm run dev` を実行し、ログインしてください。

## デプロイ（Vercel）

`vercel.json` は framework `vite`、install `npm ci`、build `npm run build`、output `dist`、`api/*.ts` の maxDuration 60 秒、SPA の rewrite を設定しています。Vercel の Project Settings で上の環境変数を設定してください。

## 構成

```
api/su-llm.ts                    文章生成（Azure Responses API）
api/_lib/suAuth.ts               ログイン確認と 1 日の上限（Supabase service role）
supabase/migrations/             利用回数テーブル su_llm_usage
src/lib/supabase.ts, auth.ts     ログイン（env が無ければ全員ゲスト）
src/lib/society/model.ts         数値モデル τ_θ（決定論的）
src/lib/society/cards.ts         制度カード（6 分野・a/b/c・現状維持）
src/lib/society/templates.ts     LLM 不通時の文章
src/lib/society/personas.ts      固定 24 人と LLM 出力の検証
src/lib/society/record.ts        ダウンロード JSON の形（science-utopia/run-v1）
src/components/game/             画面
docs/model.md                    モデルの式と定数
DESIGN.md                        画面設計と次にやること
screenshots/                     画面例
```
