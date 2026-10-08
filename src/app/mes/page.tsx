"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addMonths, diffDays, fmt, monthGrid, monthLabel, relativeDay } from "@/lib/domain/dates";
import { isMoney, isOpen, selectMonth } from "@/lib/domain/selectors";
import type { Item } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { proposeMonthPlan, type PlanProposal } from "@/lib/intelligence";
import { CheckCircle, ItemRow } from "@/components/items/ItemRow";
import { PlanSheet } from "@/components/plan/PlanSheet";
import { Ready } from "@/components/shell/AppShell";
import { IconChevronLeft, IconChevronRight, IconSparkle } from "@/components/ui/icons";
import { Button, EmptyState, Group, IconButton, PageHeader, Section } from "@/components/ui/primitives";
import { useStore } from "@/lib/store/store";
import { MoneyGrid } from "@/components/finance/MoneyGrid";

export default function MonthPage() {
  return (
    <Ready>
      <Month />
    </Ready>
  );
}

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];

function dotsFor(items: Item[]) {
  const open = items.filter((i) => i.status === "open");
  return {
    event: open.some((i) => i.kind === "event"),
    out: open.some((i) => isMoney(i) && i.money?.direction === "out"),
    in: open.some((i) => i.money?.direction === "in"),
    task: open.some((i) => i.kind !== "event" && !isMoney(i)),
    deadline: open.some((i) => i.dueDate && !isMoney(i) && i.kind !== "event"),
  };
}

function Month() {
  const { data, today } = useApp();
  const toggleDone = useStore((s) => s.toggleDone);
  const [offset, setOffset] = useState(0);
  const anchor = offset === 0 ? today : addMonths(today.slice(0, 8) + "01", offset);
  const [selected, setSelected] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);

  const view = useMemo(() => selectMonth(data, anchor, today), [data, anchor, today]);
  const grid = monthGrid(anchor);
  const monthPrefix = anchor.slice(0, 7);
  const day = selected && selected.startsWith(monthPrefix) ? selected : offset === 0 ? today : null;
  const dayItems = day ? (view.byDay[day] ?? []) : [];
  const past = view.end < today;

  return (
    <>
      <PageHeader
        eyebrow={`${offset === 0 ? "Este mês · " : ""}${monthLabel(anchor).split(" ").pop()}`}
        title={monthLabel(anchor).split(" ")[0]}
      >
        <div className="flex">
          <IconButton
            label="Mês anterior"
            onClick={() => {
              setOffset((o) => o - 1);
              setSelected(null);
            }}
          >
            <IconChevronLeft />
          </IconButton>
          <IconButton
            label="Próximo mês"
            onClick={() => {
              setOffset((o) => o + 1);
              setSelected(null);
            }}
          >
            <IconChevronRight />
          </IconButton>
        </div>
      </PageHeader>

      {!past && (
        <div className="mb-8">
          <Button variant="primary" onClick={() => setProposal(proposeMonthPlan(data, anchor, today))}>
            <IconSparkle size={18} /> Organizar meu mês
          </Button>
        </div>
      )}

      {/* calendário */}
      <div className="mb-4 rounded-[32px] bg-surface p-4 shadow-soft ring-1 ring-black/[0.03]">
        <div className="mb-1 grid grid-cols-7 text-center text-[12px] font-medium text-muted">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="py-1">
              {w}
            </span>
          ))}
        </div>
        {grid.map((week) => (
          <div key={week[0]} className="grid grid-cols-7">
            {week.map((d) => {
              const inMonth = d.startsWith(monthPrefix);
              const dots = dotsFor(view.byDay[d] ?? []);
              const isToday = d === today;
              const isSel = d === day;
              return (
                <button
                  key={d}
                  disabled={!inMonth}
                  onClick={() => setSelected(d)}
                  aria-label={fmt(d, "d 'de' MMMM")}
                  aria-pressed={isSel}
                  className={clsx(
                    "mx-auto flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-full font-display text-[17px] font-light tabular-nums transition",
                    !inMonth && "invisible",
                    isSel ? "bg-ink text-bg" : "hover:bg-surface-2",
                    !isSel && isToday && "bg-accent-soft font-normal text-accent-text",
                    !isSel && d < today && "text-muted",
                  )}
                >
                  {Number(d.slice(8, 10))}
                  <span className="flex h-1.5 gap-[3px]">
                    {dots.event && <Dot className={isSel ? "bg-bg" : "bg-ink-2"} />}
                    {dots.deadline && <Dot className="bg-warn" />}
                    {dots.out && <Dot className="bg-area-finance" />}
                    {dots.in && <Dot className="bg-ok" />}
                    {!dots.deadline && dots.task && !dots.event && <Dot className={isSel ? "bg-bg/60" : "bg-faint"} />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mb-10 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[13px] text-muted">
        <Legend className="bg-ink-2">compromisso</Legend>
        <Legend className="bg-warn">prazo</Legend>
        <Legend className="bg-area-finance">conta</Legend>
        <Legend className="bg-ok">recebimento</Legend>
      </p>

      {day && (
        <Section title={relativeDay(day, today) === "hoje" ? "Hoje" : fmt(day, "EEEE, d 'de' MMMM")}>
          {dayItems.length ? (
            <Group flat>
              {dayItems.map((i) => (
                <ItemRow key={i.id} item={i} today={today} showDate={false} />
              ))}
            </Group>
          ) : (
            <p className="px-1 text-[15px] text-muted">Nada marcado.</p>
          )}
        </Section>
      )}

      {/* dinheiro do mês */}
      <Section
        title="Dinheiro do mês"
        action={
          <Link href="/financas" className="text-[13px] text-muted hover:text-ink">
            Detalhes
          </Link>
        }
      >
        <MoneyGrid summary={view.money} />
      </Section>

      {view.goals.length > 0 && (
        <Section title="Metas">
          <Group flat>
            {view.goals.map((g) => (
              <div key={g.id} className="flex items-center gap-4 px-1 py-4">
                <CheckCircle checked={g.status === "done"} onToggle={() => toggleDone(g.id)} label="Meta atingida" />
                <span className={clsx("flex-1 text-[16px]", g.status === "done" && "text-muted line-through")}>
                  {g.title}
                </span>
              </div>
            ))}
          </Group>
        </Section>
      )}

      {offset === 0 && (
        <Section title="Chegando" hint="O que é importante nos próximos 30 dias.">
          {view.upcoming.length ? (
            <Group flat>
              {view.upcoming.map((i) => (
                <ItemRow key={i.id} item={i} today={today} />
              ))}
            </Group>
          ) : (
            <EmptyState title="Nada grande no horizonte." />
          )}
        </Section>
      )}

      {view.deadlines.filter(isOpen).length > 0 && (
        <Section title="Prazos do mês">
          <Group flat>
            {view.deadlines.map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
        </Section>
      )}

      {view.projects.length > 0 && (
        <Section title="Projetos com prazo">
          <Group flat>
            {view.projects.map((p) => (
              <Link
                key={p.id}
                href={`/projetos/${p.id}`}
                className="flex items-center justify-between px-1 py-4 hover:bg-surface-2/50"
              >
                <span className="text-[16px] text-ink">{p.name}</span>
                <span className={clsx("text-[14px]", diffDays(p.deadline!, today) <= 7 ? "text-warn" : "text-muted")}>
                  {relativeDay(p.deadline!, today)}
                </span>
              </Link>
            ))}
          </Group>
        </Section>
      )}

      {view.unscheduledCount > 0 && (
        <p className="px-1 text-[14px] text-muted">
          {view.unscheduledCount} {view.unscheduledCount === 1 ? "item está" : "itens estão"} sem data — tudo bem. O
          Organizar pode sugerir semanas.
        </p>
      )}

      <PlanSheet open={!!proposal} proposal={proposal} today={today} onClose={() => setProposal(null)} />
    </>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={clsx("h-1.5 w-1.5 rounded-full", className)} />;
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot className={className} />
      {children}
    </span>
  );
}
