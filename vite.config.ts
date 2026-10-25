import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// ローカル開発用: /api/su-llm を Vercel Function と同じハンドラで処理する。
// 本番（Vercel）ではこのプラグインは使われない。
function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/su-llm", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/su-llm.ts");
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request("http://localhost/api/su-llm", {
            method: req.method,
            headers: {
              "content-type": "application/json",
              ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
            },
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          });
          const handler = req.method === "OPTIONS" ? mod.OPTIONS : mod.POST;
          const out: Response = await handler(request);
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig({
  server: { host: "::", port: 8080 },
  plugins: [react(), devApi()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
