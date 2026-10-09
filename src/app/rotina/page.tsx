"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { selectToday } from "@/lib/domain/selectors";
import { useApp } from "@/lib/hooks/useApp";
import {
  PERIODS,
  PERIOD_LABEL,
  addRoutineStep,
  currentPeriod,
  doneSet,
  moveRoutineStep,
  periodProgress,
  removeRoutineStep,
  renameRoutineStep,
  toggleStep,
  type Period,
} from "@/lib/prefs/model";
import { usePrefs } from "@/lib/prefs/store";
import { CheckCircle } from "@/components/items/ItemRow";
import { Ready } from "@/components/shell/AppShell";
import { IconArrowRight, IconX } from "@/components/ui/icons";
import { Button, PageHeader, Segmented, inputClass } from "@/components/ui/primitives";

export default function RoutinePage() {
  return (
    <Ready>
      <Suspense>
        <RoutineByParam />
      </Suspense>
    </Ready>
  );
}

function isPeriod(v: string | null): v is Period {
  return !!v && (PERIODS as string[]).includes(v);
}

/** `key` remonta ao trocar o período pela URL (ex.: tocar no lembrete com a tela já aberta). */
function RoutineByParam() {
  const param = useSearchParams().get("p");
  return <Routine key={param ?? ""} param={param} />;
}

function Routine({ param }: { param: string | null }) {
  const { data, today } = useApp();
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const nowPeriod = currentPeriod(new Date(), prefs.periodStart);
  const [period, setPeriod] = useState<Period>(isPeriod(param) ? param : nowPeriod);
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState("");

  const steps = prefs.routines[period];
  const done = doneSet(prefs, today);
  const prog = periodProgress(prefs, period, today);
  const view = useMemo(() => selectToday(data, today), [data, today]);
  const now = view.priorities[0];

  return (
    <>
      <PageHeader eyebrow="Passos pequenos, sempre os mesmos" title="Rotina" />

      <Segmented
        className="mb-6"
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setEditing(false);
        }}
        options={PERIODS.map((p) => ({
          value: p,
          label: `${PERIOD_LABEL[p]}${p === nowPeriod ? " •" : ""}`,
        }))}
      />

      {prog.total > 0 && (
        <div className="mb-5 flex items-center gap-3 px-1" aria-label={`${prog.done} de ${prog.total}`}>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${(prog.done / prog.total) * 100}%` }}
            />
          </div>
          <span className="text-[14px] text-muted tabular-nums">
            {prog.done}/{prog.total}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] bg-surface shadow-soft ring-1 ring-black/[0.03] [&>*+*]:border-t [&>*+*]:border-line">
        {steps.length === 0 && <p className="px-5 py-6 text-[15px] text-muted">Vazia. Adicione um passo pequeno.</p>}
        {steps.map((s, i) =>
          editing ? (
            <div key={s.id} className="flex items-center gap-1 py-1.5 pr-2 pl-4">
              <input
                defaultValue={s.title}
                aria-label="Nome do passo"
                onBlur={(e) => update((p) => renameRoutineStep(p, period, s.id, e.target.value || s.title))}
                className="h-11 min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
              />
              <button
                aria-label="Subir"
                disabled={i === 0}
                onClick={() => update((p) => moveRoutineStep(p, period, s.id, -1))}
                className="h-10 w-9 text-muted disabled:opacity-30"
              >
                ↑
              </button>
              <button
                aria-label="Descer"
                disabled={i === steps.length - 1}
                onClick={() => update((p) => moveRoutineStep(p, period, s.id, 1))}
                className="h-10 w-9 text-muted disabled:opacity-30"
              >
                ↓
              </button>
              <button
                aria-label="Remover passo"
                onClick={() => update((p) => removeRoutineStep(p, period, s.id))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              >
                <IconX size={18} />
              </button>
            </div>
          ) : (
            <div key={s.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <CheckCircle
                checked={done.has(s.id)}
                onToggle={() => update((p) => toggleStep(p, today, s.id))}
                label={`Marcar “${s.title}”`}
                size="lg"
              />
              <span className={clsx("flex-1 text-[17px]", done.has(s.id) && "text-muted line-through")}>{s.title}</span>
            </div>
          ),
        )}
        {editing && (
          <form
            className="flex items-center gap-2 px-4 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              update((p) => addRoutineStep(p, period, newStep));
              setNewStep("");
            }}
          >
            <span className="w-[22px] text-center text-faint">+</span>
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Novo passo (curto!)"
              className={clsx(inputClass, "h-11 border-0 bg-transparent px-0 py-0 text-[16px] focus:ring-0")}
            />
          </form>
        )}
      </div>

      {!editing && prog.total > 0 && prog.done === prog.total && (
        <p className="mt-5 text-center font-display text-[22px] font-light text-ok">Pronto. Respira. ✓</p>
      )}

      <div className="mt-4 flex justify-center">
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "Pronto" : "Editar rotina"}
        </Button>
      </div>

      {/* plano do dia em um toque: a única coisa que importa agora */}
      {!editing && period === nowPeriod && now && (
        <div className="aura mt-8 rounded-[28px] p-6 shadow-soft ring-1 ring-black/[0.04]">
          <p className="t-label mb-2">Depois da rotina</p>
          <p className="t-heading mb-4 text-[22px] text-ink">{now.item.title}</p>
          <Link
            href="/foco"
            className="inline-flex h-12 items-center gap-3 rounded-full bg-ink pr-2 pl-5 text-[15px] font-medium text-bg"
          >
            Foco
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg/15">
              <IconArrowRight size={16} />
            </span>
          </Link>
        </div>
      )}

      <p className="mt-10 text-center">
        <Link href="/lembretes" className="text-[14px] text-muted hover:text-ink">
          Lembretes da rotina
        </Link>
      </p>
    </>
  );
}
