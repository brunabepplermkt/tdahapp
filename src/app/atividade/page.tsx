"use client";

import clsx from "clsx";
import { useApp } from "@/lib/hooks/useApp";
import { Ready } from "@/components/shell/AppShell";
import { EmptyState, Group, PageHeader } from "@/components/ui/primitives";

export default function ActivityPage() {
  return (
    <Ready>
      <Activity />
    </Ready>
  );
}

const ACTOR = { user: "Você", agent: "Assistente", system: "Sistema" };
const ORIGIN = { user_app: "app", automation: "automação", agent: "agente", import: "importação" };
const STATUS = { ok: "", proposed: "aguardando aprovação", error: "falhou", rejected: "recusado" };

function Activity() {
  const { data } = useApp();
  return (
    <>
      <PageHeader title="Atividade" />
      {data.activity.length === 0 ? (
        <EmptyState title="Nada ainda." />
      ) : (
        <Group flat>
          {data.activity.slice(0, 80).map((a) => (
            <div key={a.id} className="px-1 py-4">
              <p className="text-[16px] leading-snug text-ink">{a.summary}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {ACTOR[a.actor]}
                {STATUS[a.status] && (
                  <span className={clsx(a.status === "error" && "text-danger")}> · {STATUS[a.status]}</span>
                )}{" "}
                · <span className="font-mono">{a.tool}</span>
                {a.origin && <span> · origem: {ORIGIN[a.origin]}</span>}
                {a.proposedBy && <span> · proposto por {ORIGIN[a.proposedBy]}</span>} ·{" "}
                {new Date(a.at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))}
        </Group>
      )}
    </>
  );
}
