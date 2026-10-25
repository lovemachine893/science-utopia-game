import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vercel の Node 関数は ESM（package.json "type": "module"）として読まれるため、
// 拡張子なしの相対 import は本番で FUNCTION_INVOCATION_FAILED になる。
describe("api/ の相対 import", () => {
  it("すべて .js で終わる", () => {
    const dir = join(process.cwd(), "api");
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(dir, f)),
      ...readdirSync(join(dir, "_lib")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(dir, "_lib", f)),
    ];
    const bad: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
        if (!m[1].endsWith(".js")) bad.push(`${f}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
