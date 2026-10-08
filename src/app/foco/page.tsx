"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays } from "@/lib/domain/dates";
import { selectToday, type TodayEntry } from "@/lib/domain/selectors";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { Ready } from "@/components/shell/AppShell";
import { IconCheck, IconX } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";

export default function FocusPage() {
  return (
    <Ready>
      <Focus />
    </Ready>
  );
}

const TIMERS = [15, 25, 45];

/** relógio (chamado só em handlers/efeitos, nunca para decidir o que renderizar) */
const clock = () => Date.now();

/**
 * Modo foco: uma coisa só na tela. Sem listas, sem navegação.
 * “Pular” não muda nada nos dados — só mostra a próxima.
 */
function Focus() {
  const { data, today } = useApp();
  const toggleDone = useStore((s) => s.toggleDone);
  const postpone = useStore((s) => s.postpone);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(clock);
  const [celebrate, setCelebrate] = useState(false);

  const view = selectToday(data, today);
  const queue: TodayEntry[] = [...view.priorities, ...view.alsoToday];
  const keyOf = (e: TodayEntry) => e.item.id;
  const current = queue.find((e) => !skipped.includes(keyOf(e))) ?? null;
  const remaining = queue.filter((e) => !skipped.includes(keyOf(e))).length;

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(id);
  }, [endAt]);

  const left = endAt ? Math.max(0, Math.round((endAt - now) / 1000)) : null;
  const timeUp = left === 0;

  useEffect(() => {
    if (timeUp && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [timeUp]);

  const startTimer = (min: number) => {
    const t = clock();
    setNow(t);
    setEndAt(t + min * 60_000);
  };

  const done = () => {
    if (!current) return;
    toggleDone(current.item.id);
    setEndAt(null);
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 1400);
  };

  return (
    <div className="fixed inset-0 z-[35] flex flex-col bg-bg px-6 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between">
        <span className="text-[13px] font-medium text-muted">
          Modo foco{remaining > 1 ? ` · mais ${remaining - 1} depois` : ""}
        </span>
        <Link
          href="/"
          aria-label="Sair do modo foco"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"
        >
          <IconX size={22} />
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
        {celebrate ? (
          <div className="animate-fade text-center">
            <span className="mx-auto mb-5 inline-flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-ok text-white">
              <IconCheck size={32} strokeWidth={2.5} />
            </span>
            <p className="text-[22px] font-semibold text-ink">Feito.</p>
          </div>
        ) : current ? (
          <div className="animate-fade">
            {current.parent && <p className="mb-2 text-[15px] text-muted">Próximo passo de {current.parent.title}</p>}
            <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.025em] text-ink">
              {current.item.title}
            </h1>
            {current.reasons[0] && <p className="mt-3 text-[15px] text-muted">{current.reasons[0]}</p>}
            {current.item.notes && (
              <p className="mt-5 rounded-2xl bg-surface px-4 py-3 text-[15px] whitespace-pre-line text-ink-2 shadow-soft">
                {current.item.notes}
              </p>
            )}

            <div className="mt-10">
              {left === null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[14px] text-muted">Timer:</span>
                  {TIMERS.map((m) => (
                    <Button key={m} size="sm" onClick={() => startTimer(m)}>
                      {m} min
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex items-baseline gap-4">
                  <span
                    className={clsx(
                      "font-display text-[44px] font-semibold tabular-nums",
                      timeUp ? "text-ok" : "text-ink",
                    )}
                    aria-live="polite"
                  >
                    {timeUp
                      ? "Tempo!"
                      : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}
                  </span>
                  <button className="text-[14px] text-muted hover:text-ink" onClick={() => setEndAt(null)}>
                    {timeUp ? "Fechar" : "Parar"}
                  </button>
                </div>
              )}
              {timeUp && <p className="mt-2 text-[15px] text-ink-2">Pausa curta. Terminou ou quer mais uma rodada?</p>}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[22px] font-semibold text-ink">Nada mais para hoje.</p>
            <p className="mt-2 text-[15px] text-muted">Isso também é um bom resultado.</p>
            <Link href="/" className="mt-6 inline-block text-[15px] font-medium text-accent">
              Voltar ao Hoje
            </Link>
          </div>
        )}
      </div>

      {current && !celebrate && (
        <div className="mx-auto grid w-full max-w-xl grid-cols-[1fr_auto_auto] gap-2">
          <Button variant="primary" size="lg" onClick={done}>
            <IconCheck size={20} /> Feito
          </Button>
          <Button
            size="lg"
            onClick={() => {
              setSkipped((s) => [...s, keyOf(current)]);
              setEndAt(null);
            }}
          >
            Pular
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              postpone(current.parent?.id ?? current.item.id, addDays(today, 1), "amanhã");
              setEndAt(null);
            }}
          >
            Amanhã
          </Button>
        </div>
      )}
    </div>
  );
}
