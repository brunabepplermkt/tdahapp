"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { addDays, weekStart } from "@/lib/domain/dates";
import { archiveCapture, archiveItem, updateProject } from "@/lib/domain/operations";
import { forgottenItems, inboxCaptures, isMoney, isOverdue, isSlipped, summarizeProject } from "@/lib/domain/selectors";
import type { Item } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { proposeWeekPlan, type PlanProposal } from "@/lib/intelligence";
import { useStore } from "@/lib/store/store";
import { DraftChips } from "@/components/capture/DraftView";
import { PlanSheet } from "@/components/plan/PlanSheet";
import { Ready } from "@/components/shell/AppShell";
import { IconCheck, IconChevronLeft } from "@/components/ui/icons";
import { Button, EmptyState, Group, inputClass, PageHeader } from "@/components/ui/primitives";

export default function ReviewPage() {
  return (
    <Ready>
      <Review />
    </Ready>
  );
}

const STEPS = [
  { title: "Esvaziar a Inbox", hint: "Aceite o que está claro. O resto pode ser arquivado sem culpa." },
  { title: "O que ficou pra trás", hint: "Para cada um: ainda importa? Quando, de verdade?" },
  { title: "Projetos", hint: "Cada projeto ativo precisa de uma próxima ação. Uma frase basta." },
  { title: "Coisas esquecidas", hint: "Sem data há um tempo. Decida rápido — não precisa fazer agora." },
  { title: "Próxima semana", hint: "Deixe o app sugerir uma distribuição. Você revisa antes." },
] as const;

/** Revisão semanal em 5 passos curtos (~10 min). Cada passo mostra só o necessário. */
function Review() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const isLast = step === STEPS.length - 1;

  if (done) {
    return (
      <div className="pt-24 text-center">
        <span className="mx-auto mb-5 inline-flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-ok text-white">
          <IconCheck size={32} strokeWidth={2.5} />
        </span>
        <h1 className="text-[26px] font-semibold text-ink">Revisão feita.</h1>
        <p className="mt-2 text-[15px] text-muted">Sua cabeça pode descansar. O que importa está no lugar.</p>
        <Link href="/" className="mt-8 inline-block text-[15px] font-medium text-accent">
          Ir para o Hoje
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow={`Revisão semanal · ${step + 1} de ${STEPS.length}`} title={STEPS[step].title} />
      <div className="-mt-4 mb-6 flex gap-1.5" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={clsx("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-line")} />
        ))}
      </div>
      <p className="mb-6 text-[15px] text-ink-2">{STEPS[step].hint}</p>

      {step === 0 && <InboxStep />}
      {step === 1 && <SlippedStep />}
      {step === 2 && <ProjectsStep />}
      {step === 3 && <ForgottenStep />}
      {step === 4 && <PlanStep />}

      <div className="mt-10 flex items-center justify-between">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <IconChevronLeft size={18} /> Voltar
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={() => (isLast ? setDone(true) : setStep((s) => s + 1))}>
          {isLast ? "Concluir revisão" : "Próximo"}
        </Button>
      </div>
    </>
  );
}

function Clear({ children }: { children: ReactNode }) {
  return <EmptyState title="Nada aqui. ✓">{children}</EmptyState>;
}

function InboxStep() {
  const { data, today } = useApp();
  const acceptCapture = useStore((s) => s.acceptCapture);
  const apply = useStore((s) => s.apply);
  const list = inboxCaptures(data.captures, today);
  if (!list.length) return <Clear>Inbox vazia.</Clear>;
  return (
    <div className="space-y-3">
      {list.map((c) => (
        <div key={c.id} className="rounded-[22px] bg-surface p-4 shadow-soft">
          <p className="mb-2 text-[15px] text-ink">“{c.text}”</p>
          <div className="mb-3 space-y-1.5">
            {c.interpretation?.drafts.map((d, i) => (
              <DraftChips key={i} draft={d} today={today} projects={data.projects} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!c.interpretation?.drafts.length}
              onClick={() => acceptCapture(c.id, c.interpretation?.drafts ?? [])}
            >
              Aceitar
            </Button>
            <Link
              href="/inbox"
              className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3.5 text-[13px] font-medium"
            >
              Ajustar
            </Link>
            <Button size="sm" variant="ghost" onClick={() => apply((d) => archiveCapture(d, c.id), "Arquivado.")}>
              Soltar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DecideRow({ item, children }: { item: Item; children: ReactNode }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[15px] text-ink">{item.title}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SlippedStep() {
  const { data, today } = useApp();
  const { updateItem, postpone, someday, toggleDone } = useStore.getState();
  const items = data.items.filter((i) => !i.parentId && !isMoney(i) && (isSlipped(i, today) || isOverdue(i, today)));
  if (!items.length) return <Clear>Nada atrasado.</Clear>;
  const nextMonday = addDays(weekStart(today), 7);
  return (
    <Group>
      {items.map((i) => (
        <DecideRow key={i.id} item={i}>
          <Button size="sm" onClick={() => updateItem(i.id, { scheduledDate: today })}>
            Hoje
          </Button>
          <Button size="sm" onClick={() => postpone(i.id, nextMonday, "na segunda")}>
            Semana que vem
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggleDone(i.id)}>
            Já fiz
          </Button>
          <Button size="sm" variant="ghost" onClick={() => someday(i.id)}>
            Algum dia
          </Button>
        </DecideRow>
      ))}
    </Group>
  );
}

function ProjectsStep() {
  const { data, today } = useApp();
  const apply = useStore((s) => s.apply);
  const addItem = useStore((s) => s.addItem);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const active = data.projects.filter((p) => p.status === "active");
  if (!active.length) return <Clear>Nenhum projeto ativo.</Clear>;
  return (
    <div className="space-y-3">
      {active.map((p) => {
        const s = summarizeProject(data, p, today);
        return (
          <div key={p.id} className="rounded-[22px] bg-surface p-4 shadow-soft">
            <p className="text-[16px] font-semibold text-ink">{p.name}</p>
            {p.currentState && <p className="mt-1 text-[14px] text-ink-2">{p.currentState}</p>}
            {s.nextAction ? (
              <p className="mt-2 text-[14px] text-muted">
                Próximo: <span className="text-ink-2">{s.nextAction.title}</span>
              </p>
            ) : (
              <form
                className="mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = drafts[p.id]?.trim();
                  if (!t) return;
                  addItem({ title: t, area: p.area, projectId: p.id, kind: "task" });
                  setDrafts((d) => ({ ...d, [p.id]: "" }));
                }}
              >
                <input
                  className={inputClass}
                  placeholder="Próxima ação (ex.: abrir o arquivo X)"
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
              </form>
            )}
            <div className="mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => apply((d) => updateProject(d, p.id, { status: "paused" }), `${p.name} pausado.`)}
              >
                Pausar este projeto
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForgottenStep() {
  const { data, today } = useApp();
  const apply = useStore((s) => s.apply);
  const { updateItem, someday } = useStore.getState();
  const items = forgottenItems(data.items, today).slice(0, 8);
  if (!items.length) return <Clear>Nada esquecido.</Clear>;
  return (
    <Group>
      {items.map((i) => (
        <DecideRow key={i.id} item={i}>
          <Button size="sm" onClick={() => updateItem(i.id, { scheduledDate: addDays(weekStart(today), 7) })}>
            Semana que vem
          </Button>
          <Button size="sm" variant="ghost" onClick={() => someday(i.id)}>
            Algum dia
          </Button>
          <Button size="sm" variant="ghost" onClick={() => apply((d) => archiveItem(d, i.id), "Arquivado.")}>
            Não importa mais
          </Button>
        </DecideRow>
      ))}
    </Group>
  );
}

function PlanStep() {
  const { data, today } = useApp();
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  // de sexta em diante, planeja a semana seguinte; antes disso, o resto desta
  const wd = new Date(`${today}T12:00:00`).getDay();
  const target = wd === 0 || wd >= 5 ? addDays(weekStart(today), 7) : today;
  return (
    <>
      <Button variant="primary" onClick={() => setProposal(proposeWeekPlan(data, target, today))}>
        Ver proposta para {target === today ? "o resto da semana" : "a próxima semana"}
      </Button>
      <PlanSheet open={!!proposal} proposal={proposal} today={today} onClose={() => setProposal(null)} />
    </>
  );
}
