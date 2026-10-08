/**
 * Seletores puros: derivam Hoje / Semana / Mês a partir dos MESMOS itens.
 *
 * Regra de posicionamento (única para todas as telas):
 *   placementDate = scheduledDate ?? dueDate
 * Um item com prazo no mês aparece no Mês; quando a semana chega ele aparece
 * na Semana; no dia (ou quando ganha urgência) entra no Hoje.
 */
import {
  addDays,
  diffDays,
  isBetween,
  monthEnd,
  monthStart,
  nextOccurrence,
} from "./dates";
import type { AppData, Capture, Decision, ISODate, Item, Project } from "./types";

export const ACTIONABLE_KINDS = new Set<Item["kind"]>([
  "task",
  "reminder",
  "shopping",
  "routine",
]);

export const MONEY_KINDS = new Set<Item["kind"]>(["bill", "income", "expense"]);

export function isOpen(item: Item): boolean {
  return item.status === "open";
}

export function placementDate(item: Item): ISODate | null {
  return item.scheduledDate ?? item.dueDate ?? null;
}

export function isMoney(item: Item): boolean {
  return !!item.money || MONEY_KINDS.has(item.kind);
}

/** Prazo real vencido. */
export function isOverdue(item: Item, today: ISODate): boolean {
  if (!isOpen(item) || !item.dueDate) return false;
  if (item.kind === "event") return false;
  return item.dueDate < today;
}

/** Planejado para um dia que já passou, sem prazo vencido: “ficou pra trás”. */
export function isSlipped(item: Item, today: ISODate): boolean {
  if (!isOpen(item) || item.kind === "event") return false;
  if (!item.scheduledDate || item.scheduledDate >= today) return false;
  return !isOverdue(item, today);
}

export function childrenOf(items: Item[], parentId: string): Item[] {
  return items.filter((i) => i.parentId === parentId);
}

/** Próxima ação de um item quebrado em passos (primeiro filho aberto). */
export function nextStep(items: Item[], parent: Item): Item | null {
  return childrenOf(items, parent.id).find(isOpen) ?? null;
}

/* ---------------------------------------------------------------------------
 * Relevância
 * ------------------------------------------------------------------------- */

export interface Scored {
  item: Item;
  score: number;
  reasons: string[];
}

/**
 * Pontuação de relevância para HOJE. Não é “produtividade”: é a resposta para
 * “isso merece minha atenção agora?”. Retorna 0 quando não é assunto de hoje.
 */
export function relevanceToday(item: Item, today: ISODate, projects: Project[] = []): Scored {
  const reasons: string[] = [];
  let score = 0;
  if (!isOpen(item) || item.kind === "event" || item.kind === "idea" || item.kind === "goal") {
    return { item, score: 0, reasons };
  }

  if (item.focusDate === today) {
    score += 1000;
    reasons.push("Você escolheu como foco");
  }

  if (item.dueDate) {
    const d = diffDays(item.dueDate, today);
    if (d < 0) {
      score += 60 + Math.min(-d, 10) * 2;
      reasons.push(-d === 1 ? "Prazo era ontem" : `Prazo passou há ${-d} dias`);
    } else if (d === 0) {
      score += 55;
      reasons.push("Prazo é hoje");
    } else if (d === 1) {
      score += 35;
      reasons.push("Prazo é amanhã");
    } else if (d <= 3) {
      score += 20;
      reasons.push(`Prazo em ${d} dias`);
    } else if (d <= 7) {
      score += 6;
    }
  }

  if (item.scheduledDate) {
    if (item.scheduledDate === today) {
      score += 30;
      reasons.push("Planejado para hoje");
    } else if (item.scheduledDate < today) {
      score += 16;
      reasons.push("Ficou de outro dia");
    } else {
      // planejado para o futuro: não é assunto de hoje (a não ser pelo prazo)
      score -= 20;
    }
  }

  // prioridade só amplifica o que já tem algum sinal de “agora”
  if (score > 0) {
    if (item.priority === "high") {
      score += 25;
      reasons.push("Marcado como importante");
    } else if (item.priority === "low") {
      score -= 10;
    }
    if (item.money && item.money.direction === "out" && !item.money.settled) score += 8;

    const project = item.projectId ? projects.find((p) => p.id === item.projectId) : undefined;
    if (project?.deadline) {
      const pd = diffDays(project.deadline, today);
      if (pd >= 0 && pd <= 7) {
        score += 8;
        reasons.push(`${project.name} vence em ${pd === 0 ? "hoje" : `${pd} dias`}`);
      }
    }
  }

  return { item, score: Math.max(score, 0), reasons };
}

/* ---------------------------------------------------------------------------
 * HOJE
 * ------------------------------------------------------------------------- */

export interface TodayEntry {
  /** item a mostrar (pode ser o próximo passo de um item maior) */
  item: Item;
  /** se `item` é um passo, o item “pai” para contexto */
  parent?: Item;
  score: number;
  reasons: string[];
}

export interface TodayView {
  today: ISODate;
  /** 1–3 prioridades reais */
  priorities: TodayEntry[];
  agenda: Item[];
  money: Item[];
  /** prazos vencidos que merecem atenção (fora das prioridades), no máx. 3 */
  overdue: Item[];
  overdueHiddenCount: number;
  /** planejados para hoje que não entraram nas prioridades */
  alsoToday: TodayEntry[];
  /** planejados em dias anteriores, sem prazo vencido */
  slipped: Item[];
  /** um item esquecido para relembrar com leveza */
  resurface: Item | null;
  inboxCount: number;
  pendingDecisions: number;
  doneToday: number;
}

const PRIORITY_THRESHOLD = 30;
const MAX_PRIORITIES = 3;

function resolveEntry(items: Item[], s: Scored): TodayEntry {
  const step = nextStep(items, s.item);
  if (step) return { item: step, parent: s.item, score: s.score, reasons: s.reasons };
  return { item: s.item, score: s.score, reasons: s.reasons };
}

/** Itens que são passos de um pai aberto não competem sozinhos — o pai os representa. */
function isStepOfOpenParent(items: Item[], item: Item): boolean {
  if (!item.parentId) return false;
  const parent = items.find((i) => i.id === item.parentId);
  return !!parent && isOpen(parent);
}

export function selectToday(data: AppData, today: ISODate): TodayView {
  const { items, projects } = data;
  const open = items.filter(isOpen);

  const agenda = open
    .filter((i) => i.kind === "event" && i.scheduledDate === today)
    .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));

  const money = open
    .filter(
      (i) =>
        isMoney(i) &&
        !i.money?.settled &&
        !!i.dueDate &&
        diffDays(i.dueDate, today) <= 3,
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 4);
  const moneyIds = new Set(money.map((m) => m.id));

  const candidates = open
    .filter((i) => !isMoney(i))
    .filter((i) => !isStepOfOpenParent(items, i))
    .map((i) => relevanceToday(i, today, projects))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const priorities = candidates
    .filter((s) => s.score >= PRIORITY_THRESHOLD)
    .slice(0, MAX_PRIORITIES)
    .map((s) => resolveEntry(items, s));
  const shown = new Set(priorities.map((p) => p.parent?.id ?? p.item.id));

  const overdueAll = open
    .filter((i) => isOverdue(i, today) && !shown.has(i.id) && !moneyIds.has(i.id))
    .filter((i) => !isStepOfOpenParent(items, i))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const overdue = overdueAll.slice(0, 3);
  overdue.forEach((i) => shown.add(i.id));

  const alsoToday = candidates
    .filter((s) => !shown.has(s.item.id) && s.item.scheduledDate === today)
    .map((s) => resolveEntry(items, s));
  alsoToday.forEach((e) => shown.add(e.parent?.id ?? e.item.id));

  const slipped = open
    .filter((i) => isSlipped(i, today) && !shown.has(i.id) && !isMoney(i))
    .filter((i) => !isStepOfOpenParent(items, i))
    .sort((a, b) => (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? ""));

  return {
    today,
    priorities,
    agenda,
    money,
    overdue,
    overdueHiddenCount: Math.max(overdueAll.length - overdue.length, 0),
    alsoToday,
    slipped,
    resurface: pickForgotten(items, today, shown),
    inboxCount: inboxCaptures(data.captures, today).length,
    pendingDecisions: pendingDecisions(data.decisions, today, data.items).length,
    doneToday: items.filter((i) => i.completedAt && i.completedAt.slice(0, 10) === today).length,
  };
}

/**
 * Um item esquecido (sem data, parado há 10+ dias) para relembrar com leveza.
 * Escolha determinística pelo dia, para não “pular” a cada render.
 */
export function pickForgotten(items: Item[], today: ISODate, exclude = new Set<string>()): Item | null {
  const pool = forgottenItems(items, today).filter((i) => !exclude.has(i.id));
  if (pool.length === 0) return null;
  const seed = Number(today.replaceAll("-", "")) % pool.length;
  return pool[seed];
}

export function forgottenItems(items: Item[], today: ISODate): Item[] {
  return items
    .filter(
      (i) =>
        isOpen(i) &&
        !i.parentId &&
        !placementDate(i) &&
        i.kind !== "idea" &&
        i.kind !== "goal" &&
        diffDays(today, i.updatedAt.slice(0, 10)) >= 10,
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/* ---------------------------------------------------------------------------
 * SEMANA
 * ------------------------------------------------------------------------- */

export interface DayBucket {
  date: ISODate;
  events: Item[];
  items: Item[];
  money: Item[];
  /** prazos que caem neste dia (itens planejados para outro dia) */
  deadlines: Item[];
  load: number;
}

export interface WeekView {
  days: DayBucket[];
  /** itens sem dia (ainda não distribuídos) e relevantes para esta semana */
  unscheduled: Item[];
  /** projetos ativos que precisam avançar */
  projectsToPush: { project: Project; reason: string; nextAction: Item | null }[];
  slipped: Item[];
  totals: { out: number; in: number };
}

/** Peso de um item na carga do dia (minutos aproximados). */
export function itemLoad(item: Item): number {
  if (item.kind === "event") {
    if (item.startTime && item.endTime) {
      const [sh, sm] = item.startTime.split(":").map(Number);
      const [eh, em] = item.endTime.split(":").map(Number);
      return Math.max(eh * 60 + em - (sh * 60 + sm), 15);
    }
    return 60;
  }
  return item.estimateMin ?? 30;
}

export function bucketForDay(items: Item[], date: ISODate): DayBucket {
  const placed = items.filter(
    (i) => (isOpen(i) || i.status === "done") && placementDate(i) === date && !isStepOfOpenParent(items, i),
  );
  const events = placed
    .filter((i) => i.kind === "event")
    .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  const money = placed.filter((i) => i.kind !== "event" && isMoney(i));
  const rest = placed.filter((i) => i.kind !== "event" && !isMoney(i) && i.kind !== "goal");
  const deadlines = items.filter(
    (i) => isOpen(i) && i.dueDate === date && i.scheduledDate && i.scheduledDate !== date,
  );
  const load = [...events, ...rest].filter(isOpen).reduce((sum, i) => sum + itemLoad(i), 0);
  return { date, events, items: rest, money, deadlines, load };
}

export function selectWeek(data: AppData, days: ISODate[], today: ISODate): WeekView {
  const { items, projects } = data;
  const first = days[0];
  const last = days[days.length - 1];
  const buckets = days.map((d) => bucketForDay(items, d));

  const unscheduled = items
    .filter(
      (i) =>
        isOpen(i) &&
        !i.parentId &&
        !i.scheduledDate &&
        ACTIONABLE_KINDS.has(i.kind) &&
        (!i.dueDate || i.dueDate <= last),
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  const projectsToPush = projects
    .filter((p) => p.status === "active")
    .map((project) => {
      const related = items.filter((i) => i.projectId === project.id && isOpen(i) && !i.parentId);
      const nextAction =
        related
          .filter((i) => i.kind !== "idea")
          .sort((a, b) => (placementDate(a) ?? "9999").localeCompare(placementDate(b) ?? "9999"))[0] ??
        null;
      const thisWeek = related.some((i) => {
        const d = placementDate(i);
        return d && isBetween(d, first, last);
      });
      let reason = "";
      if (!nextAction) reason = "Sem próxima ação definida";
      else if (project.deadline && diffDays(project.deadline, today) <= 14 && diffDays(project.deadline, today) >= 0)
        reason = `Prazo em ${diffDays(project.deadline, today)} dias`;
      else if (!thisWeek) reason = "Nada planejado para esta semana";
      return { project, reason, nextAction };
    })
    .filter((p) => p.reason);

  let out = 0;
  let inc = 0;
  for (const b of buckets) {
    for (const m of b.money) {
      if (!m.money || m.money.settled) continue;
      if (m.money.direction === "out") out += m.money.amountCents;
      else inc += m.money.amountCents;
    }
  }

  return {
    days: buckets,
    unscheduled,
    projectsToPush,
    slipped: first <= today && today <= last ? items.filter((i) => isSlipped(i, today) && !isMoney(i)) : [],
    totals: { out, in: inc },
  };
}

/* ---------------------------------------------------------------------------
 * MÊS
 * ------------------------------------------------------------------------- */

/** Ocorrência projetada (virtual) de um item recorrente. */
export interface Projected extends Item {
  projected: true;
  sourceId: string;
}

export function isProjected(item: Item): item is Projected {
  return (item as Projected).projected === true;
}

/**
 * Projeta ocorrências futuras de itens recorrentes abertos até `until`,
 * sem gravar nada — servem para o Mês e o resumo financeiro.
 */
export function projectRecurrences(items: Item[], until: ISODate): Projected[] {
  const out: Projected[] = [];
  for (const item of items) {
    if (!isOpen(item) || !item.recurrence) continue;
    let date = placementDate(item);
    if (!date) continue;
    const { freq, interval = 1 } = item.recurrence;
    for (let n = 0; n < 60; n++) {
      date = nextOccurrence(date, freq, interval);
      if (date > until) break;
      out.push({
        ...item,
        id: `${item.id}@${date}`,
        sourceId: item.id,
        projected: true,
        dueDate: item.dueDate ? date : null,
        scheduledDate: item.dueDate ? null : date,
        money: item.money ? { ...item.money, settled: false, settledAt: undefined } : null,
      });
    }
  }
  return out;
}

export interface MoneySummary {
  toPay: number;
  paid: number;
  toReceive: number;
  received: number;
  /** (recebido + a receber) − (pago + a pagar) */
  forecast: number;
  overdueToPay: number;
}

export function moneySummary(entries: Item[], today: ISODate): MoneySummary {
  const s: MoneySummary = { toPay: 0, paid: 0, toReceive: 0, received: 0, forecast: 0, overdueToPay: 0 };
  for (const i of entries) {
    if (!i.money || i.status === "archived") continue;
    const { amountCents: v, direction, settled } = i.money;
    if (direction === "out") {
      if (settled) s.paid += v;
      else {
        s.toPay += v;
        if (i.dueDate && i.dueDate < today) s.overdueToPay += v;
      }
    } else if (settled) s.received += v;
    else s.toReceive += v;
  }
  s.forecast = s.received + s.toReceive - (s.paid + s.toPay);
  return s;
}

export interface MonthView {
  start: ISODate;
  end: ISODate;
  /** itens (reais + projetados) por dia */
  byDay: Record<ISODate, Item[]>;
  money: MoneySummary;
  moneyEntries: Item[];
  deadlines: Item[];
  goals: Item[];
  projects: Project[];
  /** coisas importantes chegando nos próximos 30 dias a partir de hoje */
  upcoming: Item[];
  unscheduledCount: number;
}

export function itemsInRange(items: Item[], from: ISODate, to: ISODate): Item[] {
  return items.filter((i) => {
    const d = placementDate(i);
    return !!d && i.status !== "archived" && isBetween(d, from, to);
  });
}

export function selectMonth(data: AppData, anyDayInMonth: ISODate, today: ISODate): MonthView {
  const start = monthStart(anyDayInMonth);
  const end = monthEnd(anyDayInMonth);
  const { items, projects } = data;
  const real = items.filter((i) => !isStepOfOpenParent(items, i));
  const projected = projectRecurrences(real, end).filter((p) => isBetween(placementDate(p)!, start, end));
  const all = [...itemsInRange(real, start, end), ...projected].filter(
    (i) => i.status === "open" || i.status === "done",
  );

  const byDay: Record<ISODate, Item[]> = {};
  for (const i of all) {
    const d = placementDate(i)!;
    (byDay[d] ??= []).push(i);
  }
  for (const d of Object.keys(byDay)) {
    byDay[d].sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  }

  const moneyEntries = all
    .filter((i) => i.money)
    .sort((a, b) => (placementDate(a) ?? "").localeCompare(placementDate(b) ?? ""));

  const deadlines = all
    .filter((i) => isOpen(i) && i.dueDate && !isMoney(i) && i.kind !== "event" && i.kind !== "goal")
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

  const goals = items.filter(
    (i) => i.kind === "goal" && i.status !== "archived" && (!i.dueDate || isBetween(i.dueDate, start, end)),
  );

  const horizon = addDays(today, 30);
  const upcoming = items
    .filter((i) => {
      if (!isOpen(i)) return false;
      const d = i.dueDate ?? (i.kind === "event" ? i.scheduledDate : null);
      if (!d || d < today || d > horizon) return false;
      return (
        i.priority === "high" ||
        i.kind === "event" ||
        (i.money && i.money.amountCents >= 50000) ||
        !!i.projectId
      );
    })
    .sort((a, b) => (a.dueDate ?? a.scheduledDate ?? "").localeCompare(b.dueDate ?? b.scheduledDate ?? ""))
    .slice(0, 6);

  return {
    start,
    end,
    byDay,
    money: moneySummary(moneyEntries, today),
    moneyEntries,
    deadlines,
    goals,
    projects: projects.filter(
      (p) => p.status === "active" && p.deadline && isBetween(p.deadline, start, addDays(end, 30)),
    ),
    upcoming,
    unscheduledCount: items.filter((i) => isOpen(i) && !placementDate(i) && ACTIONABLE_KINDS.has(i.kind) && !i.parentId).length,
  };
}

/* ---------------------------------------------------------------------------
 * Inbox / decisões / projetos
 * ------------------------------------------------------------------------- */

export function inboxCaptures(captures: Capture[], today: ISODate): Capture[] {
  return captures
    .filter(
      (c) =>
        c.status === "inbox" || (c.status === "snoozed" && (!c.snoozedUntil || c.snoozedUntil <= today)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Decisões pendentes. Se `items` for passado, esconde decisões cujo item já
 * foi resolvido por outro caminho (ex.: marcou como pago direto na lista).
 */
export function pendingDecisions(decisions: Decision[], today: ISODate, items?: Item[]): Decision[] {
  return decisions
    .filter(
      (d) =>
        d.status === "pending" || (d.status === "snoozed" && (!d.snoozedUntil || d.snoozedUntil <= today)),
    )
    .filter((d) => {
      if (!items || !d.itemId) return true;
      const item = items.find((i) => i.id === d.itemId);
      return !!item && item.status === "open";
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface ProjectSummary {
  project: Project;
  nextAction: Item | null;
  open: Item[];
  done: Item[];
  overdue: number;
}

export function summarizeProject(data: AppData, project: Project, today: ISODate): ProjectSummary {
  const related = data.items.filter((i) => i.projectId === project.id && !i.parentId);
  const open = related
    .filter(isOpen)
    .sort((a, b) => {
      const pa = a.priority === "high" ? 0 : 1;
      const pb = b.priority === "high" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (placementDate(a) ?? "9999").localeCompare(placementDate(b) ?? "9999");
    });
  const firstActionable = open.find((i) => i.kind !== "idea" && i.kind !== "event") ?? null;
  const nextAction = firstActionable ? (nextStep(data.items, firstActionable) ?? firstActionable) : null;
  return {
    project,
    nextAction,
    open,
    done: related.filter((i) => i.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    overdue: open.filter((i) => isOverdue(i, today)).length,
  };
}
