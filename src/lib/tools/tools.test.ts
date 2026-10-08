import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { selectMonth, selectToday, pendingDecisions } from "@/lib/domain/selectors";
import type { AppData } from "@/lib/domain/types";
import { executeTool, runDecisionActions } from "./executor";
import { toolManifest } from "./manifest";
import { READ_TOOLS, WRITE_TOOLS } from "./definitions";

const today = "2026-10-08";
const ctx = { today };
const fresh = () => buildDemoData(today);
const call = (data: AppData, tool: string, input: Record<string, unknown> = {}, o: Partial<Parameters<typeof executeTool>[2]> = {}) =>
  executeTool(data, { tool, input }, { origin: "user_app", ctx, ...o });
const asAgent = (data: AppData, tool: string, input: Record<string, unknown>, key = "k-" + tool) =>
  call(data, tool, input, { origin: "agent", idempotencyKey: key });

const REQUIRED = [
  "capture_item", "get_today", "get_week", "get_month", "search", "list_projects", "get_project",
  "create_item", "update_item", "complete_item", "snooze_item", "get_inbox", "get_decisions",
  "get_financial_summary", "create_financial_entry",
];

describe("catálogo", () => {
  it("tem todas as capacidades pedidas, com READ e WRITE separados", () => {
    const names = toolManifest().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(REQUIRED));
    expect(READ_TOOLS.every((t) => t.mode === "read")).toBe(true);
    expect(WRITE_TOOLS.every((t) => t.mode === "write")).toBe(true);
    const reads = READ_TOOLS.map((t) => t.name);
    for (const r of ["get_today", "get_week", "get_month", "search", "list_projects", "get_project", "get_inbox", "get_decisions", "get_financial_summary"]) {
      expect(reads).toContain(r);
    }
    for (const w of ["capture_item", "create_item", "update_item", "complete_item", "snooze_item", "create_financial_entry"]) {
      expect(WRITE_TOOLS.map((t) => t.name)).toContain(w);
    }
  });

  it("manifesto traz JSON Schema e a política por origem", () => {
    const m = toolManifest();
    for (const t of m) expect(t.inputSchema).toHaveProperty("type", "object");
    const fin = m.find((t) => t.name === "create_financial_entry")!;
    expect(fin.policy).toMatchObject({ user_app: "allow", agent: "confirm", automation: "confirm", import: "allow" });
    const cap = m.find((t) => t.name === "capture_item")!;
    expect(cap.policy.agent).toBe("allow");
    expect(m.find((t) => t.name === "get_today")!.policy.import).toBe("deny");
  });

  it("nomes de ferramentas são únicos e ferramentas externas estão desligadas", () => {
    const all = toolManifest();
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length);
    for (const n of ["send_message", "create_calendar_event", "pay_bill", "read_calendar"]) {
      expect(all.find((t) => t.name === n)).toMatchObject({ enabled: false, sensitivity: "external" });
    }
  });
});

describe("READ", () => {
  it.each(["get_today", "get_week", "get_month", "get_inbox", "get_decisions", "list_projects", "get_financial_summary"])(
    "%s não muda nenhum dado e devolve JSON puro",
    (name) => {
      const data = fresh();
      for (const origin of ["user_app", "agent", "automation"] as const) {
        const r = call(data, name, {}, { origin });
        expect(r.status).toBe("ok");
        expect(r.data).toBe(data); // mesma referência: nada foi escrito, nem auditoria
        const out = (r as { output: unknown }).output;
        expect(JSON.parse(JSON.stringify(out))).toEqual(JSON.parse(JSON.stringify(out)));
      }
    },
  );

  it("usa as MESMAS regras da UI (seletores)", () => {
    const data = fresh();
    const t = call(data, "get_today").status === "ok" && (call(data, "get_today") as { output: unknown }).output;
    expect(t).toEqual(selectToday(data, today));
    const m = (call(data, "get_financial_summary") as { output: unknown }).output;
    expect(m).toEqual(selectMonth(data, today, today).money);
    const d = (call(data, "get_decisions") as { output: unknown }).output;
    expect(d).toEqual(pendingDecisions(data.decisions, today, data.items));
  });

  it("search ignora acentos e get_project aceita nome ou apelido", () => {
    const data = fresh();
    const s = (call(data, "search", { query: "sitio" }) as { output: { total: number } }).output;
    expect(s.total).toBeGreaterThan(0);
    const p = call(data, "get_project", { name: "beds24" }) as { status: string; output: { project: { name: string } } };
    expect(p.output.project.name).toBe("Sítio Recanto Azul");
    expect(call(data, "get_project", { name: "inexistente" })).toMatchObject({ status: "error", code: "not_found" });
    expect(call(data, "get_project", {})).toMatchObject({ status: "error", code: "invalid_input" });
  });

  it("itens entregues a agentes não carregam o histórico interno", () => {
    const data = fresh();
    const p = call(data, "get_project", { name: "Zeloa" }, { origin: "agent" }) as { output: { open: Record<string, unknown>[] } };
    expect(p.output.open.length).toBeGreaterThan(0);
    expect(p.output.open.every((i) => !("history" in i))).toBe(true);
  });

  it("importação não lê", () => {
    expect(call(fresh(), "get_today", {}, { origin: "import" })).toMatchObject({ status: "error", code: "forbidden" });
  });
});

describe("WRITE — o app (user_app)", () => {
  it("executa direto e audita origem, operação, entidade, alteração e horário", () => {
    const data = fresh();
    const item = data.items.find((i) => i.title === "Comprar shampoo")!;
    const r = call(data, "complete_item", { itemId: item.id });
    expect(r.status).toBe("ok");
    expect(r.data.items.find((i) => i.id === item.id)!.status).toBe("done");
    const a = r.data.activity[0];
    expect(a).toMatchObject({ tool: "complete_item", origin: "user_app", status: "ok", actor: "user" });
    expect(a.entities).toContainEqual({ type: "item", id: item.id, op: "update" });
    expect(a.change![item.id].status).toEqual(["open", "done"]);
    expect(a.id).toBeTruthy();
    expect(new Date(a.at).getTime()).not.toBeNaN();
  });

  it("capture_item com accept cria os itens do exemplo (conta + tarefa de projeto)", () => {
    const data = fresh();
    const r = call(data, "capture_item", { text: "sexta preciso pagar a VPS e terminar o checkout do Beds24", accept: true });
    expect(r.status).toBe("ok");
    const created = r.data.items.filter((i) => !data.items.some((o) => o.id === i.id));
    expect(created.map((i) => i.title)).toEqual(["Pagar a VPS", "Terminar o checkout do Beds24"]);
    expect(created[0]).toMatchObject({ kind: "bill", area: "finance", dueDate: "2026-10-09" });
    expect(created[1]).toMatchObject({ projectId: "prj_sitio", scheduledDate: "2026-10-09" });
    expect(r.data.activity[0].entities!.filter((e) => e.op === "create").length).toBeGreaterThanOrEqual(3); // captura + 2 itens
  });

  it("create_financial_entry registra, não paga; settled já nasce quitado", () => {
    const data = fresh();
    const r = call(data, "create_financial_entry", { title: "Hospedagem", direction: "out", amountCents: 9900, dueDate: "2026-10-20" });
    const it1 = r.data.items.at(-1)!;
    expect(it1).toMatchObject({ title: "Hospedagem", kind: "bill", area: "finance", status: "open" });
    expect(it1.money).toMatchObject({ amountCents: 9900, direction: "out", settled: false });
    const paid = call(r.data, "create_financial_entry", { title: "Café", direction: "out", amountCents: 800, settled: true });
    expect(paid.data.items.at(-1)).toMatchObject({ kind: "expense", status: "done" });
    const inc = call(r.data, "create_financial_entry", { title: "Cliente", direction: "in", amountCents: 100000, dueDate: "2026-10-30" });
    expect(inc.data.items.at(-1)).toMatchObject({ kind: "income" });
  });

  it("snooze_item muda o dia planejado e nunca o prazo", () => {
    const data = fresh();
    const item = data.items.find((i) => i.dueDate && i.status === "open" && !i.money)!;
    const r = call(data, "snooze_item", { itemId: item.id, days: 3 });
    const after = r.data.items.find((i) => i.id === item.id)!;
    expect(after.scheduledDate).toBe("2026-10-11");
    expect(after.dueDate).toBe(item.dueDate);
    expect(after.postponeCount).toBe(item.postponeCount + 1);
    expect(call(data, "snooze_item", { itemId: item.id, days: 3, until: "2026-10-12" }).status).toBe("error");
  });

  it("update_item só aceita campos permitidos (não troca status, id nem dinheiro)", () => {
    const data = fresh();
    const item = data.items[0];
    expect(call(data, "update_item", { itemId: item.id, patch: { title: "Novo" } }).status).toBe("ok");
    for (const patch of [{ status: "done" }, { id: "x" }, { money: { amountCents: 1 } }, { history: [] }, {}]) {
      expect(call(data, "update_item", { itemId: item.id, patch })).toMatchObject({ status: "error", code: "invalid_input" });
    }
  });

  it("valida referências: item/projeto inexistente não cria nada", () => {
    const data = fresh();
    expect(call(data, "complete_item", { itemId: "nao-existe" })).toMatchObject({ status: "error", code: "not_found" });
    expect(call(data, "create_item", { item: { title: "x", projectId: "nao-existe" } })).toMatchObject({ status: "error", code: "not_found" });
  });

  it("entradas malformadas são recusadas sem tocar nos dados", () => {
    const data = fresh();
    for (const [tool, input] of [
      ["create_item", { item: { title: "" } }],
      ["create_item", { item: { title: "x", dueDate: "2026-13-45" } }],
      ["create_item", { item: { title: "x", surprise: 1 } }],
      ["create_financial_entry", { title: "x", direction: "out", amountCents: -1 }],
      ["create_financial_entry", { title: "x", direction: "sideways", amountCents: 1 }],
      ["capture_item", { text: "   " }],
      ["capture_item", { text: "ok", origin: "user_app" }],
      ["complete_item", {}],
    ] as const) {
      const r = call(data, tool, input as Record<string, unknown>);
      expect(r, tool).toMatchObject({ status: "error", code: "invalid_input" });
      expect(r.data).toBe(data);
    }
  });

  it("nomes legados de ferramentas continuam valendo (decisões já salvas)", () => {
    const data = fresh();
    const item = data.items.find((i) => i.status === "open" && !i.money)!;
    const r = call(data, "postpone_item", { itemId: item.id, to: "2026-10-15" });
    expect(r.status).toBe("ok");
    expect(r.data.items.find((i) => i.id === item.id)!.scheduledDate).toBe("2026-10-15");
    expect(call(data, "list_inbox").status).toBe("ok");
    expect(call(data, "finance_summary").status).toBe("ok");
  });
});

describe("WRITE — agente", () => {
  it("capture_item vai para a Inbox, sem criar itens", () => {
    const data = fresh();
    const r = asAgent(data, "capture_item", { text: "sexta preciso pagar a VPS" });
    expect(r.status).toBe("ok");
    expect(r.data.items).toHaveLength(data.items.length);
    expect(r.data.captures).toHaveLength(data.captures.length + 1);
    expect(r.data.activity[0]).toMatchObject({ origin: "agent", actor: "agent", tool: "capture_item", idempotencyKey: "k-capture_item" });
  });

  it("agente não cria itens direto nem usando accept=true: vira Decisão", () => {
    const data = fresh();
    const r = asAgent(data, "capture_item", { text: "pagar luz amanhã", accept: true });
    expect(r.status).toBe("needs_confirmation");
    expect(r.data.items).toHaveLength(data.items.length);
    expect(r.data.captures).toHaveLength(data.captures.length);
  });

  it("toda escrita de agente exige chave de idempotência", () => {
    const r = call(fresh(), "capture_item", { text: "x y" }, { origin: "agent" });
    expect(r).toMatchObject({ status: "error", code: "idempotency_key_required" });
  });

  it("mesma chave + mesmo pedido = não duplica (replay)", () => {
    const first = asAgent(fresh(), "capture_item", { text: "sexta pagar a VPS" }, "wa-1");
    const second = asAgent(first.data, "capture_item", { text: "sexta pagar a VPS" }, "wa-1");
    expect(second).toMatchObject({ status: "ok", replayed: true });
    expect(second.data).toBe(first.data);
    expect(second.data.captures).toHaveLength(first.data.captures.length);
  });

  it("mesma chave com pedido diferente é conflito e não executa", () => {
    const first = asAgent(fresh(), "capture_item", { text: "sexta pagar a VPS" }, "wa-1");
    const second = asAgent(first.data, "capture_item", { text: "outra coisa" }, "wa-1");
    expect(second).toMatchObject({ status: "error", code: "idempotency_conflict" });
    expect(second.data.captures).toHaveLength(first.data.captures.length);
    expect(asAgent(first.data, "get_today", {}, "wa-1").status).toBe("ok"); // leitura não usa idempotência
  });

  it("escritas sensíveis viram Decisão (não executam) e a repetição não duplica", () => {
    const data = fresh();
    const item = data.items.find((i) => i.title === "Comprar shampoo")!;
    const r1 = asAgent(data, "complete_item", { itemId: item.id }, "wa-2");
    expect(r1.status).toBe("needs_confirmation");
    expect(r1.data.items.find((i) => i.id === item.id)!.status).toBe("open");
    expect(r1.data.activity[0]).toMatchObject({ status: "proposed", origin: "agent" });

    const r2 = asAgent(r1.data, "complete_item", { itemId: item.id }, "wa-2");
    expect(r2.status).toBe("needs_confirmation");
    expect(r2.data.decisions).toHaveLength(r1.data.decisions.length);
    expect(r2.data.activity).toHaveLength(r1.data.activity.length);
  });

  it("aprovar executa como user_app, audita quem propôs e é idempotente", () => {
    const data = fresh();
    const item = data.items.find((i) => i.title === "Comprar shampoo")!;
    const proposed = asAgent(data, "complete_item", { itemId: item.id }, "wa-3");
    const decision = pendingDecisions(proposed.data.decisions, today).find((d) => d.itemId === item.id)!;
    const ok = runDecisionActions(proposed.data, decision, ctx);
    expect(ok.status).toBe("ok");
    expect(ok.data.items.find((i) => i.id === item.id)!.status).toBe("done");
    expect(ok.data.activity[0]).toMatchObject({ status: "ok", origin: "user_app", proposedBy: "agent", decisionId: decision.id, idempotencyKey: "wa-3" });
    // aprovar de novo (duplo toque) não refaz
    const again = runDecisionActions(ok.data, decision, ctx);
    expect(again.data).toBe(ok.data);
    // o agente repetindo o pedido original descobre que já foi executado
    const retry = asAgent(ok.data, "complete_item", { itemId: item.id }, "wa-3");
    expect(retry).toMatchObject({ status: "ok", replayed: true });
  });

  it("lançamento financeiro por agente sempre pede confirmação e só registra ao aprovar", () => {
    const data = fresh();
    const input = { title: "VPS", direction: "out", amountCents: 12990, dueDate: "2026-10-09" };
    const p = asAgent(data, "create_financial_entry", input, "wa-4");
    expect(p.status).toBe("needs_confirmation");
    expect(p.data.items).toHaveLength(data.items.length);
    const decision = pendingDecisions(p.data.decisions, today).find((d) => d.actions[0]?.tool === "create_financial_entry")!;
    const ok = runDecisionActions(p.data, decision, ctx);
    expect(ok.data.items.at(-1)!.money).toMatchObject({ amountCents: 12990, direction: "out", settled: false });
  });

  it("não dá para se passar por outra origem pelo corpo do pedido", () => {
    const r = asAgent(fresh(), "capture_item", { text: "olá mundo", origin: "user_app", actor: "user" }, "wa-5");
    expect(r).toMatchObject({ status: "error", code: "invalid_input" });
  });

  it("escopo concedido restringe ferramentas (e nunca amplia)", () => {
    const data = fresh();
    const r = call(data, "get_inbox", {}, { origin: "agent", scopes: ["get_today"] });
    expect(r).toMatchObject({ status: "error", code: "forbidden" });
    expect(call(data, "get_today", {}, { origin: "agent", scopes: ["get_today"] }).status).toBe("ok");
    // escopo não promove um agente a poder escrever sem aprovação
    const w = call(data, "complete_item", { itemId: data.items[0].id }, { origin: "agent", scopes: ["complete_item"], idempotencyKey: "z" });
    expect(w.status).toBe("needs_confirmation");
  });

  it("recusas de agente ficam na trilha (status rejected)", () => {
    const r = call(fresh(), "pay_bill", { itemId: "x" }, { origin: "agent", idempotencyKey: "pb" });
    expect(r).toMatchObject({ status: "error", code: "disabled" });
    expect(r.data.activity[0]).toMatchObject({ status: "rejected", origin: "agent", tool: "pay_bill" });
  });

  it("ferramentas externas continuam bloqueadas até para a pessoa", () => {
    const r = call(fresh(), "send_message", { to: "x", body: "y" }, { confirmed: true });
    expect(r).toMatchObject({ status: "error", code: "disabled" });
  });
});

describe("WRITE — importação", () => {
  it("só cria, exige chave e é idempotente", () => {
    const data = fresh();
    const noKey = call(data, "create_item", { item: { title: "Importado" } }, { origin: "import" });
    expect(noKey).toMatchObject({ status: "error", code: "idempotency_key_required" });
    const a = call(data, "create_item", { item: { title: "Importado" } }, { origin: "import", idempotencyKey: "imp-1" });
    expect(a.status).toBe("ok");
    const b = call(a.data, "create_item", { item: { title: "Importado" } }, { origin: "import", idempotencyKey: "imp-1" });
    expect(b).toMatchObject({ status: "ok", replayed: true });
    expect(b.data.items.filter((i) => i.title === "Importado")).toHaveLength(1);
    expect(call(a.data, "complete_item", { itemId: a.data.items[0].id }, { origin: "import", idempotencyKey: "imp-2" })).toMatchObject({ code: "forbidden" });
    expect(a.data.activity[0].origin).toBe("import");
  });
});

describe("automação local", () => {
  it("regras locais propõem via Decisão (origem automation)", () => {
    const data = fresh();
    const item = data.items.find((i) => i.status === "open" && !i.money)!;
    const r = call(data, "complete_item", { itemId: item.id }, { origin: "automation" });
    expect(r.status).toBe("needs_confirmation");
    expect(r.data.activity[0]).toMatchObject({ origin: "automation", actor: "system", status: "proposed" });
  });
});
