"use client";

import Link from "next/link";
import { addDays } from "@/lib/domain/dates";
import { resolveDecision } from "@/lib/domain/operations";
import { pendingDecisions } from "@/lib/domain/selectors";
import type { Decision, DecisionKind } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { Ready } from "@/components/shell/AppShell";
import { Button, Collapsible, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";

export default function DecisionsPage() {
  return (
    <Ready>
      <Decisions />
    </Ready>
  );
}

const KIND: Record<DecisionKind, { label: string; tone: "warn" | "accent" | "neutral" }> = {
  pay: { label: "Pagamento", tone: "warn" },
  reply: { label: "Responder", tone: "accent" },
  approve: { label: "Aprovar", tone: "accent" },
  choose_date: { label: "Escolher data", tone: "neutral" },
  agent_suggestion: { label: "Sugestão", tone: "neutral" },
};

function Decisions() {
  const { data, today } = useApp();
  // pagamentos e respostas primeiro; sugestões do assistente por último
  const order: Record<DecisionKind, number> = { pay: 0, reply: 1, approve: 2, choose_date: 3, agent_suggestion: 4 };
  const list = pendingDecisions(data.decisions, today, data.items).sort((a, b) => order[a.kind] - order[b.kind]);
  const resolved = data.decisions
    .filter((d) => d.status === "approved" || d.status === "ignored")
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, 10);

  return (
    <>
      <PageHeader title="Decisões" />
      {list.length === 0 ? (
        <EmptyState title="Nenhuma decisão pendente." />
      ) : (
        <div className="space-y-4">
          {list.map((d) => (
            <DecisionCard key={d.id} decision={d} today={today} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-10">
          <Collapsible title="Resolvidas recentemente" count={resolved.length}>
            <ul className="space-y-2 px-1 text-[15px] text-muted">
              {resolved.map((d) => (
                <li key={d.id}>
                  {d.status === "approved" ? "✓" : "—"} {d.title}
                </li>
              ))}
            </ul>
          </Collapsible>
        </div>
      )}
    </>
  );
}

function DecisionCard({ decision, today }: { decision: Decision; today: string }) {
  const approve = useStore((s) => s.approveDecision);
  const apply = useStore((s) => s.apply);
  const openItem = useUI((s) => s.openItem);
  const kind = KIND[decision.kind];
  
  return (
    <article className="rounded-[28px] bg-surface p-6 shadow-soft ring-1 ring-black/[0.03]">
      <div className="mb-3 flex items-center gap-2">
        <Pill tone={kind.tone}>{kind.label}</Pill>
        {decision.createdBy === "agent" && (
          <span className="text-[13px] text-muted">{decision.actions[0]?.origin === "agent" ? "agente" : "assistente"}</span>
        )}
      </div>
      <h3 className="t-heading text-[22px] leading-[1.25] text-ink">{decision.title}</h3>
      {decision.context && <p className="mt-2 text-[15px] text-ink-2">{decision.context.split(/(?<=\.)\s/)[0]}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => approve(decision)}>
          {decision.kind === "pay" ? "Já paguei" : "Aprovar"}
        </Button>
        {decision.itemId ? (
          <Button size="sm" onClick={() => openItem(decision.itemId!)}>
            Editar
          </Button>
        ) : decision.projectId ? (
          <Link
            href={`/projetos/${decision.projectId}`}
            className="inline-flex h-10 items-center rounded-full bg-surface px-4 text-[14px] font-medium ring-1 ring-line-strong/70"
          >
            Ver projeto
          </Link>
        ) : null}
      </div>
      <div className="-mb-2 mt-1 -ml-3 flex">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => apply((d) => resolveDecision(d, decision.id, "snoozed", addDays(today, 1)), "Volta amanhã.")}
        >
          Adiar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => apply((d) => resolveDecision(d, decision.id, "ignored"), "Ignorado.")}
        >
          Ignorar
        </Button>
      </div>
    </article>
  );
}
