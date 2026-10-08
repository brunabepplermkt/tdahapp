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
const STATUS = { ok: "", proposed: "sugeriu", error: "bloqueado", rejected: "recusado" };

function Activity() {
  const { data } = useApp();
  return (
    <>
      <PageHeader eyebrow="Histórico de ações" title="Atividade" />
      <p className="-mt-4 mb-6 text-[14px] text-muted">
        Tudo que foi feito por você ou sugerido pelo assistente local. Útil para auditar um agente no futuro.
      </p>
      {data.activity.length === 0 ? (
        <EmptyState title="Nada ainda." />
      ) : (
        <Group>
          {data.activity.slice(0, 80).map((a) => (
            <div key={a.id} className="px-4 py-3">
              <p className="text-[14px] text-ink">{a.summary}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {ACTOR[a.actor]}
                {STATUS[a.status] && (
                  <span className={clsx(a.status === "error" && "text-danger")}> · {STATUS[a.status]}</span>
                )}{" "}
                · <span className="font-mono">{a.tool}</span> ·{" "}
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
