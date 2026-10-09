"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { greeting, longDate } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { postponeItem } from "@/lib/domain/operations";
import { selectToday, type TodayEntry } from "@/lib/domain/selectors";
import type { Item } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { PERIOD_LABEL, currentPeriod, periodProgress } from "@/lib/prefs/model";
import { usePrefs } from "@/lib/prefs/store";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { ItemRow } from "@/components/items/ItemRow";
import { Ready } from "@/components/shell/AppShell";
import { IconArrowRight, IconClock, IconDecision, IconInbox, IconPlus, IconSearch } from "@/components/ui/icons";
import { Button, Collapsible, EmptyState, Group, IconButton, PageHeader, Section } from "@/components/ui/primitives";

export default function TodayPage() {
  return (
    <Ready>
      <Today />
    </Ready>
  );
}

function minutesUntil(time: string, now: Date): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
}

function Today() {
  const { data, today } = useApp();
  const view = useMemo(() => selectToday(data, today), [data, today]);
  const apply = useStore((s) => s.apply);
  const updateItem = useStore((s) => s.updateItem);
  const someday = useStore((s) => s.someday);
  const openCapture = useUI((s) => s.openCapture);
  const openSearch = useUI((s) => s.openSearch);
  const setFabHidden = useUI((s) => s.setFabHidden);
  const prompt = useRef<HTMLButtonElement>(null);

  // o convite de captura já está à vista → sem botão + duplicado; ao rolar, o + volta
  useEffect(() => {
    const el = prompt.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFabHidden(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      setFabHidden(false);
    };
  }, [setFabHidden]);

  const now = new Date();
  const nextEvent = view.agenda.find((e) => e.startTime && minutesUntil(e.endTime ?? e.startTime, now) > 0);
  const soon = nextEvent?.startTime ? minutesUntil(nextEvent.startTime, now) : null;

  const [first, ...rest] = view.priorities;
  const moneyTotal = view.money.reduce((s, i) => s + (i.money?.direction === "out" ? i.money.amountCents : 0), 0);

  const headline =
    view.priorities.length === 0
      ? "Nada urgente."
      : view.priorities.length === 1
        ? "Uma coisa importa hoje."
        : `${view.priorities.length === 2 ? "Duas" : "Três"} coisas importam hoje.`;
  const planned = view.priorities.length + view.alsoToday.length;

  return (
    <>
      <PageHeader eyebrow={longDate(today)} title={`${greeting(now)}.`}>
        <IconButton label="Buscar" onClick={openSearch} className="mb-1 -mr-2 bg-surface ring-1 ring-line lg:hidden">
          <IconSearch size={22} />
        </IconButton>
      </PageHeader>
      <div className="-mt-5 mb-7 flex items-center justify-between gap-5">
        <p className="font-display text-[clamp(1.9rem,8.6vw,2.6rem)] leading-[1.08] font-light tracking-[-0.03em] text-balance text-accent-text">
          {headline}
        </p>
        {view.doneToday + planned > 0 && <ProgressRing done={view.doneToday} total={view.doneToday + planned} />}
      </div>

      {/* captura: convite, não formulário */}
      <button
        ref={prompt}
        onClick={openCapture}
        className="mb-7 flex h-14 w-full items-center gap-3 rounded-full bg-surface pr-2 pl-6 text-left text-[17px] text-muted transition active:scale-[0.99] lg:hidden"
      >
        <span className="flex-1">Joga aqui…</span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink text-bg">
          <IconPlus size={20} />
        </span>
      </button>
      <p className="-mt-4 mb-7 px-2 text-[14px] text-muted lg:hidden">
        Muita coisa?{" "}
        <Link href="/despejo" className="font-medium text-accent-text">
          Despejar tudo
        </Link>
      </p>

      <RoutineCard />

      {/* próximo compromisso, se for logo */}
      {nextEvent && soon !== null && soon <= 90 && (
        <div className="mb-6 flex items-center gap-3 rounded-full bg-accent-soft px-5 py-3 text-[15px] text-accent-text">
          <IconClock size={18} />
          <span className="flex-1">
            {soon <= 0 ? "Agora" : `Em ${soon} min`}: <strong className="font-medium">{nextEvent.title}</strong>
          </span>
          <span className="tabular-nums">{nextEvent.startTime}</span>
        </div>
      )}

      {/* AGORA */}
      {first ? (
        <Section title="Agora">
          <NowCard entry={first} today={today} />
        </Section>
      ) : (
        <Section title="Agora">
          <EmptyState title="Nada pegando fogo.">
            <Link href="/semana" className="font-medium text-accent-text">
              Ver a semana
            </Link>
          </EmptyState>
        </Section>
      )}

      {rest.length > 0 && (
        <Section title="Depois">
          <Group flat>
            {rest.map((e) => (
              <ItemRow key={e.item.id} item={e.item} parent={e.parent} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {view.agenda.length > 0 && (
        <Section title="Agenda">
          <Group flat>
            {view.agenda.map((e) => (
              <ItemRow key={e.id} item={e} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {view.money.length > 0 && (
        <Section
          title="Dinheiro"
          action={
            <Link href="/financas" className="text-[14px] text-muted tabular-nums hover:text-ink">
              {formatBRL(moneyTotal)} a pagar
            </Link>
          }
        >
          <Group flat>
            {view.money.map((i) => (
              <ItemRow key={i.id} item={i} today={today} showProject={false} />
            ))}
          </Group>
        </Section>
      )}

      {view.overdue.length > 0 && (
        <Section
          title="Prazos que passaram"
          action={
            view.overdueHiddenCount > 0 ? (
              <Link href="/semana" className="text-[14px] text-muted hover:text-ink">
                +{view.overdueHiddenCount}
              </Link>
            ) : undefined
          }
        >
          <Group flat>
            {view.overdue.map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {/* o que espera por você: dois blocos visuais, número grande, uma palavra */}
      {(view.inboxCount > 0 || view.pendingDecisions > 0) && (
        <div className="mb-10 grid grid-cols-2 gap-3">
          {view.inboxCount > 0 && (
            <Tile href="/inbox" count={view.inboxCount} label="Inbox" tone="lilac" icon={<IconInbox size={22} />} />
          )}
          {view.pendingDecisions > 0 && (
            <Tile
              href="/decisoes"
              count={view.pendingDecisions}
              label="Decisões"
              tone="accent"
              icon={<IconDecision size={22} />}
            />
          )}
        </div>
      )}

      {view.resurface && (
        <Section title="Lembra disso?">
          <div className="rounded-[28px] bg-surface p-5">
            <p className="t-heading text-[20px] text-ink">{view.resurface.title}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => updateItem(view.resurface!.id, { scheduledDate: today })}>
                Hoje
              </Button>
              <Button
                size="sm"
                onClick={() => apply((d) => postponeItem(d, view.resurface!.id, null), "Volta pra lista da semana.")}
              >
                Semana
              </Button>
              <Button size="sm" variant="ghost" onClick={() => someday(view.resurface!.id)}>
                Algum dia
              </Button>
            </div>
          </div>
        </Section>
      )}

      {view.alsoToday.length > 0 && (
        <Collapsible title="Também hoje" count={view.alsoToday.length}>
          <Group flat>
            {view.alsoToday.map((e) => (
              <ItemRow key={e.item.id} item={e.item} parent={e.parent} today={today} showDate={false} />
            ))}
          </Group>
        </Collapsible>
      )}

      {view.slipped.length > 0 && <Slipped items={view.slipped} today={today} />}
    </>
  );
}

/** A rotina do período atual, em uma linha: barra de progresso + toque para abrir. */
function RoutineCard() {
  const { today } = useApp();
  const prefs = usePrefs((s) => s.prefs);
  const period = currentPeriod(new Date(), prefs.periodStart);
  const { done, total } = periodProgress(prefs, period, today);
  if (total === 0 || done === total) return null;
  return (
    <Link
      href={`/rotina?p=${period}`}
      className="mb-6 flex items-center gap-4 rounded-full bg-surface py-3 pr-5 pl-6 transition active:scale-[0.99]"
    >
      <span className="flex-1 text-[16px] text-ink">Rotina da {PERIOD_LABEL[period].toLowerCase()}</span>
      <span className="h-2 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="text-[14px] text-muted tabular-nums">
        {done}/{total}
      </span>
    </Link>
  );
}

function NowCard({ entry, today }: { entry: TodayEntry; today: string }) {
  return (
    <div className="aura overflow-hidden rounded-[32px] shadow-soft ring-1 ring-black/[0.04] [--row-bg:transparent] [--row-px:1.5rem]">
      <ItemRow item={entry.item} parent={entry.parent} today={today} emphasis />
      <div className="px-6 pb-6">
        <Link
          href="/foco"
          className="inline-flex h-14 items-center gap-3 rounded-full bg-ink pr-2 pl-6 text-[16px] font-medium text-bg transition active:scale-[0.98]"
        >
          Foco
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg/15">
            <IconArrowRight size={18} />
          </span>
        </Link>
      </div>
    </div>
  );
}

/** Progresso do dia: anel + número. Recompensa visível, sem texto. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div
      role="img"
      aria-label={`${done} de ${total} feitas hoje`}
      className="relative h-[76px] w-[76px] shrink-0 rounded-full bg-surface"
    >
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" className="stroke-surface-2" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-accent transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center font-display leading-none font-light tabular-nums">
        <span className="text-[24px] text-ink">{done}</span>
        <span className="mt-0.5 text-[11px] text-muted">/{total}</span>
      </span>
    </div>
  );
}

function Tile({
  href,
  count,
  label,
  tone,
  icon,
}: {
  href: string;
  count: number;
  label: string;
  tone: "lilac" | "accent";
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-5 rounded-[28px] bg-surface p-5 transition active:scale-[0.98]"
      aria-label={`${label}: ${count}`}
    >
      <span
        className={
          tone === "lilac"
            ? "inline-flex h-11 w-11 items-center justify-center rounded-full bg-lilac-soft text-lilac"
            : "inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-text"
        }
      >
        {icon}
      </span>
      <span>
        <span className="block font-display text-[40px] leading-none font-light tracking-[-0.03em] text-ink tabular-nums">
          {count}
        </span>
        <span className="mt-1.5 block text-[15px] text-muted">{label}</span>
      </span>
    </Link>
  );
}

function Slipped({ items, today }: { items: Item[]; today: string }) {
  const updateItem = useStore((s) => s.updateItem);
  return (
    <Collapsible title="Ficou para trás" count={items.length}>
      <Group flat>
        {items.map((i) => (
          <div key={i.id} className="flex items-center">
            <div className="min-w-0 flex-1">
              <ItemRow item={i} today={today} />
            </div>
            <button
              className="h-10 shrink-0 rounded-full bg-surface px-4 text-[14px] font-medium text-ink-2 ring-1 ring-line-strong/70"
              onClick={() => updateItem(i.id, { scheduledDate: today })}
            >
              Hoje
            </button>
          </div>
        ))}
      </Group>
    </Collapsible>
  );
}
