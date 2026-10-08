/**
 * Agente local baseado em regras (o “observador”).
 *
 * Roda quando o app abre/dados mudam e PROPÕE ações como agente
 * (actor = "agent"). Como todas as WRITE tools exigem confirmação quando
 * chamadas por agente, cada proposta vira uma decisão na fila — nada muda sem
 * você aprovar. Um agente LLM futuro entra exatamente no mesmo ponto.
 */
import { addDays, diffDays, relativeDay } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { isOpen, summarizeProject } from "@/lib/domain/selectors";
import type { AppData, ISODate } from "@/lib/domain/types";
import { suggestSteps } from "./breakdown";
import { executeTool } from "./tools";

export function runAgentRules(data: AppData, today: ISODate): AppData {
  let next = data;
  const ctx = { today };

  // 1) Contas vencendo em até 2 dias → “já pagou?” (registra pagamento; não paga nada)
  for (const bill of next.items.filter(
    (i) =>
      isOpen(i) &&
      i.money?.direction === "out" &&
      !i.money.settled &&
      i.dueDate &&
      diffDays(i.dueDate, today) <= 2 &&
      diffDays(i.dueDate, today) >= -7,
  )) {
    const when = relativeDay(bill.dueDate!, today);
    next = executeTool(
      next,
      { tool: "mark_paid", input: { itemId: bill.id } },
      {
        actor: "agent",
        ctx,
        decision: {
          kind: "pay",
          title: `${bill.title}${bill.money!.amountCents ? ` · ${formatBRL(bill.money!.amountCents)}` : ""}`,
          context:
            bill.dueDate! < today
              ? `Venceu ${when}. Se já pagou, aprove para registrar. O app não faz pagamentos.`
              : `Vence ${when}. Aprove só depois de pagar — o app não movimenta dinheiro.`,
          itemId: bill.id,
          dedupeKey: `pay:${bill.id}:${bill.dueDate}`,
        },
      },
    ).data;
  }

  // 2) Item adiado 3+ vezes → sugerir quebrar em passos
  for (const item of next.items.filter(
    (i) => isOpen(i) && i.postponeCount >= 3 && !next.items.some((c) => c.parentId === i.id),
  )) {
    const steps = suggestSteps(item.title);
    next = executeTool(
      next,
      { tool: "add_steps", input: { itemId: item.id, steps } },
      {
        actor: "agent",
        ctx,
        decision: {
          kind: "agent_suggestion",
          title: `Quebrar “${item.title}” em passos menores?`,
          context: `Já foi adiado ${item.postponeCount} vezes — normal quando a tarefa é grande demais. Primeiro passo: “${steps[0]}”.`,
          itemId: item.id,
          dedupeKey: `steps:${item.id}:${item.postponeCount}`,
        },
      },
    ).data;
  }

  // 3) Projeto ativo sem próxima ação → criar uma para hoje
  for (const project of next.projects.filter((p) => p.status === "active")) {
    const s = summarizeProject(next, project, today);
    if (s.nextAction) continue;
    next = executeTool(
      next,
      {
        tool: "create_item",
        input: {
          item: {
            title: `Definir próximo passo de ${project.name}`,
            kind: "task",
            area: project.area,
            projectId: project.id,
            scheduledDate: today,
            estimateMin: 10,
          },
        },
      },
      {
        actor: "agent",
        ctx,
        decision: {
          kind: "agent_suggestion",
          title: `${project.name} está sem próxima ação`,
          context: "Criar um item de 10 min para hoje: decidir o próximo passo.",
          projectId: project.id,
          dedupeKey: `nextaction:${project.id}:${s.done.length}`,
        },
      },
    ).data;
  }

  // 4) Compromissos em conflito → propor mover o segundo para o dia seguinte
  const events = next.items
    .filter((i) => isOpen(i) && i.kind === "event" && i.scheduledDate && i.startTime && i.scheduledDate >= today)
    .sort((a, b) => `${a.scheduledDate}${a.startTime}`.localeCompare(`${b.scheduledDate}${b.startTime}`));
  for (let k = 1; k < events.length; k++) {
    const a = events[k - 1];
    const b = events[k];
    if (a.scheduledDate !== b.scheduledDate) continue;
    const aEnd = a.endTime ?? a.startTime!;
    if (b.startTime! < aEnd || a.startTime === b.startTime) {
      const to = addDays(b.scheduledDate!, 1);
      next = executeTool(
        next,
        { tool: "schedule_item", input: { itemId: b.id, date: to } },
        {
          actor: "agent",
          ctx,
          decision: {
            kind: "choose_date",
            title: `Conflito: “${a.title}” e “${b.title}”`,
            context: `Os dois ${relativeDay(a.scheduledDate!, today)} por volta das ${b.startTime}. Sugestão: mover “${b.title}” para ${relativeDay(to, today)}.`,
            itemId: b.id,
            dedupeKey: `conflict:${a.id}:${b.id}:${a.scheduledDate}`,
          },
        },
      ).data;
    }
  }

  return next;
}
