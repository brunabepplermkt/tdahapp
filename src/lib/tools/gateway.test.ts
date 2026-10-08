import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import type { AppData } from "@/lib/domain/types";
import { heuristicInterpreter } from "@/lib/intelligence/heuristic/parse";
import type { CaptureInterpreter } from "@/lib/intelligence/types";
import { createToolGateway, type GatewayStore } from "./gateway";

const today = "2026-10-08";

function memoryStore(initial: AppData) {
  const s = {
    data: initial,
    saves: 0,
    failSaves: 0,
    failLoad: false,
    async load() {
      if (s.failLoad) throw new Error("rede");
      return s.data;
    },
    async save(d: AppData) {
      if (s.failSaves > 0) {
        s.failSaves--;
        throw new Error("rede caiu");
      }
      s.saves++;
      s.data = d;
    },
  } satisfies GatewayStore & Record<string, unknown>;
  return s;
}
const agent = (store: GatewayStore, interpreter?: CaptureInterpreter) =>
  createToolGateway({ principal: { origin: "agent" }, store, today: () => today, interpreter });

describe("gateway (futuro Hermes) — sem Hermes conectado", () => {
  it("“o que tenho hoje?” → get_today, só leitura, JSON puro, nada salvo", async () => {
    const store = memoryStore(buildDemoData(today));
    const r = await agent(store).call("get_today");
    expect(r.status).toBe("ok");
    expect(store.saves).toBe(0);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("“sexta preciso pagar a VPS” → capture_item cai na Inbox, uma vez só mesmo repetindo", async () => {
    const store = memoryStore(buildDemoData(today));
    const gw = agent(store);
    const before = store.data.captures.length;
    const a = await gw.call("capture_item", { text: "sexta preciso pagar a VPS" }, { idempotencyKey: "msg-1" });
    const b = await gw.call("capture_item", { text: "sexta preciso pagar a VPS" }, { idempotencyKey: "msg-1" });
    expect(a).toMatchObject({ status: "ok" });
    expect(b).toMatchObject({ status: "ok", replayed: true });
    expect(store.data.captures).toHaveLength(before + 1);
    const inbox = await gw.call("get_inbox");
    expect(JSON.stringify(inbox)).toContain("pagar a VPS");
  });

  it("mensagens simultâneas são serializadas: nenhuma se perde", async () => {
    const store = memoryStore(buildDemoData(today));
    const gw = agent(store);
    const before = store.data.captures.length;
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => gw.call("capture_item", { text: `ideia ${i} sobre o projeto` }, { idempotencyKey: `m-${i}` })),
    );
    expect(store.data.captures).toHaveLength(before + 8);
  });

  it("falha ao salvar: responde erro, nada aplicado, e repetir com a MESMA chave funciona", async () => {
    const store = memoryStore(buildDemoData(today));
    const gw = agent(store);
    const before = store.data;
    store.failSaves = 1;
    const bad = await gw.call("capture_item", { text: "pagar luz" }, { idempotencyKey: "k" });
    expect(bad).toMatchObject({ status: "error", code: "persist_failed" });
    expect(store.data).toBe(before);
    const ok = await gw.call("capture_item", { text: "pagar luz" }, { idempotencyKey: "k" });
    expect(ok).toMatchObject({ status: "ok" });
    expect((ok as { replayed?: boolean }).replayed).toBeUndefined();
    expect(store.data.captures).toHaveLength(before.captures.length + 1);
  });

  it("falha ao carregar: erro claro, sem escrever", async () => {
    const store = memoryStore(buildDemoData(today));
    store.failLoad = true;
    expect(await agent(store).call("get_today")).toMatchObject({ status: "error", code: "persist_failed" });
    expect(store.saves).toBe(0);
  });

  it("escrita sensível não executa: devolve 'aguardando aprovação' e a decisão aparece em get_decisions", async () => {
    const store = memoryStore(buildDemoData(today));
    const gw = agent(store);
    const item = store.data.items.find((i) => i.status === "open" && !i.money)!;
    const r = await gw.call("complete_item", { itemId: item.id }, { idempotencyKey: "c1" });
    expect(r).toMatchObject({ status: "needs_confirmation" });
    expect(store.data.items.find((i) => i.id === item.id)!.status).toBe("open");
    const d = await gw.call("get_decisions");
    expect(JSON.stringify(d)).toContain("Concluir");
  });

  it("a origem vem do Principal, nunca do pedido", async () => {
    const store = memoryStore(buildDemoData(today));
    const r = await agent(store).call("capture_item", { text: "oi tudo bem", origin: "user_app" }, { idempotencyKey: "o1" });
    expect(r).toMatchObject({ status: "error", code: "invalid_input" });
    // a tentativa foi auditada como vinda do agente
    expect(store.data.activity[0]).toMatchObject({ origin: "agent", status: "rejected" });
  });

  it("usa o interpretador assíncrono registrado (ex.: LLM no futuro) e cai no local se ele falhar", async () => {
    const store = memoryStore(buildDemoData(today));
    const llm: CaptureInterpreter = {
      id: "fake", label: "fake",
      async interpret(text, ctx) {
        const base = await heuristicInterpreter.interpret(text, ctx);
        return { ...base, source: "llm:fake" };
      },
    };
    const r = await agent(store, llm).call("capture_item", { text: "ligar pro contador amanhã" }, { idempotencyKey: "i1" });
    expect(r).toMatchObject({ status: "ok", output: { source: "llm:fake" } });
    const broken: CaptureInterpreter = { id: "x", label: "x", interpret: () => Promise.reject(new Error("fora do ar")) };
    const r2 = await agent(store, broken).call("capture_item", { text: "ligar pro contador amanhã" }, { idempotencyKey: "i2" });
    expect(r2).toMatchObject({ status: "ok", output: { source: "heuristic" } });
  });

  it("escopo restrito: Hermes só pode ler hoje e capturar", async () => {
    const store = memoryStore(buildDemoData(today));
    const gw = createToolGateway({ principal: { origin: "agent", scopes: ["get_today", "capture_item"] }, store, today: () => today });
    expect((await gw.call("get_today")).status).toBe("ok");
    expect(await gw.call("get_financial_summary")).toMatchObject({ status: "error", code: "forbidden" });
    expect(await gw.call("create_financial_entry", { title: "x", direction: "out", amountCents: 1 }, { idempotencyKey: "z" })).toMatchObject({ code: "forbidden" });
  });
});
