"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { PERIODS, PERIOD_LABEL, REMINDER_LABEL, isTime, type Prefs, type ReminderId } from "@/lib/prefs/model";
import { askNotifyPermission, notifySupport, showSystemNotification, type NotifySupport } from "@/lib/prefs/notify";
import { usePrefs } from "@/lib/prefs/store";
import { useStore } from "@/lib/store/store";
import { Ready } from "@/components/shell/AppShell";
import { Button, Group, PageHeader, Section, inputClass } from "@/components/ui/primitives";

export default function RemindersPage() {
  return (
    <Ready>
      <Reminders />
    </Ready>
  );
}

const TIMED: ReminderId[] = ["routine_morning", "routine_afternoon", "routine_evening", "dump", "inbox"];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line-strong"}`}
    >
      <span
        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : ""}`}
      />
    </button>
  );
}

function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => isTime(e.target.value) && onChange(e.target.value)}
      className={`${inputClass} !h-11 !w-auto !px-3 !py-0 text-[16px]`}
    />
  );
}

function Reminders() {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const showToast = useStore((s) => s.showToast);
  const r = prefs.reminders;
  const [asked, setAsked] = useState<NotifySupport | null>(null);
  const systemPerm = useSyncExternalStore(
    () => () => undefined,
    notifySupport,
    (): NotifySupport => "default",
  );
  const perm = asked ?? systemPerm;

  const setR = (fn: (r: Prefs["reminders"]) => Prefs["reminders"]) =>
    update((p) => ({ ...p, reminders: fn(p.reminders) }));
  const setItem = (id: ReminderId, patch: Partial<{ on: boolean; time: string }>) =>
    setR((x) => ({ ...x, items: { ...x.items, [id]: { ...x.items[id], ...patch } } }));

  const enable = async (on: boolean) => {
    if (on && perm !== "granted") {
      const res = await askNotifyPermission();
      setAsked(res);
      if (res !== "granted") showToast("Sem permissão do sistema, os avisos aparecem só dentro do app.");
    }
    setR((x) => ({ ...x, enabled: on }));
  };

  const test = async () => {
    const ok = await showSystemNotification("Leve", "Está funcionando. Sem pressa.", "/");
    if (!ok) showToast("Leve — está funcionando (aviso dentro do app).");
  };

  return (
    <>
      <PageHeader eyebrow="Só quando você quiser" title="Lembretes" />

      <Section>
        <Group>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] text-ink">Lembretes ligados</p>
              <p className="text-[13px] text-muted">
                {perm === "granted"
                  ? "Avisos do sistema ativos"
                  : perm === "denied"
                    ? "Bloqueado no navegador — avisos só dentro do app"
                    : perm === "unsupported"
                      ? "Este navegador não tem avisos — só dentro do app"
                      : "Vou pedir permissão ao ligar"}
              </p>
            </div>
            <Toggle on={r.enabled} onChange={(v) => void enable(v)} label="Lembretes ligados" />
          </div>
        </Group>
      </Section>

      <div className={r.enabled ? "" : "pointer-events-none opacity-45"} aria-disabled={!r.enabled}>
        <Section title="Quais e quando">
          <Group>
            {TIMED.map((id) => (
              <div key={id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 text-[16px] text-ink">{REMINDER_LABEL[id]}</span>
                <TimeInput
                  label={`Horário: ${REMINDER_LABEL[id]}`}
                  value={r.items[id].time}
                  onChange={(time) => setItem(id, { time })}
                />
                <Toggle on={r.items[id].on} onChange={(on) => setItem(id, { on })} label={REMINDER_LABEL[id]} />
              </div>
            ))}
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1 text-[16px] text-ink">
                {REMINDER_LABEL.event}
                <span className="block text-[13px] text-muted">minutos antes</span>
              </span>
              <input
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                aria-label="Minutos antes do compromisso"
                value={r.leadMin}
                onChange={(e) =>
                  setR((x) => ({ ...x, leadMin: Math.min(120, Math.max(1, Number(e.target.value) || 1)) }))
                }
                className={`${inputClass} !h-11 !w-20 !px-3 !py-0 text-center`}
              />
              <Toggle on={r.items.event.on} onChange={(on) => setItem("event", { on })} label={REMINDER_LABEL.event} />
            </div>
          </Group>
        </Section>

        <Section title="Silêncio">
          <Group>
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="flex-1 text-[16px] text-ink">Sem avisos entre</span>
              <TimeInput
                label="Início do silêncio"
                value={r.quietFrom}
                onChange={(quietFrom) => setR((x) => ({ ...x, quietFrom }))}
              />
              <span className="text-muted">e</span>
              <TimeInput
                label="Fim do silêncio"
                value={r.quietTo}
                onChange={(quietTo) => setR((x) => ({ ...x, quietTo }))}
              />
            </div>
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="flex-1 text-[16px] text-ink">No máximo por dia</span>
              <input
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                aria-label="Máximo de avisos por dia"
                value={r.maxPerDay}
                onChange={(e) =>
                  setR((x) => ({ ...x, maxPerDay: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))
                }
                className={`${inputClass} !h-11 !w-20 !px-3 !py-0 text-center`}
              />
            </div>
          </Group>
        </Section>

        <Section title="Quando começa cada parte do dia">
          <Group>
            {PERIODS.map((p) => (
              <div key={p} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 text-[16px] text-ink">{PERIOD_LABEL[p]}</span>
                <TimeInput
                  label={`Início da ${PERIOD_LABEL[p].toLowerCase()}`}
                  value={prefs.periodStart[p]}
                  onChange={(t) => update((x) => ({ ...x, periodStart: { ...x.periodStart, [p]: t } }))}
                />
              </div>
            ))}
          </Group>
        </Section>

        <Button onClick={() => void test()}>Testar um aviso</Button>
      </div>

      <p className="mt-8 px-1 text-[13px] leading-snug text-muted">
        Os avisos chegam com o app aberto ou em segundo plano no aparelho. Com o app totalmente fechado, ainda não —
        isso pede um servidor de notificações.
      </p>
      <p className="mt-6 text-center">
        <Link href="/rotina" className="text-[14px] text-muted hover:text-ink">
          Voltar pra Rotina
        </Link>
      </p>
    </>
  );
}
