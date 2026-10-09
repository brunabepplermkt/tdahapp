/**
 * Rotinas (manhã/tarde/noite) e lembretes configuráveis.
 * Vivem fora do `AppData` de propósito: são preferências do aparelho, não
 * entram na sincronização nem no schema do banco.
 */
import type { ISODate, TimeOfDay } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/dates";

export type Period = "morning" | "afternoon" | "evening";
export const PERIODS: Period[] = ["morning", "afternoon", "evening"];
export const PERIOD_LABEL: Record<Period, string> = { morning: "Manhã", afternoon: "Tarde", evening: "Noite" };

export interface RoutineStep {
  id: string;
  title: string;
}

export type ReminderId = "routine_morning" | "routine_afternoon" | "routine_evening" | "dump" | "inbox" | "event";

export interface ReminderSetting {
  on: boolean;
  /** horário (HH:mm). Para `event`, não é usado — vale `leadMin`. */
  time: TimeOfDay;
}

export interface Prefs {
  version: 1;
  routines: Record<Period, RoutineStep[]>;
  /** passos concluídos por dia (só os últimos dias ficam guardados) */
  done: Record<ISODate, string[]>;
  /** quando cada período começa (para saber qual é o “agora”) */
  periodStart: Record<Period, TimeOfDay>;
  reminders: {
    /** chave geral: desligada = nenhum lembrete */
    enabled: boolean;
    items: Record<ReminderId, ReminderSetting>;
    /** minutos de antecedência para compromissos */
    leadMin: number;
    quietFrom: TimeOfDay;
    quietTo: TimeOfDay;
    /** teto de avisos por dia — para não virar barulho */
    maxPerDay: number;
  };
  /** lembretes já disparados: "yyyy-MM-dd|chave" */
  fired: string[];
}

export const REMINDER_LABEL: Record<ReminderId, string> = {
  routine_morning: "Rotina da manhã",
  routine_afternoon: "Rotina da tarde",
  routine_evening: "Rotina da noite",
  dump: "Despejar a cabeça",
  inbox: "Olhar a Inbox",
  event: "Antes de um compromisso",
};

let seq = 0;
export function stepId(): string {
  return `rs_${Date.now().toString(36)}${(seq++).toString(36)}`;
}

function steps(...titles: string[]): RoutineStep[] {
  return titles.map((title, i) => ({ id: `def_${i}_${title.length}`, title }));
}

export function defaultPrefs(): Prefs {
  return {
    version: 1,
    routines: {
      morning: steps("Beber água", "Olhar o Hoje (1 min)", "Escolher a coisa de agora"),
      afternoon: steps("Pausa: comer e respirar", "Olhar o que falta hoje", "Mexer o corpo 5 min"),
      evening: steps("Despejar a cabeça", "Separar o que precisa para amanhã", "Escolher 1 coisa de amanhã"),
    },
    done: {},
    periodStart: { morning: "06:00", afternoon: "12:00", evening: "18:00" },
    reminders: {
      enabled: false,
      items: {
        routine_morning: { on: true, time: "08:00" },
        routine_afternoon: { on: false, time: "14:00" },
        routine_evening: { on: true, time: "21:00" },
        dump: { on: false, time: "20:30" },
        inbox: { on: false, time: "18:00" },
        event: { on: true, time: "00:00" },
      },
      leadMin: 15,
      quietFrom: "22:30",
      quietTo: "07:00",
      maxPerDay: 5,
    },
    fired: [],
  };
}

/* ------------------------------ tempo ------------------------------------ */

export function toMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Período atual. Antes do início da manhã ainda conta como noite (madrugada). */
export function currentPeriod(now: Date, start: Prefs["periodStart"]): Period {
  const m = minutesOf(now);
  if (m >= toMinutes(start.evening)) return "evening";
  if (m >= toMinutes(start.afternoon)) return "afternoon";
  if (m >= toMinutes(start.morning)) return "morning";
  return "evening";
}

export function inQuietHours(now: Date, from: TimeOfDay, to: TimeOfDay): boolean {
  const m = minutesOf(now);
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/* ------------------------------ rotinas ---------------------------------- */

export function doneSet(p: Prefs, day: ISODate): Set<string> {
  return new Set(p.done[day] ?? []);
}

export function periodProgress(p: Prefs, period: Period, day: ISODate): { done: number; total: number } {
  const set = doneSet(p, day);
  const list = p.routines[period];
  return { done: list.filter((s) => set.has(s.id)).length, total: list.length };
}

export function toggleStep(p: Prefs, day: ISODate, id: string): Prefs {
  const cur = new Set(p.done[day] ?? []);
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  return pruneDone({ ...p, done: { ...p.done, [day]: [...cur] } }, day);
}

/** Guarda só ~10 dias de histórico. */
export function pruneDone(p: Prefs, today: ISODate): Prefs {
  const keep = new Set(Array.from({ length: 10 }, (_, i) => addDays(today, -i)));
  const done: Prefs["done"] = {};
  for (const [d, ids] of Object.entries(p.done)) if (keep.has(d) && ids.length) done[d] = ids;
  return { ...p, done };
}

export function addRoutineStep(p: Prefs, period: Period, title: string): Prefs {
  const t = title.trim();
  if (!t) return p;
  return { ...p, routines: { ...p.routines, [period]: [...p.routines[period], { id: stepId(), title: t }] } };
}

export function renameRoutineStep(p: Prefs, period: Period, id: string, title: string): Prefs {
  const t = title.trim();
  if (!t) return p;
  return {
    ...p,
    routines: { ...p.routines, [period]: p.routines[period].map((s) => (s.id === id ? { ...s, title: t } : s)) },
  };
}

export function removeRoutineStep(p: Prefs, period: Period, id: string): Prefs {
  return { ...p, routines: { ...p.routines, [period]: p.routines[period].filter((s) => s.id !== id) } };
}

export function moveRoutineStep(p: Prefs, period: Period, id: string, dir: -1 | 1): Prefs {
  const list = [...p.routines[period]];
  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return p;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...p, routines: { ...p.routines, [period]: list } };
}

/* ----------------------------- lembretes --------------------------------- */

export interface DueReminder {
  /** chave única do dia (evita repetir) */
  key: string;
  title: string;
  body: string;
  href: string;
}

export interface ReminderContext {
  now: Date;
  today: ISODate;
  inboxCount: number;
  /** compromissos de hoje com hora */
  events: { id: string; title: string; startTime: TimeOfDay }[];
}

/** Quanto tempo depois do horário um lembrete ainda vale (abrir o app às 15h não dispara o das 8h). */
const GRACE_MIN = 60;

export function dueReminders(p: Prefs, ctx: ReminderContext): DueReminder[] {
  const r = p.reminders;
  if (!r.enabled) return [];
  if (inQuietHours(ctx.now, r.quietFrom, r.quietTo)) return [];
  const m = minutesOf(ctx.now);
  const firedToday = p.fired.filter((k) => k.startsWith(`${ctx.today}|`));
  const budget = r.maxPerDay - firedToday.length;
  if (budget <= 0) return [];
  const has = (key: string) => p.fired.includes(`${ctx.today}|${key}`);
  const inWindow = (t: TimeOfDay) => {
    const at = toMinutes(t);
    return m >= at && m < at + GRACE_MIN;
  };
  const out: DueReminder[] = [];

  for (const period of PERIODS) {
    const id = `routine_${period}` as ReminderId;
    const s = r.items[id];
    if (!s.on || !inWindow(s.time) || has(id)) continue;
    const prog = periodProgress(p, period, ctx.today);
    if (prog.total === 0 || prog.done === prog.total) continue; // nada a lembrar
    out.push({
      key: id,
      title: `Rotina da ${PERIOD_LABEL[period].toLowerCase()}`,
      body: `${prog.total - prog.done} passo(s) pequenos. Sem pressa.`,
      href: `/rotina?p=${period}`,
    });
  }
  if (r.items.dump.on && inWindow(r.items.dump.time) && !has("dump")) {
    out.push({
      key: "dump",
      title: "Despejar a cabeça",
      body: "Joga tudo aqui. Eu organizo depois.",
      href: "/despejo",
    });
  }
  if (r.items.inbox.on && inWindow(r.items.inbox.time) && !has("inbox") && ctx.inboxCount > 0) {
    out.push({
      key: "inbox",
      title: "Inbox",
      body: `${ctx.inboxCount} coisa(s) esperando um olhar.`,
      href: "/inbox",
    });
  }
  if (r.items.event.on) {
    for (const e of ctx.events) {
      const start = toMinutes(e.startTime);
      const key = `event:${e.id}`;
      if (!has(key) && m >= start - r.leadMin && m < start) {
        out.push({ key, title: e.title, body: `Daqui a ${start - m} min (${e.startTime}).`, href: "/" });
      }
    }
  }
  return out.slice(0, budget);
}

export function markFired(p: Prefs, today: ISODate, keys: string[]): Prefs {
  const prefix = `${today}|`;
  const kept = p.fired.filter((k) => k.startsWith(prefix)); // só hoje
  return { ...p, fired: [...kept, ...keys.map((k) => prefix + k)] };
}

/* ----------------------------- validação --------------------------------- */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s: unknown): s is TimeOfDay => typeof s === "string" && TIME_RE.test(s);

/** Lê o que veio do localStorage sem confiar: completa o que faltar com os padrões. */
export function normalizePrefs(raw: unknown): Prefs {
  const base = defaultPrefs();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Prefs>;
  const routines = { ...base.routines };
  for (const p of PERIODS) {
    const list = r.routines?.[p];
    if (Array.isArray(list)) {
      routines[p] = list
        .filter((s) => s && typeof s.id === "string" && typeof s.title === "string" && s.title.trim())
        .map((s) => ({ id: s.id, title: s.title.slice(0, 120) }));
    }
  }
  const items = { ...base.reminders.items };
  for (const id of Object.keys(items) as ReminderId[]) {
    const it = r.reminders?.items?.[id];
    if (it) items[id] = { on: !!it.on, time: isTime(it.time) ? it.time : items[id].time };
  }
  const rem = r.reminders;
  const periodStart = { ...base.periodStart };
  for (const p of PERIODS) if (isTime(r.periodStart?.[p])) periodStart[p] = r.periodStart![p];
  return {
    version: 1,
    routines,
    done: r.done && typeof r.done === "object" ? (r.done as Prefs["done"]) : {},
    periodStart,
    reminders: {
      enabled: !!rem?.enabled,
      items,
      leadMin: typeof rem?.leadMin === "number" ? Math.min(120, Math.max(1, Math.round(rem.leadMin))) : 15,
      quietFrom: isTime(rem?.quietFrom) ? rem!.quietFrom : base.reminders.quietFrom,
      quietTo: isTime(rem?.quietTo) ? rem!.quietTo : base.reminders.quietTo,
      maxPerDay: typeof rem?.maxPerDay === "number" ? Math.min(20, Math.max(1, Math.round(rem.maxPerDay))) : 5,
    },
    fired: Array.isArray(r.fired) ? r.fired.filter((k) => typeof k === "string").slice(-50) : [],
  };
}
