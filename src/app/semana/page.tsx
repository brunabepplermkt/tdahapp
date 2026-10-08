"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { addDays, fmt, weekDays } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { selectWeek, type DayBucket } from "@/lib/domain/selectors";
import { useApp } from "@/lib/hooks/useApp";
import { proposeWeekPlan, type PlanProposal } from "@/lib/intelligence";
import { ItemRow } from "@/components/items/ItemRow";
import { PlanSheet } from "@/components/plan/PlanSheet";
import { Ready } from "@/components/shell/AppShell";
import { IconChevronLeft, IconChevronRight, IconSparkle } from "@/components/ui/icons";
import { Button, Collapsible, Group, IconButton, PageHeader, Section } from "@/components/ui/primitives";

export default function WeekPage() {
  return (
    <Ready>
      <Suspense>
        <Week />
      </Suspense>
    </Ready>
  );
}

function loadLabel(minutes: number): { label: string; tone: "light" | "ok" | "heavy" } {
  if (minutes >= 300) return { label: "dia cheio", tone: "heavy" };
  if (minutes >= 150) return { label: "dia médio", tone: "ok" };
  return { label: "leve", tone: "light" };
}

function Week() {
  const { data, today } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  // chegar com ?organizar=1 (link do Hoje) já abre a proposta
  const [proposal, setProposal] = useState<PlanProposal | null>(() =>
    params.get("organizar") === "1" ? proposeWeekPlan(data, today, today) : null,
  );

  const anchor = addDays(today, offset * 7);
  const days = weekDays(anchor);
  const view = selectWeek(data, days, today);

  const organize = () => setProposal(proposeWeekPlan(data, anchor, today));

  useEffect(() => {
    if (params.get("organizar") === "1") router.replace("/semana");
  }, [params, router]);

  const range = `${fmt(days[0], "d MMM").replace(".", "")} – ${fmt(days[6], "d MMM").replace(".", "")}`;
  const isPastWeek = days[6] < today;
  const pastDays = view.days.filter((d) => d.date < today);
  const nextDays = view.days.filter((d) => d.date >= today);

  return (
    <>
      <PageHeader
        eyebrow={range}
        title="Semana"
      >
        <div className="flex">
          <IconButton label="Semana anterior" onClick={() => setOffset((o) => o - 1)}>
            <IconChevronLeft />
          </IconButton>
          <IconButton label="Próxima semana" onClick={() => setOffset((o) => o + 1)}>
            <IconChevronRight />
          </IconButton>
        </div>
      </PageHeader>

      <WeekStrip days={view.days} today={today} />

      {!isPastWeek && (
        <div className="mb-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={organize}>
              <IconSparkle size={18} /> Organizar minha semana
            </Button>
            <Link
              href="/revisao"
              className="inline-flex h-12 items-center rounded-full bg-surface px-5 text-[15px] font-medium text-ink ring-1 ring-line-strong/70 hover:bg-surface-2"
            >
              Revisão semanal
            </Link>
          </div>
          {(view.totals.out > 0 || view.totals.in > 0) && (
            <p className="mt-4 px-1 text-[14px] text-muted tabular-nums">
              {view.totals.out > 0 && <>{formatBRL(view.totals.out, true)} saem</>}
              {view.totals.out > 0 && view.totals.in > 0 && " · "}
              {view.totals.in > 0 && <span className="text-ok">{formatBRL(view.totals.in, true)} entram</span>}
            </p>
          )}
        </div>
      )}

      {offset === 0 && view.slipped.length > 0 && (
        <p className="mb-8 rounded-[28px] bg-accent-soft px-6 py-4 text-[15px] leading-snug text-ink-2">
          {view.slipped.length} para trás.{" "}
          <button onClick={organize} className="font-medium text-accent-text">
            Redistribuir
          </button>
        </p>
      )}

      {pastDays.length > 0 && !isPastWeek && (
        <Collapsible title="Dias que passaram" count={pastDays.length}>
          {pastDays.map((d) => (
            <Day key={d.date} bucket={d} today={today} />
          ))}
        </Collapsible>
      )}

      {(isPastWeek ? view.days : nextDays).map((d) => (
        <Day key={d.date} bucket={d} today={today} />
      ))}

      {view.unscheduled.length > 0 && (
        <Section
          title="Sem dia"
        >
          <Group flat>
            {view.unscheduled.slice(0, 8).map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
          {view.unscheduled.length > 8 && (
            <p className="mt-3 px-1 text-[14px] text-muted">+{view.unscheduled.length - 8}</p>
          )}
        </Section>
      )}

      {view.projectsToPush.length > 0 && (
        <Section title="Projetos que precisam andar">
          <Group>
            {view.projectsToPush.map(({ project, reason, nextAction }) => (
              <Link key={project.id} href={`/projetos/${project.id}`} className="block px-5 py-4 hover:bg-surface-2">
                <p className="text-[16px] text-ink">{project.name}</p>
                <p className="mt-1 text-[14px] text-muted">
                  {reason}
                  {nextAction && <> · próximo: {nextAction.title}</>}
                </p>
              </Link>
            ))}
          </Group>
        </Section>
      )}

      <PlanSheet open={!!proposal} proposal={proposal} today={today} onClose={() => setProposal(null)} />
    </>
  );
}

const LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Leitura de relance da semana: 7 dias, o de hoje em coral, e uma barrinha de carga. */
function WeekStrip({ days, today }: { days: DayBucket[]; today: string }) {
  return (
    <nav aria-label="Dias da semana" className="mb-8 grid grid-cols-7 gap-1.5">
      {days.map((b) => {
        const isToday = b.date === today;
        const past = b.date < today;
        const open = [...b.events, ...b.items, ...b.money].some((i) => i.status === "open");
        const load = loadLabel(b.load);
        const level = !open ? 0 : load.tone === "heavy" ? 3 : load.tone === "ok" ? 2 : 1;
        return (
          <a
            key={b.date}
            href={`#dia-${b.date}`}
            aria-label={`${fmt(b.date, "EEEE d")}${open ? `, ${load.label}` : ", livre"}`}
            className={clsx(
              "flex flex-col items-center gap-1.5 rounded-full py-2.5 transition active:scale-95",
              isToday ? "bg-accent text-accent-ink" : "bg-surface ring-1 ring-black/[0.04]",
              past && !isToday && "opacity-55",
            )}
          >
            <span className={clsx("text-[11px] font-medium", isToday ? "text-accent-ink/80" : "text-muted")}>
              {LETTER[new Date(`${b.date}T12:00:00`).getDay()]}
            </span>
            <span className="font-display text-[19px] leading-none tabular-nums">{fmt(b.date, "d")}</span>
            <span aria-hidden className="flex h-1.5 items-end gap-0.5">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={clsx(
                    "w-1 rounded-full",
                    n === 1 ? "h-1" : n === 2 ? "h-1.5" : "h-2",
                    n <= level
                      ? isToday
                        ? "bg-accent-ink"
                        : level === 3
                          ? "bg-warn"
                          : "bg-ink-2"
                      : isToday
                        ? "bg-accent-ink/30"
                        : "bg-line-strong",
                  )}
                />
              ))}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

function Day({ bucket, today }: { bucket: DayBucket; today: string }) {
  const isToday = bucket.date === today;
  const past = bucket.date < today;
  const all = [...bucket.events, ...bucket.items, ...bucket.money];
  const load = loadLabel(bucket.load);
  return (
    <section id={`dia-${bucket.date}`} className={clsx("mb-9 scroll-mt-6", past && "opacity-70")}>
      <div className="mb-3 flex items-baseline gap-2.5 px-1">
        <span className={clsx("t-title text-[34px]", isToday ? "text-accent-text" : "text-ink")}>
          {fmt(bucket.date, "d")}
        </span>
        <h2 className={clsx("text-[17px] capitalize", isToday ? "font-medium text-accent-text" : "text-ink-2")}>
          {isToday ? "Hoje" : fmt(bucket.date, "EEEE").replace("-feira", "")}
        </h2>
        {all.some((i) => i.status === "open") && !past && (
          <span className={clsx("ml-auto text-[13px]", load.tone === "heavy" ? "text-warn" : "text-muted")}>
            {load.label}
          </span>
        )}
      </div>
      {all.length === 0 && bucket.deadlines.length === 0 ? (
        <p className="px-1 text-[15px] text-muted">Livre.</p>
      ) : (
        <Group flat>
          {all.map((i) => (
            <ItemRow key={i.id} item={i} today={today} showDate={false} />
          ))}
          {bucket.deadlines.map((i) => (
            <div key={i.id} className="px-1 py-3 text-[14px] text-warn">
              Prazo: {i.title}
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}
