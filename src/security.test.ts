/** Guardas de segurança do repositório: nada de segredo, nada de service role no cliente. */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/package-lock\.json|\.png$|\.ico$|\.woff2?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");

describe("segurança", () => {
  it("nenhum arquivo do app (src/) usa service role ou chave secreta", () => {
    const offenders = files
      .filter((f) => f.startsWith("src/") && !f.endsWith(".test.ts") && f !== "src/lib/sync/config.ts")
      .filter((f) => /service_role|SERVICE_ROLE|sb_secret_/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("variáveis NEXT_PUBLIC só carregam URL e anon key", () => {
    const names = new Set<string>();
    for (const f of files.filter((f) => f.startsWith("src/") || f === ".env.example")) {
      for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) names.add(m[0]);
    }
    expect([...names].sort()).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });

  it("nenhum JWT, chave de API ou segredo commitado", () => {
    const patterns = [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /sk-ant-[A-Za-z0-9-]{10,}/, /sk-[A-Za-z0-9]{32,}/, /sb_secret_[A-Za-z0-9]+/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
    const offenders = files.filter((f) => !/security\.test\.ts|misc\.test\.ts/.test(f)).filter((f) => patterns.some((p) => p.test(read(f))));
    expect(offenders).toEqual([]);
  });

  it(".env.example não tem valores e .env* reais são ignorados pelo git", () => {
    const env = read(".env.example")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l));
    for (const l of env) expect(l.split("=")[1]).toBe("");
    expect(read(".gitignore")).toMatch(/\.env/);
    expect(files.some((f) => /^\.env(\.|$)/.test(f) && f !== ".env.example")).toBe(false);
  });

  it("toda tabela do schema liga RLS", () => {
    const sql = files.filter((f) => f.endsWith(".sql")).map(read).join("\n");
    const tables = [...sql.matchAll(/create table (\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(5);
    const dropped = [...sql.matchAll(/drop table (\w+)/g)].map((m) => m[1]);
    for (const t of tables.filter((t) => !dropped.includes(t))) {
      const covered = new RegExp(`alter table ${t} enable row level security`).test(sql) || sql.includes(`'${t}'`);
      expect(covered, t).toBe(true);
    }
  });
});
