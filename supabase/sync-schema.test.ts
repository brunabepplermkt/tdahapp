/**
 * As linhas que o app gera (src/lib/sync/rows.ts) precisam caber no schema REAL:
 * colunas, tipos, checks, FKs e RLS. Aqui elas passam por um Postgres de verdade
 * (como o PostgREST faria) e voltam idênticas.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { executeTool } from "@/lib/tools";
import { canonRow, fromRows, SYNC_TABLES, toRows, type Row, type SyncTable, type TableRows } from "@/lib/sync/rows";
import { asUser, createDb } from "./harness";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const today = "2026-10-08";

const JSONB = new Set(["history", "actions", "interpretation", "input", "change"]);
let db: PGlite;

async function upsert(table: SyncTable, rows: Row[]) {
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => (JSONB.has(c) && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
    const ph = cols.map((c, i) => `$${i + 1}${JSONB.has(c) ? "::jsonb" : ""}`);
    const upd = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
    await db.query(
      `insert into ${table} (${cols.join(",")}) values (${ph.join(",")}) on conflict (id) do ${table === "audit_log" ? "nothing" : `update set ${upd.join(",")}`}`,
      vals,
    );
  }
}
async function fetchAll(): Promise<TableRows> {
  const out = {} as TableRows;
  for (const t of SYNC_TABLES) {
    const r = await db.query<{ r: Row }>(`select to_jsonb(x) as r from ${t} x`);
    out[t] = r.rows.map((x) => x.r);
  }
  return out;
}

beforeAll(async () => {
  db = await createDb([A, B]);
});

describe("linhas do app × schema real do Postgres", () => {
  const demo = buildDemoData(today);
  // inclui uma entrada de auditoria de agente (com idempotência) e uma captura
  const data = executeTool(demo, { tool: "capture_item", input: { text: "sexta preciso pagar a VPS" } }, {
    origin: "agent", idempotencyKey: "wa-1", ctx: { today },
  }).data;

  it("grava tudo sem violar constraints, de novo sem duplicar, e lê de volta idêntico", async () => {
    await asUser(db, A);
    const { rows } = toRows(data, A);
    for (const t of SYNC_TABLES) await upsert(t, rows[t]);
    for (const t of SYNC_TABLES) await upsert(t, rows[t]); // idempotente
    const back = await fetchAll();
    for (const t of SYNC_TABLES) {
      expect(back[t].length, t).toBe(rows[t].length);
      const byId = (rs: Row[]) => Object.fromEntries(rs.map((r) => [String(r.id), canonRow(t, r)]));
      expect(byId(back[t]), t).toEqual(byId(rows[t])); // timestamps/horas/números canônicos iguais
    }
    const restored = fromRows(back);
    expect(restored.items.map((i) => i.id).sort()).toEqual(data.items.map((i) => i.id).sort());
    expect(restored.activity.find((a) => a.idempotencyKey === "wa-1")).toMatchObject({ origin: "agent", tool: "capture_item" });
  });

  it("outro usuário não enxerga nem consegue regravar essas linhas", async () => {
    await asUser(db, B);
    const back = await fetchAll();
    for (const t of SYNC_TABLES) expect(back[t]).toHaveLength(0);
    const { rows } = toRows(data, A);
    await expect(upsert("items", [rows.items[0]])).rejects.toThrow(); // upsert sobre linha de A: RLS barra
  });
});
