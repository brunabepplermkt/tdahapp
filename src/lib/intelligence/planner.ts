/**
 * “Organizar minha semana” / “Organizar meu mês”.
 *
 * Gera uma PROPOSTA (preview). Nada é gravado aqui: a UI mostra os movimentos,
 * você desmarca o que não quiser e só então eles viram chamadas da WRITE tool
 * `schedule_item`, registradas na atividade.
 */
import { addDays, fromISODate, isWeekend, monthEnd, relativeDay, weekDays, weekStart } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import {
  ACTIONABLE_KINDS,
  bucketForDay,
  isOpen,
  isOverdue,
  isSlipped,
  itemLoad,
  selectMonth,
  summarizeProject,
} from "@/lib/domain/selectors";
import type { AppData, ISODate, Item } from "@/lib/domain/types";

export interface PlanMove {
  itemId: string;
  title: string;
  from: ISODate | null;
  to: ISODate;
  reason: string;
}

export interface PlanProposal {
  scope: "week" | "month";
  moves: PlanMove[];
  /** avisos em linguagem humana: dias pesados, conflitos, saldo, projetos parados */
  warnings: string[];
  /** itens que deixei de fora de propósito para não lotar */
  leftOut: { itemId: string; title: string }[];
  summary: string;
}

const WEEKDAY_CAPACITY = 180; // minutos de “tarefas” por dia útil, além da agenda
const WEEKEND_CAPACITY = 90;
const MAX_MOVES_WEEK = 12;
const MAX_MOVES_MONTH = 16;

function capacity(date: ISODate): number {
  return isWeekend(date) ? WEEKEND_CAPACITY : WEEKDAY_CAPACITY;
}

/** Evita sexta→sábado para contas: se cair no fim de semana, antecipa para sexta. */
function businessDayOnOrBefore(date: ISODate): ISODate {
  const wd = fromISODate(date).getDay();
  if (wd === 6) return addDays(date, -1);
  if (wd === 0) return addDays(date, -2);
  return date;
}

function eventConflicts(items: Item[], day: ISODate): string[] {
  const events = items
    .filter((i) => i.kind === "event" && isOpen(i) && i.scheduledDate === day && i.startTime)
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  const out: string[] = [];
  for (let k = 1; k < events.length; k++) {
    const prev = events[k - 1];
    const cur = events[k];
    const prevEnd = prev.endTime ?? prev.startTime!;
    if (cur.startTime! < prevEnd || cur.startTime === prev.startTime) {
      out.push(
        `Conflito em ${day.slice(8, 10)}/${day.slice(5, 7)}: “${prev.title}” e “${cur.title}” se sobrepõem às ${cur.startTime}.`,
      );
    }
  }
  return out;
}

function candidateOrder(today: ISODate) {
  return (a: Item, b: Item) => {
    const oa = isOverdue(a, today) ? 0 : 1;
    const ob = isOverdue(b, today) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const da = a.dueDate ?? "9999";
    const db = b.dueDate ?? "9999";
    if (da !== db) return da.localeCompare(db);
    const sa = isSlipped(a, today) ? 0 : 1;
    const sb = isSlipped(b, today) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const pa = a.priority === "high" ? 0 : a.priority === "normal" ? 1 : 2;
    const pb = b.priority === "high" ? 0 : b.priority === "normal" ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  };
}

/* ---------------------------------------------------------------------------
 * Semana
 * ------------------------------------------------------------------------- */

export function proposeWeekPlan(data: AppData, anyDayInWeek: ISODate, today: ISODate): PlanProposal {
  const days = weekDays(anyDayInWeek).filter((d) => d >= today);
  const warnings: string[] = [];
  const moves: PlanMove[] = [];
  const leftOut: PlanProposal["leftOut"] = [];
  if (days.length === 0) {
    return { scope: "week", moves, warnings, leftOut, summary: "Essa semana já passou." };
  }
  const last = days[days.length - 1];

  // carga atual por dia
  const remaining = new Map<ISODate, number>();
  for (const d of days) {
    const b = bucketForDay(data.items, d);
    const eventsLoad = b.events.filter(isOpen).reduce((s, e) => s + itemLoad(e), 0);
    // só o que já está PLANEJADO para o dia; itens que só têm prazo ali ainda serão distribuídos
    const tasksLoad = b.items.filter((i) => isOpen(i) && i.scheduledDate === d).reduce((s, e) => s + itemLoad(e), 0);
    remaining.set(d, capacity(d) - tasksLoad - eventsLoad * 0.5);
    if (eventsLoad >= 240) {
      warnings.push(
        `${capitalize(relativeDay(d, today))} está pesado (${Math.round(eventsLoad / 60)}h de compromissos). Deixei mais leve.`,
      );
      remaining.set(d, Math.min(remaining.get(d)!, 30));
    }
    warnings.push(...eventConflicts(data.items, d));
  }

  // contas da semana sem dia de pagamento → antecipar para dia útil
  for (const bill of data.items.filter(
    (i) =>
      isOpen(i) &&
      i.money?.direction === "out" &&
      !i.money.settled &&
      !i.scheduledDate &&
      i.dueDate &&
      i.dueDate <= last,
  )) {
    const target = bill.dueDate! < today ? today : businessDayOnOrBefore(addDays(bill.dueDate!, -1));
    const to = target < today ? today : target;
    moves.push({
      itemId: bill.id,
      title: bill.title,
      from: null,
      to,
      reason:
        bill.dueDate! < today
          ? "Venceu — melhor resolver logo"
          : `Vence ${relativeDay(bill.dueDate!, today)} (${formatBRL(bill.money!.amountCents, true)}) — pagar com folga`,
    });
  }

  const parents = new Set(data.items.filter((i) => i.parentId).map((i) => i.parentId));
  const candidates = data.items
    .filter(
      (i) =>
        isOpen(i) &&
        ACTIONABLE_KINDS.has(i.kind) &&
        !i.money &&
        (!i.parentId || !data.items.some((p) => p.id === i.parentId && isOpen(p))) &&
        (!i.scheduledDate || isSlipped(i, today)) &&
        (!i.dueDate || i.dueDate <= addDays(last, 7)),
    )
    .sort(candidateOrder(today));

  for (const item of candidates) {
    // item quebrado em passos: o que pesa na semana é o próximo passo, não o todo
    const step = data.items.find((c) => c.parentId === item.id && isOpen(c));
    const load = itemLoad(step ?? item);
    // atrasado: qualquer dia serve, o mais cedo possível
    const deadline = item.dueDate && item.dueDate >= today && item.dueDate <= last ? item.dueDate : last;
    const allowed = days.filter((d) => d <= deadline);
    const pool = allowed.filter((d) => !(item.area === "work" && isWeekend(d)) || allowed.every(isWeekend));

    if (moves.length >= MAX_MOVES_WEEK) {
      leftOut.push({ itemId: item.id, title: item.title });
      continue;
    }

    const urgent = isOverdue(item, today) || (item.dueDate && item.dueDate <= last);
    let best: ISODate | null = null;
    if (urgent) {
      // com prazo: o primeiro dia com espaço (segurança)
      best = pool.find((d) => remaining.get(d)! >= load) ?? null;
    } else {
      // sem prazo: o dia mais folgado (espalha em vez de lotar a segunda)
      best = [...pool].sort((a, b) => remaining.get(b)! - remaining.get(a)! || a.localeCompare(b))[0] ?? null;
      if (best && remaining.get(best)! < load) best = null;
    }

    if (!best) {
      if (urgent) {
        best = pool[0] ?? today;
        warnings.push(
          `“${item.title}” tem prazo, mas a semana está cheia. Coloquei ${relativeDay(best, today)} mesmo assim.`,
        );
      } else {
        leftOut.push({ itemId: item.id, title: item.title });
        continue;
      }
    }

    remaining.set(best, remaining.get(best)! - load);
    moves.push({
      itemId: item.id,
      title: parents.has(item.id) ? `${item.title} (próximo passo)` : item.title,
      from: item.scheduledDate ?? null,
      to: best,
      reason: isOverdue(item, today)
        ? "Prazo já passou"
        : item.dueDate && item.dueDate <= last
          ? `Prazo ${relativeDay(item.dueDate, today)}`
          : isSlipped(item, today)
            ? "Ficou de outro dia"
            : "Dia com mais espaço",
    });
  }

  const summary =
    moves.length === 0
      ? "Sua semana já está organizada. Nada para mover."
      : `${moves.length} ${moves.length === 1 ? "item ganha" : "itens ganham"} um dia.` +
        (leftOut.length ? ` ${leftOut.length} ficam de fora para não lotar — tudo bem.` : "");

  return { scope: "week", moves, warnings: dedupe(warnings), leftOut, summary };
}

/* ---------------------------------------------------------------------------
 * Mês
 * ------------------------------------------------------------------------- */

export function proposeMonthPlan(data: AppData, anyDayInMonth: ISODate, today: ISODate): PlanProposal {
  const end = monthEnd(anyDayInMonth);
  const warnings: string[] = [];
  const moves: PlanMove[] = [];
  const leftOut: PlanProposal["leftOut"] = [];
  const from = today > anyDayInMonth.slice(0, 8) + "01" ? today : anyDayInMonth.slice(0, 8) + "01";
  if (from > end) return { scope: "month", moves, warnings, leftOut, summary: "Esse mês já passou." };

  const inMonth = (d?: ISODate | null) => !!d && d >= from && d <= end;

  // 1) contas do mês sem dia de pagamento: 2 dias antes, em dia útil
  for (const bill of data.items.filter(
    (i) => isOpen(i) && i.money?.direction === "out" && !i.money.settled && !i.scheduledDate && inMonth(i.dueDate),
  )) {
    let to = businessDayOnOrBefore(addDays(bill.dueDate!, -2));
    if (to < today) to = today;
    moves.push({
      itemId: bill.id,
      title: bill.title,
      from: null,
      to,
      reason: `Vence dia ${Number(bill.dueDate!.slice(8, 10))} — ${formatBRL(bill.money!.amountCents, true)}`,
    });
  }

  // 2) prazos do mês sem dia planejado: começar alguns dias antes
  for (const item of data.items
    .filter(
      (i) =>
        isOpen(i) && !i.money && ACTIONABLE_KINDS.has(i.kind) && !i.scheduledDate && !i.parentId && inMonth(i.dueDate),
    )
    .sort(candidateOrder(today))) {
    const lead = (item.estimateMin ?? 30) >= 120 || data.items.some((c) => c.parentId === item.id) ? 5 : 2;
    let to = businessDayOnOrBefore(addDays(item.dueDate!, -lead));
    if (to < today) to = today;
    moves.push({
      itemId: item.id,
      title: item.title,
      from: null,
      to,
      reason: `Prazo dia ${Number(item.dueDate!.slice(8, 10))} — começar com folga`,
    });
  }

  // 3) itens sem data: distribuir pelas semanas restantes (segunda de cada semana)
  const weeks: ISODate[] = [];
  for (let w = weekStart(from); w <= end; w = addDays(w, 7)) {
    const monday = w < from ? from : w;
    weeks.push(monday);
  }
  const perWeek = new Map(weeks.map((w) => [w, 0]));
  const undated = data.items
    .filter(
      (i) => isOpen(i) && ACTIONABLE_KINDS.has(i.kind) && !i.money && !i.parentId && !i.scheduledDate && !i.dueDate,
    )
    .sort(candidateOrder(today));
  for (const item of undated) {
    if (moves.length >= MAX_MOVES_MONTH) {
      leftOut.push({ itemId: item.id, title: item.title });
      continue;
    }
    // work nas semanas mais vazias; segunda ou terça
    const target = [...perWeek.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!target || target[1] >= 4) {
      leftOut.push({ itemId: item.id, title: item.title });
      continue;
    }
    perWeek.set(target[0], target[1] + 1);
    moves.push({
      itemId: item.id,
      title: item.title,
      from: null,
      to: target[0],
      reason: `Semana de ${Number(target[0].slice(8, 10))}/${Number(target[0].slice(5, 7))}`,
    });
  }

  // avisos
  const month = selectMonth(data, anyDayInMonth, today);
  if (month.money.forecast < 0) {
    warnings.push(
      `Saldo previsto do mês está negativo (${formatBRL(month.money.forecast)}). Vale olhar despesas que podem esperar.`,
    );
  }
  for (const p of data.projects.filter((p) => p.status === "active")) {
    const s = summarizeProject(data, p, today);
    if (!s.nextAction) warnings.push(`${p.name} está sem próxima ação. Uma frase já basta.`);
    if (p.deadline && inMonth(p.deadline) && s.open.length > 3) {
      warnings.push(`${p.name} vence dia ${Number(p.deadline.slice(8, 10))} e ainda tem ${s.open.length} pendências.`);
    }
  }
  for (let d = from; d <= end; d = addDays(d, 1)) warnings.push(...eventConflicts(data.items, d));

  const summary =
    moves.length === 0
      ? "Nada para distribuir neste mês."
      : `Proposta: ${moves.length} ${moves.length === 1 ? "item ganha" : "itens ganham"} data.` +
        (leftOut.length ? ` ${leftOut.length} continuam sem data — sem problema.` : "");
  return { scope: "month", moves, warnings: dedupe(warnings), leftOut, summary };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
