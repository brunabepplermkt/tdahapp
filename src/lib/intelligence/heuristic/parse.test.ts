import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/domain/types";
import { extractDate, interpretText, splitClauses } from "./parse";

// 2026-10-08 é uma quinta-feira
const today = "2026-10-08";
const projects: Project[] = [
  { id: "p1", name: "Zeloa", area: "work", status: "active", createdAt: "", updatedAt: "" },
  {
    id: "p2",
    name: "Sítio Recanto Azul",
    area: "work",
    status: "active",
    aliases: ["Beds24", "sítio"],
    createdAt: "",
    updatedAt: "",
  },
];
const ctx = { today, projects };

describe("splitClauses", () => {
  it("separa por ' e ' seguido de verbo", () => {
    expect(splitClauses("lembrar de pagar a hospedagem da VPS sexta e ver por que o webhook está falhando")).toEqual([
      "lembrar de pagar a hospedagem da VPS sexta",
      "ver por que o webhook está falhando",
    ]);
  });
  it("não separa 'e' comum", () => {
    expect(splitClauses("comprar arroz e feijão")).toEqual(["comprar arroz e feijão"]);
  });
});

describe("extractDate", () => {
  it("entende amanhã com acento no fim", () => {
    expect(extractDate("ligar pro banco amanhã", today).value?.date).toBe("2026-10-09");
  });
  it("entende sexta", () => {
    const r = extractDate("pagar VPS sexta", today);
    expect(r.value?.date).toBe("2026-10-09");
    expect(r.rest).toBe("pagar VPS");
  });
  it("sábado", () => {
    expect(extractDate("faxina no sábado", today).value?.date).toBe("2026-10-10");
  });
  it("próxima segunda", () => {
    expect(extractDate("enviar proposta próxima segunda", today).value?.date).toBe("2026-10-12");
  });
  it("dia 15 e dia já passado vai pro mês seguinte", () => {
    expect(extractDate("pagar aluguel dia 15", today).value?.date).toBe("2026-10-15");
    expect(extractDate("pagar aluguel dia 5", today).value?.date).toBe("2026-11-05");
  });
  it("esse mês vira prazo no fim do mês", () => {
    const r = extractDate("resolver imposto esse mês", today).value;
    expect(r?.date).toBe("2026-10-31");
    expect(r?.isDeadline).toBe(true);
  });
  it("até sexta é prazo", () => {
    expect(extractDate("entregar relatório até sexta", today).value?.isDeadline).toBe(true);
  });
  it("20/10", () => {
    expect(extractDate("consulta 20/10", today).value?.date).toBe("2026-10-20");
  });
});

describe("interpretText", () => {
  it("exemplo principal: duas tarefas, conta com prazo + tarefa de trabalho", () => {
    const r = interpretText("lembrar de pagar a hospedagem da VPS sexta e ver por que o webhook está falhando", ctx);
    expect(r.drafts).toHaveLength(2);
    const [a, b] = r.drafts;
    expect(a.kind).toBe("bill");
    expect(a.area).toBe("finance");
    expect(a.dueDate).toBe("2026-10-09");
    expect(a.title).toBe("Pagar a hospedagem da VPS");
    expect(a.money?.category).toBe("Ferramentas");
    expect(b.kind).toBe("task");
    expect(b.area).toBe("work");
    expect(b.title).toBe("Ver por que o webhook está falhando");
  });

  it("pagar cartão → conta", () => {
    const r = interpretText("pagar cartão", ctx);
    expect(r.drafts[0]).toMatchObject({ kind: "bill", area: "finance", title: "Pagar cartão" });
  });

  it("responder fulano → decisão com pessoa", () => {
    const r = interpretText("responder fulano", ctx);
    expect(r.drafts[0].people).toEqual(["Fulano"]);
    expect(r.intent).toBe("decide");
  });

  it("Beds24 reconhece projeto pelo alias", () => {
    const r = interpretText("terminar configuração do Beds24", ctx);
    expect(r.drafts[0].projectId).toBe("p2");
    expect(r.drafts[0].area).toBe("work");
  });

  it("comprar shampoo → compra pessoal", () => {
    expect(interpretText("comprar shampoo", ctx).drafts[0]).toMatchObject({ kind: "shopping", area: "personal" });
  });

  it("ideia para o Zeloa", () => {
    const d = interpretText("ideia para o Zeloa: onboarding por voz", ctx).drafts[0];
    expect(d.kind).toBe("idea");
    expect(d.projectId).toBe("p1");
  });

  it("marcar dentista é tarefa, não evento", () => {
    expect(interpretText("marcar dentista", ctx).drafts[0].kind).toBe("task");
  });

  it("dentista amanhã às 15h → evento", () => {
    const d = interpretText("dentista amanhã às 15h", ctx).drafts[0];
    expect(d).toMatchObject({ kind: "event", scheduledDate: "2026-10-09", startTime: "15:00" });
  });

  it("imposto esse mês → finanças com prazo", () => {
    const d = interpretText("preciso resolver imposto esse mês", ctx).drafts[0];
    expect(d.area).toBe("finance");
    expect(d.dueDate).toBe("2026-10-31");
    expect(d.title).toBe("Resolver imposto");
  });

  it("valor e recorrência", () => {
    const d = interpretText("pagar aluguel R$ 2.300 todo mês dia 10", ctx).drafts[0];
    expect(d.money?.amountCents).toBe(230000);
    expect(d.recurrence?.freq).toBe("monthly");
    expect(d.dueDate).toBe("2026-10-10");
  });

  it("recebimento", () => {
    const d = interpretText("receber 1500 reais do cliente dia 20", ctx).drafts[0];
    expect(d).toMatchObject({ kind: "income", money: { amountCents: 150000, direction: "in" }, dueDate: "2026-10-20" });
  });

  it("urgente vira prioridade alta e sai do título", () => {
    const d = interpretText("urgente: ligar pra contadora", ctx).drafts[0];
    expect(d.priority).toBe("high");
    expect(d.title.toLowerCase()).not.toContain("urgente");
  });
});

describe("pessoas e ideias", () => {
  it("detecta nome próprio depois de preposição", () => {
    const r = interpretText("lembrar de pagar o seguro do carro sexta e mandar o contrato pro Rafael", ctx);
    expect(r.drafts[1].people).toEqual(["Rafael"]);
    expect(r.drafts[0].people).toEqual([]);
  });
  it("não confunde projeto com pessoa", () => {
    expect(interpretText("mandar relatório pro Zeloa", ctx).drafts[0].people).toEqual([]);
  });
  it("ideia com dois pontos limpa o título", () => {
    const d = interpretText("ideia para o Zeloa: onboarding por voz", ctx).drafts[0];
    expect(d.title).toBe("Onboarding por voz");
  });
});

describe("mais formas de falar de tempo", () => {
  it("daqui 15 dias / daqui a 2 semanas / em 3 dias", () => {
    expect(extractDate("renovar seguro daqui 15 dias", today).value?.date).toBe("2026-10-23");
    expect(extractDate("revisar contrato daqui a 2 semanas", today).value?.date).toBe("2026-10-22");
    expect(extractDate("ligar em 3 dias", today).value?.date).toBe("2026-10-11");
    expect(extractDate("trocar óleo daqui a um mês", today).value?.date).toBe("2026-11-08");
  });
  it("mês que vem → dia 1 do próximo mês", () => {
    expect(extractDate("planejar férias mês que vem", today).value?.date).toBe("2026-11-01");
  });
  it("à tarde / depois do almoço viram hoje e saem do título", () => {
    const d = interpretText("ligar pro banco depois do almoço", ctx).drafts[0];
    expect(d.scheduledDate).toBe(today);
    expect(d.title).toBe("Ligar pro banco");
    const e = interpretText("amanhã à tarde levar o carro na revisão", ctx).drafts[0];
    expect(e.scheduledDate).toBe("2026-10-09");
    expect(e.title).toBe("Levar o carro na revisão");
  });
  it("às 9 sem 'h'", () => {
    const d = interpretText("reunião com cliente amanhã às 9", ctx).drafts[0];
    expect(d).toMatchObject({ kind: "event", startTime: "09:00", scheduledDate: "2026-10-09" });
  });
  it("não confunde quantidade com hora", () => {
    expect(interpretText("comprar 2 pacotes de café", ctx).drafts[0].startTime ?? null).toBeNull();
  });
});

describe("data no começo da frase", () => {
  const text = "sexta preciso pagar a VPS e terminar o checkout do Beds24";
  it("vale para as duas cláusulas e limpa o 'preciso'", () => {
    const r = interpretText(text, ctx);
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts[0]).toMatchObject({ title: "Pagar a VPS", kind: "bill", dueDate: "2026-10-09" });
    expect(r.drafts[1]).toMatchObject({ title: "Terminar o checkout do Beds24", projectId: "p2", scheduledDate: "2026-10-09" });
  });
  it("frase única também", () => {
    const r = interpretText("amanhã preciso ligar pro contador", ctx);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].title).toBe("Ligar pro contador");
    expect(r.drafts[0].scheduledDate).toBe("2026-10-09");
  });
});
