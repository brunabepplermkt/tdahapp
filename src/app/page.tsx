"use client";

import Link from "next/link";
import { useMemo } from "react";
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
import { IconArrowRight, IconClock, IconSearch } from "@/components/ui/icons";
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

  const now = new Date();
  const nextEvent = view.agenda.find((e) => e.startTime && minutesUntil(e.endTime ?? e.startTime, now) > 0);
  const soon = nextEvent?.startTime ? minutesUntil(nextEvent.startTime, now) : null;

  const [first, ...rest] = view.priorities;
  const moneyTotal = view.money.reduce((s, i) => s + (i.money?.direction === "out" ? i.money.amountCents : 0), 0);

  const summary =
    view.priorities.length === 0
      ? "Nada urgente. Respira."
      : view.priorities.length === 1
        ? "Uma coisa importa hoje. O resto pode esperar."
        : `${view.priorities.length === 2 ? "Duas" : "Três"} coisas importam hoje. O resto pode esperar.`;

  return (
    <>
      <PageHeader eyebrow={longDate(today)} title={`${greeting(now)}.`}>
        <IconButton label="Buscar" onClick={openSearch} className="-mr-2 lg:hidden">
          <IconSearch size={22} />
        </IconButton>
      </PageHeader>
      <p className="-mt-5 mb-7 text-[16px] text-ink-2">{summary}</p>

      {/* próximo compromisso, se for logo */}
      {nextEvent && soon !== null && soon <= 90 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-[14px] text-accent">
          <IconClock size={18} />
          <span className="flex-1">
            {soon <= 0 ? "Agora" : `Em ${soon} min`}: <strong className="font-semibold">{nextEvent.title}</strong>
          </span>
          <span className="tabular-nums">{nextEvent.startTime}</span>
        </div>
      )}

      {/* AGORA */}
      {first ? (
        <Section
          title="Agora"
          action={
            <Link href="/foco" className="text-[13px] font-medium text-accent">
              Modo foco
            </Link>
          }
        >
          <NowCard entry={first} today={today} />
        </Section>
      ) : (
        <Section title="Agora">
          <EmptyState title="Nada pegando fogo hoje.">
            <Link href="/semana" className="font-medium text-accent">
              Escolher uma coisa da semana
            </Link>{" "}
            ou{" "}
            <button onClick={openCapture} className="font-medium text-accent">
              tirar algo da cabeça
            </button>
            .
          </EmptyState>
        </Section>
      )}

      {rest.length > 0 && (
        <Section title="Depois">
          <Group>
            {rest.map((e) => (
              <ItemRow key={e.item.id} item={e.item} parent={e.parent} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {view.agenda.length > 0 && (
        <Section title="Agenda">
          <Group>
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
            <Link href="/financas" className="text-[13px] text-muted tabular-nums hover:text-ink">
              {formatBRL(moneyTotal)} a pagar
            </Link>
          }
        >
          <Group>
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
              <Link href="/semana" className="text-[13px] text-muted hover:text-ink">
                +{view.overdueHiddenCount}
              </Link>
            ) : undefined
          }
        >
          <Group>
            {view.overdue.map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {/* caixas que pedem atenção, discretas */}
      {(view.inboxCount > 0 || view.pendingDecisions > 0) && (
        <div className="mb-8 grid grid-cols-2 gap-2">
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
          <div className="rounded-2xl bg-surface p-4 shadow-soft">
            <p className="text-[15px] text-ink">{view.resurface.title}</p>
            <p className="mt-1 text-[13px] text-muted">Está parado há um tempo, sem data. Tudo bem — o que fazemos?</p>
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
          <Group>
            {view.alsoToday.map((e) => (
              <ItemRow key={e.item.id} item={e.item} parent={e.parent} today={today} showDate={false} />
            ))}
          </Group>
        </Collapsible>
      )}

      {view.slipped.length > 0 && <Slipped items={view.slipped} today={today} />}

      {view.doneToday > 0 && (
        <p className="mt-10 text-center text-[14px] text-muted">
          {view.doneToday === 1 ? "1 coisa feita hoje." : `${view.doneToday} coisas feitas hoje.`} Isso conta.
        </p>
      )}
    </>
  );
}

function NowCard({ entry, today }: { entry: TodayEntry; today: string }) {
  const reason = entry.reasons[0];
  return (
    <div className="overflow-hidden rounded-[22px] bg-surface shadow-soft">
      <ItemRow item={entry.item} parent={entry.parent} today={today} emphasis />
      {reason && (
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
          <span className="text-ink-2">Por quê:</span> {reason.toLowerCase()}
        </p>
      )}
    </div>
  );
}

function QuietLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-soft transition hover:bg-surface-2"
    >
      <span className="text-[22px] font-semibold tabular-nums">{count}</span>
      <span className="flex-1 text-[13px] leading-tight text-ink-2">{label}</span>
      <IconArrowRight size={16} className="text-faint" />
    </Link>
  );
}

function Slipped({ items, today }: { items: Item[]; today: string }) {
  const updateItem = useStore((s) => s.updateItem);
  return (
    <Collapsible title="Ficou pra trás" count={items.length}>
      <p className="mb-2 px-1 text-[13px] text-muted">
        Planejados para dias que já passaram. Traga para hoje só o que couber — ou{" "}
        <Link href="/semana?organizar=1" className="font-medium text-accent">
          redistribua na semana
        </Link>
        .
      </p>
      <Group>
        {items.map((i) => (
          <div key={i.id} className="flex items-center">
            <div className="min-w-0 flex-1">
              <ItemRow item={i} today={today} />
            </div>
            <button
              className="mr-3 h-9 shrink-0 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-ink-2"
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
