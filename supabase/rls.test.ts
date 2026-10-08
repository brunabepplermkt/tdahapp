/** Testa as migrations num Postgres de verdade (PGlite, em memória) — nada de Supabase real. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser as asUserOn, createDb } from "./harness";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ITEM_A = "11111111-1111-4111-8111-111111111111";

let db: PGlite;
const asUser = (uid: string | null) => asUserOn(db, uid);

beforeAll(async () => {
  db = await createDb([A, B]);
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

describe("carimbo de updated_at (trigger)", () => {
  it("respeita o updated_at do cliente, ignora reenvio idêntico e carimba edição direta", async () => {
    await asUser(A);
    const id = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into projects (id, name, updated_at) values ($1, 'P', '2026-01-01T00:00:00Z')", [id]);
    const get = async () => (await db.query<{ u: string }>("select updated_at::text as u from projects where id=$1", [id])).rows[0].u;
    const t0 = await get();
    await db.query("update projects set name='P' where id=$1", [id]); // nada mudou
    expect(await get()).toBe(t0);
    await db.query("update projects set name='Q', updated_at='2026-02-02T00:00:00Z' where id=$1", [id]); // cliente informou
    expect(await get()).toContain("2026-02-02");
    await db.query("update projects set name='R' where id=$1", [id]); // edição direta
    expect(await get()).not.toContain("2026-02-02");
  });
});
