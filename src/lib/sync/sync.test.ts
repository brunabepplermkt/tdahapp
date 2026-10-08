import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { UUID_RE } from "@/lib/domain/hash";
import { addItem, deleteItem, updateItem } from "@/lib/domain/operations";
import type { AppData } from "@/lib/domain/types";
import { executeTool } from "@/lib/tools";
import { FakeBackend } from "./fake-remote";
import { SyncEngine } from "./engine";
import { MemorySyncState } from "./state";
import { fromRows, remoteId, rowHash, SYNC_TABLES, toRows } from "./rows";

const today = "2026-10-08";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const total = (d: AppData) => d.items.length + d.captures.length + d.projects.length + d.notes.length + d.decisions.length + d.activity.length;
const remoteCount = (be: FakeBackend, u: string) => SYNC_TABLES.reduce((n, t) => n + be.rowsOf(u, t).length, 0);
function device(be: FakeBackend, user: string, data: AppData, chunkSize = 200) {
  const state = new MemorySyncState();
  const mk = () => new SyncEngine(be.client(user), state, { chunkSize });
  return { be, user, state, data, engine: mk(), restart() { this.engine = mk(); } };
}
type Dev = ReturnType<typeof device>;
async function sync(d: Dev, opts: { migrate?: boolean } = {}) {
  const r = await d.engine.reconcile(d.data, opts);
  d.data = r.data;
  return r;
}
async function push(d: Dev, opts?: { allowMassDelete?: boolean }) {
  const r = await d.engine.push(d.data, opts);
  d.data = r.data;
  return r;
}
const edit = (d: Dev, title: string, patch: Record<string, unknown>) => {
  const item = d.data.items.find((i) => i.title === title)!;
  d.data = updateItem(d.data, item.id, patch);
  return item.id;
};

describe("mapeamento linhas ⇄ app", () => {
  const demo = buildDemoData(today);

  it("ids remotos são UUIDs estáveis e diferentes por usuário", () => {
    const a1 = remoteId(A, "itm_123");
    expect(a1).toMatch(UUID_RE);
    expect(remoteId(A, "itm_123")).toBe(a1);
    expect(remoteId(B, "itm_123")).not.toBe(a1);
    const u = "11111111-1111-4111-8111-111111111111";
    expect(remoteId(A, u)).toBe(u); // já é UUID: mantém
  });

  it("dados → linhas → dados → linhas é estável (nada se perde na ida e volta)", () => {
    const { rows, warnings } = toRows(demo, A);
    expect(warnings).toEqual([]);
    const back = fromRows(rows);
    expect(back.items.map((i) => i.id).sort()).toEqual(demo.items.map((i) => i.id).sort()); // ids locais preservados
    expect(back.projects.map((p) => p.id).sort()).toEqual(demo.projects.map((p) => p.id).sort());
    const again = toRows({ version: 1, ...back }, A).rows;
    for (const t of SYNC_TABLES) {
      const h = (rs: typeof rows[typeof t]) => rs.map((r) => rowHash(t, r)).sort();
      expect(h(again[t]), t).toEqual(h(rows[t]));
    }
  });

  it("referências quebradas viram null (e avisam) em vez de derrubar o envio", () => {
    const data = updateItem(demo, demo.items[0].id, { projectId: "prj_apagado", parentId: "itm_fantasma" });
    const { rows, warnings } = toRows(data, A);
    expect(warnings.length).toBe(2);
    const row = rows.items.find((r) => r.local_id === demo.items[0].id)!;
    expect(row.project_id).toBeNull();
    expect(row.parent_id).toBeNull();
  });
});

describe("migração local → remoto", () => {
  it("envia tudo, não altera o local e é idempotente (rodar de novo não escreve nada)", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d = device(be, A, demo);
    const r = await sync(d, { migrate: true });
    expect(r.ok).toBe(true);
    expect(d.data).toBe(demo); // nada mudou localmente
    expect(remoteCount(be, A)).toBe(total(demo));
    expect(r.ok && r.state.migratedAt).toBeTruthy();

    const writesBefore = be.writes;
    const again = await sync(d, { migrate: true });
    expect(again.ok && again.report).toMatchObject({ pushed: 0, pulled: 0, deletedRemote: 0, conflicts: 0 });
    expect(be.writes).toBe(writesBefore);
    expect(remoteCount(be, A)).toBe(total(demo));
  });

  it("mesmo sem o estado salvo (reinstalou, limpou o navegador) não duplica nada", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    await sync(device(be, A, demo), { migrate: true });
    const n = remoteCount(be, A);
    const fresh = device(be, A, demo); // estado vazio
    const r = await sync(fresh, { migrate: true });
    expect(r.ok && r.report.pulled).toBe(0);
    expect(remoteCount(be, A)).toBe(n);
  });

  it("formatos do Postgres (+00:00, hora com segundos) não geram falso conflito", async () => {
    const be = new FakeBackend();
    const d = device(be, A, buildDemoData(today));
    await sync(d, { migrate: true });
    const r = await sync(d);
    expect(r.ok && r.report).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it("cai a conexão no meio: nada local se perde, progresso fica, retomar completa sem duplicar", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d = device(be, A, demo, 10);
    be.failWriteNumber(4);
    const r1 = await sync(d, { migrate: true });
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.retryable).toBe(true);
    expect(d.data).toBe(demo);
    const partial = remoteCount(be, A);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(total(demo));
    expect(d.state.load(A).migratedAt).toBeUndefined();

    d.restart(); // app fechado e reaberto
    const r2 = await sync(d, { migrate: true });
    expect(r2.ok).toBe(true);
    expect(remoteCount(be, A)).toBe(total(demo));
    expect(r2.ok && r2.report.pushed).toBeLessThan(total(demo)); // só o que faltava
  });

  it("sem rede ao começar: dados locais intactos e erro recuperável", async () => {
    const be = new FakeBackend();
    be.offline = true;
    const demo = buildDemoData(today);
    const d = device(be, A, demo);
    const r = await sync(d, { migrate: true });
    expect(r).toMatchObject({ ok: false, retryable: true });
    expect(d.data).toBe(demo);
    be.offline = false;
    expect((await sync(d, { migrate: true })).ok).toBe(true);
  });

  it("referência quebrada local não impede a migração", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const data = updateItem(demo, demo.items[0].id, { projectId: "prj_apagado" });
    const r = await sync(device(be, A, data), { migrate: true });
    expect(r.ok).toBe(true);
    expect(r.report.warnings.length).toBeGreaterThan(0);
  });

  it("filhos (parent_id) chegam depois dos pais mesmo em lotes pequenos", async () => {
    const be = new FakeBackend();
    let data = buildDemoData(today);
    const parent = data.items[0];
    data = executeTool(data, { tool: "add_steps", input: { itemId: parent.id, steps: ["a", "b", "c"] } }, { origin: "user_app" }).data;
    const r = await sync(device(be, A, data, 3), { migrate: true });
    expect(r.ok).toBe(true);
  });

  it("remoto que já tem uma versão mais nova do mesmo item: a mais nova vence, nada é apagado", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d1 = device(be, A, demo);
    await sync(d1, { migrate: true });
    const id = edit(d1, "Comprar shampoo", { title: "Comprar shampoo (remoto)", updatedAt: "2099-01-01T00:00:00.000Z" });
    await push(d1);
    // outro aparelho com a versão antiga e sem estado
    const d2 = device(be, A, demo);
    const r = await sync(d2, { migrate: true });
    expect(r.ok && r.report.conflicts).toBe(1);
    expect(d2.data.items.find((i) => i.id === id)!.title).toBe("Comprar shampoo (remoto)");
    expect(d2.data.items).toHaveLength(demo.items.length);
  });
});

describe("isolamento entre usuários", () => {
  it("B não vê dados de A e A não vê dados de B", async () => {
    const be = new FakeBackend();
    const da = device(be, A, buildDemoData(today));
    await sync(da, { migrate: true });
    const db = device(be, B, { ...buildDemoData(today), items: [], captures: [], projects: [], notes: [], decisions: [], activity: [] });
    const r = await sync(db, { migrate: true });
    expect(r.ok && r.report.pulled).toBe(0);
    expect(db.data.items).toHaveLength(0);
    expect(be.rowsOf(B, "items")).toHaveLength(0);
  });

  it("mesmos ids locais em usuários diferentes não colidem", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today); // ids locais idênticos nos dois
    expect((await sync(device(be, A, demo), { migrate: true })).ok).toBe(true);
    expect((await sync(device(be, B, demo), { migrate: true })).ok).toBe(true);
    expect(be.rowsOf(A, "items")).toHaveLength(demo.items.length);
    expect(be.rowsOf(B, "items")).toHaveLength(demo.items.length);
    const idsA = new Set(be.rowsOf(A, "items").map((r) => r.id));
    expect(be.rowsOf(B, "items").some((r) => idsA.has(r.id))).toBe(false);
  });

  it("B não consegue sobrescrever nem apagar a linha de A", async () => {
    const be = new FakeBackend();
    await sync(device(be, A, buildDemoData(today)), { migrate: true });
    const row = be.rowsOf(A, "items")[0];
    await expect(be.client(B).upsert("items", [{ ...row, title: "hack" }])).rejects.toMatchObject({ kind: "forbidden" });
    await be.client(B).remove("items", [String(row.id)]);
    expect(be.rowsOf(A, "items").find((r) => r.id === row.id)!.title).toBe(row.title);
  });
});

describe("dois aparelhos", () => {
  it("o segundo recebe tudo com os MESMOS ids locais; edição de um chega ao outro", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d1 = device(be, A, demo);
    await sync(d1, { migrate: true });
    const empty: AppData = { ...demo, items: [], captures: [], projects: [], notes: [], decisions: [], activity: [] };
    const d2 = device(be, A, empty);
    const r = await sync(d2);
    expect(r.ok).toBe(true);
    expect(d2.data.items.map((i) => i.id).sort()).toEqual(demo.items.map((i) => i.id).sort());
    expect(d2.data.items.find((i) => i.money)?.money?.amountCents).toBe(demo.items.find((i) => i.money)?.money?.amountCents);

    edit(d2, "Comprar shampoo", { title: "Shampoo sem sulfato", updatedAt: "2099-01-01T00:00:00.000Z" });
    await push(d2);
    await sync(d1);
    expect(d1.data.items.some((i) => i.title === "Shampoo sem sulfato")).toBe(true);
  });

  it("apagar propaga só o que já estava sincronizado; edição local vence apagamento remoto", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d1 = device(be, A, demo);
    await sync(d1, { migrate: true });
    const d2 = device(be, A, { ...demo, items: [], captures: [], projects: [], notes: [], decisions: [], activity: [] });
    await sync(d2);

    const victim = demo.items.find((i) => i.title === "Comprar shampoo")!;
    const other = demo.items.find((i) => i.title !== "Comprar shampoo" && i.status === "open" && !i.parentId)!;
    d1.data = deleteItem(d1.data, victim.id);
    d1.data = deleteItem(d1.data, other.id);
    await push(d1);
    expect(be.rowsOf(A, "items").some((r) => r.local_id === victim.id)).toBe(false);

    // d2 editou "other" antes de saber do apagamento → vence e ressuscita
    edit(d2, other.title, { notes: "ainda preciso disso" });
    const r = await sync(d2);
    expect(r.ok && r.report.deletedLocal).toBe(1); // victim sumiu de d2
    expect(d2.data.items.some((i) => i.id === victim.id)).toBe(false);
    expect(d2.data.items.some((i) => i.id === other.id)).toBe(true);
    expect(be.rowsOf(A, "items").some((r) => r.local_id === other.id)).toBe(true);
  });

  it("conflito: edição dos dois lados — vence a mais recente e é contado", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d1 = device(be, A, demo);
    await sync(d1, { migrate: true });
    const d2 = device(be, A, demo);
    await sync(d2, { migrate: true });
    edit(d1, "Comprar shampoo", { title: "versão 1", updatedAt: "2090-01-01T00:00:00.000Z" });
    edit(d2, "Comprar shampoo", { title: "versão 2", updatedAt: "2091-01-01T00:00:00.000Z" });
    await push(d1);
    const r = await sync(d2);
    expect(r.ok && r.report.conflicts).toBe(1);
    await sync(d1);
    expect(d1.data.items.some((i) => i.title === "versão 2")).toBe(true);
    expect(d2.data.items.some((i) => i.title === "versão 2")).toBe(true);
  });
});

describe("envio contínuo (push)", () => {
  it("manda só o item alterado; falha de rede mantém pendente e a próxima tentativa conclui", async () => {
    const be = new FakeBackend();
    const d = device(be, A, buildDemoData(today));
    await sync(d, { migrate: true });
    d.data = addItem(d.data, { title: "Novo item offline" }).data;
    be.offline = true;
    const bad = await push(d);
    expect(bad).toMatchObject({ ok: false, retryable: true });
    expect(d.data.items.some((i) => i.title === "Novo item offline")).toBe(true);
    be.offline = false;
    const ok = await push(d);
    expect(ok.ok && ok.report.pushed).toBe(1);
    expect(be.rowsOf(A, "items").some((r) => r.title === "Novo item offline")).toBe(true);
    expect((await push(d)).report.pushed).toBe(0);
  });

  it("remoção em massa fica retida até confirmar (ex.: 'começar do zero')", async () => {
    const be = new FakeBackend();
    const demo = buildDemoData(today);
    const d = device(be, A, demo);
    await sync(d, { migrate: true });
    const before = remoteCount(be, A);
    d.data = { ...demo, items: [], captures: [], projects: [], notes: [], decisions: [] };
    const held = await push(d);
    expect(held.ok && held.report.heldDeletions).toBeGreaterThan(5);
    expect(remoteCount(be, A)).toBe(before); // a nuvem continua intacta

    const confirmed = await push(d, { allowMassDelete: true });
    expect(confirmed.ok && confirmed.report.deletedRemote).toBeGreaterThan(5);
    expect(be.rowsOf(A, "items")).toHaveLength(0);
  });
});

describe("auditoria e idempotência no remoto", () => {
  it("a trilha de auditoria sobe uma vez só e nunca é apagada", async () => {
    const be = new FakeBackend();
    const d = device(be, A, buildDemoData(today));
    const r = executeTool(d.data, { tool: "capture_item", input: { text: "sexta pagar VPS" } }, { origin: "agent", idempotencyKey: "wa-1", ctx: { today } });
    d.data = r.data;
    await sync(d, { migrate: true });
    const rows = be.rowsOf(A, "audit_log");
    const mine = rows.filter((x) => x.idempotency_key === "wa-1");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ origin: "agent", tool: "capture_item", status: "ok" });
    await expect(be.client(A).remove("audit_log", [String(mine[0].id)])).rejects.toMatchObject({ kind: "forbidden" });

    // outro aparelho que repete a mesma chave: conflito vira aviso e os dados seguem
    const d2 = device(be, A, buildDemoData(today));
    d2.data = executeTool(d2.data, { tool: "capture_item", input: { text: "sexta pagar VPS" } }, { origin: "agent", idempotencyKey: "wa-1", ctx: { today } }).data;
    const r2 = await sync(d2, { migrate: true });
    expect(r2.ok).toBe(true);
    expect(be.rowsOf(A, "audit_log").filter((x) => x.idempotency_key === "wa-1")).toHaveLength(1);
  });
});
