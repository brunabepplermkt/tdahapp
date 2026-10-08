"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { greeting, longDate } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { postponeItem } from "@/lib/domain/operations";
import { selectToday, type TodayEntry } from "@/lib/domain/selectors";
import type { Item } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { ItemRow } from "@/components/items/ItemRow";
import { Ready } from "@/components/shell/AppShell";
import { IconArrowRight, IconClock, IconPlus, IconSearch } from "@/components/ui/icons";
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
  const subline = view.priorities.length === 0 ? "Respira." : "O resto pode esperar.";

  return (
    <>
      <PageHeader eyebrow={longDate(today)} title={`${greeting(now)}.`}>
        <IconButton label="Buscar" onClick={openSearch} className="mb-1 -mr-2 bg-surface ring-1 ring-line lg:hidden">
          <IconSearch size={22} />
        </IconButton>
      </PageHeader>
      <div className="-mt-5 mb-8">
        <p className="font-display text-[clamp(1.9rem,8.6vw,2.6rem)] leading-[1.08] font-light tracking-[-0.03em] text-balance text-accent-text">
          {headline}
        </p>
        <p className="mt-3 text-[16px] text-muted">{subline}</p>
      </div>

      {/* captura: convite, não formulário */}
      <button
        ref={prompt}
        onClick={openCapture}
        className="mb-10 flex h-14 w-full items-center gap-3 rounded-full bg-surface pr-2 pl-5 text-left text-[16px] text-muted shadow-soft ring-1 ring-black/[0.04] transition active:scale-[0.99] lg:hidden"
      >
        <span className="flex-1">Joga aqui o que está na cabeça…</span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink">
          <IconPlus size={20} />
        </span>
      </button>

      {/* próximo compromisso, se for logo */}
      {nextEvent && soon !== null && soon <= 90 && (
        <div className="mb-6 flex items-center gap-3 rounded-[28px] bg-accent-soft px-6 py-4 text-[15px] text-accent-text">
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
          <EmptyState title="Nada pegando fogo hoje.">
            <Link href="/semana" className="font-medium text-accent-text">
              Escolher uma coisa da semana
            </Link>{" "}
            ou{" "}
            <button onClick={openCapture} className="font-medium text-accent-text">
              tirar algo da cabeça
            </button>
            .
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
          hint="Sem drama: resolva, adie para um dia realista ou solte."
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

      {/* caixas que pedem atenção, discretas */}
      {(view.inboxCount > 0 || view.pendingDecisions > 0) && (
        <div className="mb-10 flex flex-wrap gap-2">
          {view.inboxCount > 0 && (
            <QuietLink
              href="/inbox"
              count={view.inboxCount}
              label={view.inboxCount === 1 ? "coisa para organizar" : "coisas para organizar"}
            />
          )}
          {view.pendingDecisions > 0 && (
            <QuietLink
              href="/decisoes"
              count={view.pendingDecisions}
              label={view.pendingDecisions === 1 ? "decisão esperando" : "decisões esperando"}
            />
          )}
        </div>
      )}

      {view.resurface && (
        <Section title="Lembra disso?">
          <div className="rounded-[24px] bg-surface p-5 shadow-soft ring-1 ring-black/[0.03]">
            <p className="t-heading text-[20px] text-ink">{view.resurface.title}</p>
            <p className="mt-1.5 text-[14px] text-muted">Está parado há um tempo, sem data. Tudo bem — o que fazemos?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => updateItem(view.resurface!.id, { scheduledDate: today })}>
                Hoje
              </Button>
              <Button
                size="sm"
                onClick={() => apply((d) => postponeItem(d, view.resurface!.id, null), "Volta pra lista da semana.")}
              >
                Esta semana
              </Button>
              <Button size="sm" variant="ghost" onClick={() => someday(view.resurface!.id)}>
                Algum dia
              </Button>
            </div>
          </div>
        </Section>
      )}

      {view.alsoToday.length > 0 && (
        <Collapsible title="Também planejado para hoje" count={view.alsoToday.length}>
          <Group flat>
            {view.alsoToday.map((e) => (
              <ItemRow key={e.item.id} item={e.item} parent={e.parent} today={today} showDate={false} />
            ))}
          </Group>
        </Collapsible>
      )}

      {view.slipped.length > 0 && <Slipped items={view.slipped} today={today} />}

      {view.doneToday > 0 && (
        <p className="mt-12 text-center text-[15px] text-muted">
          {view.doneToday === 1 ? "1 coisa feita hoje." : `${view.doneToday} coisas feitas hoje.`} Isso conta.
        </p>
      )}
    </>
  );
}

function NowCard({ entry, today }: { entry: TodayEntry; today: string }) {
  const reason = entry.reasons[0];
  return (
    <div className="aura overflow-hidden rounded-[32px] shadow-soft ring-1 ring-black/[0.04] [--row-bg:transparent] [--row-px:1.5rem]">
      <ItemRow item={entry.item} parent={entry.parent} today={today} emphasis />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 pb-6">
        <Link
          href="/foco"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink pr-2 pl-5 text-[15px] font-medium text-bg transition active:scale-[0.98]"
        >
          Modo foco
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg/15">
            <IconArrowRight size={16} />
          </span>
        </Link>
        {reason && (
          <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2">
            <span className="text-muted">Por quê:</span> {reason.toLowerCase()}
          </p>
        )}
      </div>
    </div>
  );
}

function QuietLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center gap-2.5 rounded-full bg-surface pr-4 pl-1.5 text-[14px] text-ink-2 ring-1 ring-line-strong/70 transition hover:bg-surface-2"
    >
      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-surface-2 px-2 font-display text-[17px] text-ink tabular-nums">
        {count}
      </span>
      {label}
    </Link>
  );
}

function Slipped({ items, today }: { items: Item[]; today: string }) {
  const updateItem = useStore((s) => s.updateItem);
  return (
    <Collapsible title="Ficou pra trás" count={items.length}>
      <p className="mb-2 px-1 text-[13px] text-muted">
        Planejados para dias que já passaram. Traga para hoje só o que couber — ou{" "}
        <Link href="/semana?organizar=1" className="font-medium text-accent-text">
          redistribua na semana
        </Link>
        .
      </p>
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
