import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { proposeMonthPlan, proposeWeekPlan } from "./planner";
import { executeTool, runDecisionActions } from "./tools";
import { pendingDecisions } from "@/lib/domain/selectors";

const today = "2026-10-08";

describe("planner", () => {
  it("semana: só move para dias >= hoje e respeita prazo", () => {
    const data = buildDemoData(today);
    const plan = proposeWeekPlan(data, today, today);
    expect(plan.moves.length).toBeGreaterThan(0);
    for (const m of plan.moves) {
      expect(m.to >= today).toBe(true);
      expect(m.to <= "2026-10-11").toBe(true);
      const item = data.items.find((i) => i.id === m.itemId)!;
      if (item.dueDate && item.dueDate >= today) expect(m.to <= item.dueDate).toBe(true);
    }
    expect(plan.warnings.some((w) => w.includes("Conflito"))).toBe(true);
  });

  it("mês: contas ganham dia de pagamento antes do vencimento", () => {
    const data = buildDemoData(today);
    const plan = proposeMonthPlan(data, today, today);
    const das = data.items.find((i) => i.title === "DAS (MEI)")!;
    const move = plan.moves.find((m) => m.itemId === das.id)!;
    expect(move.to < das.dueDate!).toBe(true);
  });
});

describe("tools", () => {
  it("WRITE de agente vira decisão, não executa", () => {
    const data = buildDemoData(today);
    const item = data.items.find((i) => i.title === "Comprar shampoo")!;
    const r = executeTool(data, { tool: "complete_item", input: { itemId: item.id } }, { actor: "agent", ctx: { today } });
    expect(r.status).toBe("needs_confirmation");
    expect(r.data.items.find((i) => i.id === item.id)!.status).toBe("open");
    const decision = pendingDecisions(r.data.decisions, today).find((d) => d.itemId === item.id)!;
    const approved = runDecisionActions(r.data, decision, { today });
    expect(approved.status).toBe("ok");
    expect(approved.data.items.find((i) => i.id === item.id)!.status).toBe("done");
  });

  it("ferramentas externas estão bloqueadas", () => {
    const data = buildDemoData(today);
    const r = executeTool(data, { tool: "pay_bill", input: { itemId: "x" } }, { actor: "user", confirmed: true });
    expect(r.status).toBe("error");
  });

  it("WRITE do usuário executa direto e registra atividade", () => {
    const data = buildDemoData(today);
    const item = data.items.find((i) => i.title === "Comprar shampoo")!;
    const r = executeTool(data, { tool: "complete_item", input: { itemId: item.id } }, { actor: "user" });
    expect(r.status).toBe("ok");
    expect(r.data.activity[0].tool).toBe("complete_item");
  });
});
