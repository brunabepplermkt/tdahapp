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
        eyebrow={offset === 0 ? `Esta semana · ${range}` : offset === 1 ? `Semana que vem · ${range}` : range}
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

      {!isPastWeek && (
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={organize}>
            <IconSparkle size={18} /> Organizar minha semana
          </Button>
          <Link href="/revisao" className="text-[14px] font-medium text-accent">
            Revisão semanal
          </Link>
          {(view.totals.out > 0 || view.totals.in > 0) && (
            <p className="text-[13px] text-muted tabular-nums">
              {view.totals.out > 0 && <>{formatBRL(view.totals.out, true)} saem</>}
              {view.totals.out > 0 && view.totals.in > 0 && " · "}
              {view.totals.in > 0 && <span className="text-ok">{formatBRL(view.totals.in, true)} entram</span>}
            </p>
          )}
        </div>
      )}

      {offset === 0 && view.slipped.length > 0 && (
        <p className="mb-6 rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-2 shadow-soft">
          {view.slipped.length === 1 ? "1 item ficou" : `${view.slipped.length} itens ficaram`} de dias anteriores.{" "}
          <button onClick={organize} className="font-medium text-accent">
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
          title="Sem dia ainda"
          hint="Não precisa planejar tudo. Toque para escolher um dia, ou deixe o Organizar sugerir."
        >
          <Group>
            {view.unscheduled.slice(0, 8).map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
          {view.unscheduled.length > 8 && (
            <p className="mt-2 px-1 text-[13px] text-muted">+{view.unscheduled.length - 8} outros sem data.</p>
          )}
        </Section>
      )}

      {view.projectsToPush.length > 0 && (
        <Section title="Projetos que precisam andar">
          <Group>
            {view.projectsToPush.map(({ project, reason, nextAction }) => (
              <Link key={project.id} href={`/projetos/${project.id}`} className="block px-4 py-3.5 hover:bg-surface-2">
                <p className="text-[15px] font-medium text-ink">{project.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">
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

function Day({ bucket, today }: { bucket: DayBucket; today: string }) {
  const isToday = bucket.date === today;
  const past = bucket.date < today;
  const all = [...bucket.events, ...bucket.items, ...bucket.money];
  const load = loadLabel(bucket.load);
  return (
    <section className={clsx("mb-6", past && "opacity-70")}>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className={clsx("text-[17px] font-semibold capitalize", isToday ? "text-accent" : "text-ink")}>
          {isToday ? "Hoje" : fmt(bucket.date, "EEEE").replace("-feira", "")}
        </h2>
        <span className="text-[14px] text-muted">{fmt(bucket.date, "d")}</span>
        {all.some((i) => i.status === "open") && !past && (
          <span className={clsx("ml-auto text-[12px]", load.tone === "heavy" ? "text-warn" : "text-faint")}>
            {load.label}
          </span>
        )}
      </div>
      {all.length === 0 && bucket.deadlines.length === 0 ? (
        <p className="px-1 text-[14px] text-faint">Livre.</p>
      ) : (
        <Group>
          {all.map((i) => (
            <ItemRow key={i.id} item={i} today={today} showDate={false} />
          ))}
          {bucket.deadlines.map((i) => (
            <div key={i.id} className="px-4 py-2.5 text-[13px] text-warn">
              Prazo: {i.title}
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}
