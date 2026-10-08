import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isWeekend as dfIsWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ISODate, RecurrenceFreq } from "./types";

/** Converte Date local para `yyyy-MM-dd`. */
export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function fromISODate(s: ISODate): Date {
  // parseISO com só a data cria Date à meia-noite local
  return parseISO(s);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(date: ISODate, n: number): ISODate {
  return toISODate(dfAddDays(fromISODate(date), n));
}

export function addMonths(date: ISODate, n: number): ISODate {
  return toISODate(dfAddMonths(fromISODate(date), n));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(a), fromISODate(b));
}

/** Semana começa na segunda. */
export function weekStart(date: ISODate): ISODate {
  return toISODate(startOfWeek(fromISODate(date), { weekStartsOn: 1 }));
}

export function weekDays(date: ISODate): ISODate[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(date: ISODate): ISODate {
  return toISODate(startOfMonth(fromISODate(date)));
}

export function monthEnd(date: ISODate): ISODate {
  return toISODate(endOfMonth(fromISODate(date)));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function isWeekend(date: ISODate): boolean {
  return dfIsWeekend(fromISODate(date));
}

/** Matriz (semanas x 7) para o calendário do mês, começando na segunda. */
export function monthGrid(date: ISODate): ISODate[][] {
  const first = weekStart(monthStart(date));
  const last = monthEnd(date);
  const weeks: ISODate[][] = [];
  let cursor = first;
  while (diffDays(cursor, last) <= 0) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function nextOccurrence(date: ISODate, freq: RecurrenceFreq, interval = 1): ISODate {
  const d = fromISODate(date);
  switch (freq) {
    case "daily":
      return toISODate(dfAddDays(d, interval));
    case "weekly":
      return toISODate(addWeeks(d, interval));
    case "monthly":
      return toISODate(dfAddMonths(d, interval));
    case "yearly":
      return toISODate(addYears(d, interval));
  }
}

export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

/* ---------------------------------------------------------------------------
 * Formatação humana (pt-BR)
 * ------------------------------------------------------------------------- */

export function fmt(date: ISODate, pattern: string): string {
  return format(fromISODate(date), pattern, { locale: ptBR });
}

/** "hoje", "amanhã", "ontem", "sexta", "há 3 dias", "12 out" */
export function relativeDay(date: ISODate, today: ISODate): string {
  const d = diffDays(date, today);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  if (d < -1 && d >= -6) return `há ${-d} dias`;
  if (d > 1 && d <= 6) return fmt(date, "EEEE").replace("-feira", "");
  return fmt(date, "d MMM").replace(".", "");
}

export function weekdayShort(date: ISODate): string {
  return fmt(date, "EEE").replace(".", "");
}

export function longDate(date: ISODate): string {
  const s = fmt(date, "EEEE, d 'de' MMMM");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthLabel(date: ISODate): string {
  const s = fmt(date, "MMMM yyyy");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
