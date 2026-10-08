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
    <div className="aura fixed inset-0 z-[35] flex flex-col bg-bg px-6 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between">
        <span className="t-label">
          Modo foco{remaining > 1 ? ` · mais ${remaining - 1} depois` : ""}
        </span>
        <Link
          href="/"
          aria-label="Sair do modo foco"
          className="-mr-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface/80 text-ink-2 ring-1 ring-black/[0.05] hover:bg-surface"
        >
          <IconX size={22} />
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
        {celebrate ? (
          <div className="animate-fade text-center">
            <span className="mx-auto mb-6 inline-flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-ok text-white">
              <IconCheck size={32} strokeWidth={2.5} />
            </span>
            <p className="t-title text-ink">Feito.</p>
          </div>
        ) : current ? (
          <div className="animate-fade">
            {current.parent && <p className="mb-3 text-[16px] text-ink-2">Próximo passo de {current.parent.title}</p>}
            <h1 className="t-display text-balance text-ink">
              {current.item.title}
            </h1>
            {current.reasons[0] && <p className="mt-5 text-[17px] text-ink-2">{current.reasons[0]}</p>}
            {current.item.notes && (
              <p className="mt-6 rounded-[24px] bg-surface/80 px-5 py-4 text-[16px] leading-snug whitespace-pre-line text-ink-2 ring-1 ring-black/[0.04]">
                {current.item.notes}
              </p>
            )}

            <div className="mt-10">
              {left === null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[15px] text-ink-2">Timer</span>
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
                      "font-display text-[56px] leading-none font-light tracking-[-0.03em] tabular-nums",
                      timeUp ? "text-ok" : "text-ink",
                    )}
                    aria-live="polite"
                  >
                    {timeUp
                      ? "Tempo!"
                      : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}
                  </span>
                  <button className="h-11 px-2 text-[15px] text-ink-2 hover:text-ink" onClick={() => setEndAt(null)}>
                    {timeUp ? "Fechar" : "Parar"}
                  </button>
                </div>
              )}
              {timeUp && <p className="mt-3 text-[16px] text-ink-2">Terminou?</p>}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="t-title text-ink">Nada mais para hoje.</p>
            <p className="mt-3 text-[17px] text-ink-2">Isso também é um bom resultado.</p>
            <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-bg">
              Voltar ao Hoje
            </Link>
          </div>
        )}
      </div>

      {current && !celebrate && (
        <div className="mx-auto grid w-full max-w-xl grid-cols-[1fr_auto_auto] gap-2.5">
          <Button variant="dark" size="lg" onClick={done}>
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
