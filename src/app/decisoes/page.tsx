"use client";

import Link from "next/link";
import { addDays } from "@/lib/domain/dates";
import { resolveDecision } from "@/lib/domain/operations";
import { pendingDecisions } from "@/lib/domain/selectors";
import type { AppData, Decision, DecisionKind } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { getTool } from "@/lib/intelligence/tools";
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

function describeActions(data: AppData, d: Decision): string[] {
  return d.actions.map((a) => {
    const t = getTool(a.tool);
    return t && t.kind === "write" ? t.describe(data, a.input) : a.tool;
  });
}

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
      <PageHeader eyebrow="Só você decide" title="Decisões" />
      <p className="-mt-4 mb-7 text-[14px] text-muted">
        Aqui chegam sugestões e coisas que esperam um sim ou não. Nada acontece sem sua aprovação — e o app nunca paga,
        envia ou publica nada de verdade.
      </p>

      {list.length === 0 ? (
        <EmptyState title="Nenhuma decisão pendente." />
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <DecisionCard key={d.id} decision={d} today={today} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-8">
          <Collapsible title="Resolvidas recentemente" count={resolved.length}>
            <ul className="space-y-1.5 px-1 text-[14px] text-muted">
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
  const data = useStore((s) => s.data);
  const approve = useStore((s) => s.approveDecision);
  const apply = useStore((s) => s.apply);
  const openItem = useUI((s) => s.openItem);
  const kind = KIND[decision.kind];
  const effects = describeActions(data, decision);

  return (
    <article className="rounded-[22px] bg-surface p-4 shadow-soft">
      <div className="mb-2 flex items-center gap-2">
        <Pill tone={kind.tone}>{kind.label}</Pill>
        {decision.createdBy === "agent" && (
          <span className="text-[12px] text-faint">sugerido pelo assistente local</span>
        )}
      </div>
      <h3 className="text-[17px] leading-snug font-semibold text-ink">{decision.title}</h3>
      {decision.context && <p className="mt-1 text-[14px] text-ink-2">{decision.context}</p>}
      {effects.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          Ao aprovar: {effects.join("; ").replace(/^./, (c) => c.toLowerCase())}.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
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
            className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3.5 text-[13px] font-medium"
          >
            Ver projeto
          </Link>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto px-2.5"
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
