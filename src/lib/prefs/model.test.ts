import { describe, expect, it } from "vitest";
import {
  addRoutineStep,
  currentPeriod,
  defaultPrefs,
  dueReminders,
  inQuietHours,
  markFired,
  moveRoutineStep,
  normalizePrefs,
  periodProgress,
  pruneDone,
  removeRoutineStep,
  toggleStep,
} from "./model";

const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m);
const day = "2026-10-09";
const ctx = (h: number, m = 0, extra = {}) => ({ now: at(h, m), today: day, inboxCount: 0, events: [], ...extra });
const on = () => {
  const p = defaultPrefs();
  return { ...p, reminders: { ...p.reminders, enabled: true } };
};

describe("período", () => {
  const s = defaultPrefs().periodStart;
  it("escolhe manhã/tarde/noite e trata madrugada como noite", () => {
    expect(currentPeriod(at(9), s)).toBe("morning");
    expect(currentPeriod(at(13), s)).toBe("afternoon");
    expect(currentPeriod(at(20), s)).toBe("evening");
    expect(currentPeriod(at(3), s)).toBe("evening");
  });
});

describe("rotinas", () => {
  it("marca e desmarca passos, por dia", () => {
    let p = defaultPrefs();
    const id = p.routines.morning[0].id;
    p = toggleStep(p, day, id);
    expect(periodProgress(p, "morning", day).done).toBe(1);
    expect(periodProgress(p, "morning", "2026-10-10").done).toBe(0);
    p = toggleStep(p, day, id);
    expect(periodProgress(p, "morning", day).done).toBe(0);
  });
  it("adiciona, move e remove; ignora título vazio", () => {
    let p = addRoutineStep(defaultPrefs(), "evening", "  Ler  ");
    expect(p.routines.evening.at(-1)?.title).toBe("Ler");
    expect(addRoutineStep(p, "evening", "  ")).toBe(p);
    const id = p.routines.evening.at(-1)!.id;
    p = moveRoutineStep(p, "evening", id, -1);
    expect(p.routines.evening.at(-2)?.id).toBe(id);
    expect(moveRoutineStep(p, "evening", p.routines.evening[0].id, -1)).toBe(p);
    p = removeRoutineStep(p, "evening", id);
    expect(p.routines.evening.some((s) => s.id === id)).toBe(false);
  });
  it("guarda só alguns dias", () => {
    const p = pruneDone({ ...defaultPrefs(), done: { "2026-01-01": ["a"], [day]: ["b"] } }, day);
    expect(Object.keys(p.done)).toEqual([day]);
  });
});

describe("horário de silêncio", () => {
  it("atravessa a meia-noite", () => {
    expect(inQuietHours(at(23), "22:30", "07:00")).toBe(true);
    expect(inQuietHours(at(3), "22:30", "07:00")).toBe(true);
    expect(inQuietHours(at(12), "22:30", "07:00")).toBe(false);
  });
});

describe("lembretes", () => {
  it("nada dispara com a chave geral desligada", () => {
    expect(dueReminders(defaultPrefs(), ctx(8, 5))).toEqual([]);
  });
  it("dispara a rotina da manhã no horário e só uma vez", () => {
    let p = on();
    const due = dueReminders(p, ctx(8, 5));
    expect(due.map((d) => d.key)).toEqual(["routine_morning"]);
    p = markFired(p, day, ["routine_morning"]);
    expect(dueReminders(p, ctx(8, 10))).toEqual([]);
  });
  it("não dispara atrasado demais nem antes do horário", () => {
    expect(dueReminders(on(), ctx(7, 30))).toEqual([]);
    expect(dueReminders(on(), ctx(15, 0))).toEqual([]);
  });
  it("não lembra de rotina já concluída", () => {
    let p = on();
    for (const s of p.routines.morning) p = toggleStep(p, day, s.id);
    expect(dueReminders(p, ctx(8, 5))).toEqual([]);
  });
  it("respeita silêncio e teto diário", () => {
    const p = on();
    p.reminders.items.routine_evening.time = "23:00";
    expect(dueReminders(p, ctx(23, 5))).toEqual([]);
    const full = markFired(on(), day, ["a", "b", "c", "d", "e"]);
    expect(dueReminders(full, ctx(8, 5))).toEqual([]);
  });
  it("avisa antes de compromisso", () => {
    const events = [{ id: "e1", title: "Dentista", startTime: "10:00" }];
    const due = dueReminders(on(), ctx(9, 50, { events }));
    expect(due[0]).toMatchObject({ key: "event:e1", title: "Dentista" });
    expect(dueReminders(on(), ctx(9, 30, { events }))).toEqual([]);
  });
  it("inbox só quando há algo", () => {
    const p = on();
    p.reminders.items.inbox.on = true;
    expect(dueReminders(p, ctx(18, 5))).toEqual([]);
    expect(dueReminders(p, ctx(18, 5, { inboxCount: 3 }))[0].key).toBe("inbox");
  });
});

describe("normalizePrefs", () => {
  it("aguenta lixo e completa com padrões", () => {
    expect(normalizePrefs(null)).toEqual(defaultPrefs());
    const p = normalizePrefs({
      reminders: { enabled: true, leadMin: 9999, quietFrom: "xx" },
      routines: { morning: [{ id: 1 }] },
    });
    expect(p.reminders.enabled).toBe(true);
    expect(p.reminders.leadMin).toBe(120);
    expect(p.reminders.quietFrom).toBe("22:30");
    expect(p.routines.morning).toEqual([]);
  });
});
