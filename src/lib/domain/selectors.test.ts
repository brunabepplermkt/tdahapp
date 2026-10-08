import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { weekDays } from "./dates";
import { completeItem, postponeItem } from "./operations";
import { moneySummary, pendingDecisions, selectMonth, selectToday, selectWeek } from "./selectors";

const today = "2026-10-08";

describe("Hoje", () => {
  const data = buildDemoData(today);
  const view = selectToday(data, today);

  it("mostra no máximo 3 prioridades", () => {
    expect(view.priorities.length).toBeGreaterThan(0);
    expect(view.priorities.length).toBeLessThanOrEqual(3);
  });

  it("item quebrado em passos aparece pelo próximo passo", () => {
    const all = [...view.priorities, ...view.alsoToday];
    const step = all.find((e) => e.parent?.title.startsWith("Enviar proposta"));
    if (step) expect(step.item.title).toBe("Ajustar preço e escopo");
  });

  it("agenda de hoje ordenada", () => {
    expect(view.agenda.map((e) => e.startTime)).toEqual(["10:00", "15:00"]);
  });

  it("dinheiro inclui conta vencida e as próximas 3 dias, sem pagas", () => {
    const titles = view.money.map((m) => m.title);
    expect(titles).toContain("Internet de casa");
    expect(titles).toContain("Pagar fatura do cartão");
    expect(view.money.every((m) => !m.money?.settled)).toBe(true);
  });

  it("não duplica itens entre seções", () => {
    const ids = [
      ...view.priorities.map((p) => p.parent?.id ?? p.item.id),
      ...view.overdue.map((i) => i.id),
      ...view.alsoToday.map((p) => p.parent?.id ?? p.item.id),
      ...view.slipped.map((i) => i.id),
      ...view.money.map((i) => i.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tem inbox e decisões", () => {
    expect(view.inboxCount).toBe(5);
    expect(view.pendingDecisions).toBeGreaterThan(0);
  });
});

describe("Semana e Mês usam os mesmos itens", () => {
  const data = buildDemoData(today);
  it("um item com prazo aparece no dia certo da semana e do mês", () => {
    const week = selectWeek(data, weekDays(today), today);
    const friday = week.days.find((d) => d.date === "2026-10-09")!;
    expect(friday.items.some((i) => i.title === "Ver por que o webhook está falhando")).toBe(true);
    const month = selectMonth(data, today, today);
    expect(month.byDay["2026-10-09"].some((i) => i.title === "Ver por que o webhook está falhando")).toBe(true);
  });

  it("projeta recorrências no mês seguinte", () => {
    const month = selectMonth(data, "2026-11-15", today);
    const cartao = month.moneyEntries.filter((i) => i.title === "Pagar fatura do cartão");
    expect(cartao.length).toBe(1);
    expect(cartao[0].dueDate).toBe("2026-11-09");
  });
});

describe("operações", () => {
  it("concluir conta recorrente cria a próxima ocorrência", () => {
    const data = buildDemoData(today);
    const bill = data.items.find((i) => i.title === "Pagar fatura do cartão")!;
    const next = completeItem(data, bill.id);
    const series = next.items.filter((i) => i.recurrence?.seriesId === bill.recurrence!.seriesId);
    expect(series).toHaveLength(2);
    expect(series.find((i) => i.status === "open")!.dueDate).toBe("2026-11-09");
    // a decisão de pagamento some quando o item já foi resolvido
    expect(pendingDecisions(next.decisions, today, next.items).some((d) => d.itemId === bill.id)).toBe(false);
  });

  it("adiar não muda o prazo real e conta adiamentos", () => {
    const data = buildDemoData(today);
    const item = data.items.find((i) => i.title === "Ver por que o webhook está falhando")!;
    const next = postponeItem(data, item.id, "2026-10-12");
    const after = next.items.find((i) => i.id === item.id)!;
    expect(after.dueDate).toBe(item.dueDate);
    expect(after.scheduledDate).toBe("2026-10-12");
    expect(after.postponeCount).toBe(1);
  });

  it("resumo financeiro", () => {
    const s = moneySummary(
      [
        { money: { amountCents: 1000, direction: "out", settled: false }, status: "open", dueDate: "2026-10-01" },
        { money: { amountCents: 500, direction: "out", settled: true }, status: "done" },
        { money: { amountCents: 3000, direction: "in", settled: false }, status: "open" },
      ] as never,
      today,
    );
    expect(s).toMatchObject({ toPay: 1000, paid: 500, toReceive: 3000, forecast: 1500, overdueToPay: 1000 });
  });
});
