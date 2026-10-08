/**
 * Testa as migrations num Postgres de verdade (PGlite, em memória) — nada de Supabase real.
 * Simula o que o Supabase faz: schema `auth`, `auth.uid()` lendo o JWT e o papel `authenticated`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ITEM_A = "11111111-1111-4111-8111-111111111111";

let db: PGlite;

async function asUser(uid: string | null) {
  await db.exec("reset role");
  if (uid) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  } else {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  const dir = join(__dirname, "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  // o Supabase concede isto por padrão; a RLS é que protege
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
  `);
});

describe("migrations + RLS (Postgres real em memória)", () => {
  it("aplica 0001 e 0002 em sequência", async () => {
    const r = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' order by 1",
    );
    const names = r.rows.map((x) => x.table_name);
    expect(names).toEqual(expect.arrayContaining(["items", "audit_log", "agent_grants", "decisions", "captures"]));
    expect(names).not.toContain("agent_activity");
  });

  it("todas as tabelas públicas têm RLS ligada", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(r.rows.length).toBeGreaterThan(5);
    expect(r.rows.filter((x) => !x.relrowsecurity)).toEqual([]);
  });

  it("cada usuário só enxerga e altera o que é seu", async () => {
    await asUser(A);
    await db.query("insert into items (id, title) values ($1, 'VPS')", [ITEM_A]);
    expect((await db.query("select * from items")).rows).toHaveLength(1);

    await asUser(B);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    const upd = await db.query("update items set title='hack' where id=$1", [ITEM_A]);
    expect(upd.affectedRows).toBe(0);
    const del = await db.query("delete from items where id=$1", [ITEM_A]);
    expect(del.affectedRows).toBe(0);

    await asUser(A);
    expect((await db.query<{ title: string }>("select title from items")).rows[0].title).toBe("VPS");
  });

  it("não deixa gravar em nome de outro usuário", async () => {
    await asUser(B);
    await expect(db.query("insert into items (user_id, title) values ($1, 'forjado')", [A])).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("anônimo não vê nem grava nada", async () => {
    await asUser(null);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    await expect(db.query("insert into items (title) values ('x')")).rejects.toThrow();
  });

  it("projetos também são isolados por usuário", async () => {
    await asUser(A);
    await db.query("insert into projects (id, name) values ('22222222-2222-4222-8222-222222222222', 'Zeloa')");
    await asUser(B);
    expect((await db.query("select * from projects")).rows).toHaveLength(0);
  });

  it("audit_log é append-only e isolado", async () => {
    await asUser(A);
    await db.query(
      "insert into audit_log (origin, actor, tool, summary, status, idempotency_key) values ('agent','agent','capture_item','x','ok','k1')",
    );
    const upd = await db.query("update audit_log set summary='apagado'");
    expect(upd.affectedRows).toBe(0);
    const del = await db.query("delete from audit_log");
    expect(del.affectedRows).toBe(0);
    expect((await db.query("select * from audit_log")).rows).toHaveLength(1);

    await asUser(B);
    expect((await db.query("select * from audit_log")).rows).toHaveLength(0);
  });

  it("idempotência: a mesma chave aceita não entra duas vezes; erro pode ser repetido", async () => {
    await asUser(A);
    await expect(
      db.query(
        "insert into audit_log (origin, actor, tool, summary, status, idempotency_key) values ('agent','agent','capture_item','x','ok','k1')",
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
    await db.query(
      "insert into audit_log (origin, actor, tool, summary, status, idempotency_key) values ('agent','agent','capture_item','falhou','error','k1')",
    );
    // outro usuário pode usar a mesma chave
    await asUser(B);
    await db.query(
      "insert into audit_log (origin, actor, tool, summary, status, idempotency_key) values ('agent','agent','capture_item','x','ok','k1')",
    );
  });

  it("origem inválida é recusada", async () => {
    await asUser(A);
    await expect(
      db.query("insert into audit_log (origin, actor, tool, summary, status) values ('hacker','agent','t','s','ok')"),
    ).rejects.toThrow(/check/i);
  });

  it("agent_grants é privado do dono", async () => {
    await asUser(A);
    await db.query("insert into agent_grants (name, origin, allowed_tools) values ('hermes','agent','{get_today}')");
    await asUser(B);
    expect((await db.query("select * from agent_grants")).rows).toHaveLength(0);
  });
});
