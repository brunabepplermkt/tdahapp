"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { relativeDay } from "@/lib/domain/dates";
import type { ISODate } from "@/lib/domain/types";
import type { PlanProposal } from "@/lib/intelligence";
import { useStore } from "@/lib/store/store";
import { CheckCircle } from "@/components/items/ItemRow";
import { Button, Collapsible } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";

/**
 * Preview de “Organizar minha semana/mês”. Nada muda até “Aplicar”.
 * Você pode desmarcar qualquer movimento.
 */
export function PlanSheet({
  open,
  onClose,
  proposal,
  today,
}: {
  open: boolean;
  onClose: () => void;
  proposal: PlanProposal | null;
  today: ISODate;
}) {
  return (
    <Sheet
      open={open && !!proposal}
      onClose={onClose}
      title={proposal?.scope === "month" ? "Proposta para o mês" : "Proposta para a semana"}
    >
      {proposal && (
        <PlanBody
          key={proposal.moves.map((m) => m.itemId).join()}
          proposal={proposal}
          today={today}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function PlanBody({ proposal, today, onClose }: { proposal: PlanProposal; today: ISODate; onClose: () => void }) {
  const applyPlan = useStore((s) => s.applyPlan);
  const [off, setOff] = useState<Set<string>>(new Set());
  const selected = proposal.moves.filter((m) => !off.has(m.itemId));

  const byDay = useMemo(() => {
    const map = new Map<ISODate, typeof proposal.moves>();
    for (const m of [...proposal.moves].sort((a, b) => a.to.localeCompare(b.to))) {
      map.set(m.to, [...(map.get(m.to) ?? []), m]);
    }
    return [...map.entries()];
  }, [proposal]);

  return (
    <div>
      <p className="mb-1 text-[16px] text-ink">{proposal.summary}</p>
      <p className="mb-5 text-[13px] text-muted">É só uma sugestão. Desmarque o que não fizer sentido.</p>

      {proposal.warnings.length > 0 && (
        <ul className="mb-5 space-y-1.5 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {proposal.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {byDay.map(([day, moves]) => (
        <div key={day} className="mb-4">
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted capitalize">
            {relativeDay(day, today)}{" "}
            <span className="font-normal text-faint">
              · {day.slice(8, 10)}/{day.slice(5, 7)}
            </span>
          </p>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-soft [&>*+*]:border-t [&>*+*]:border-line">
            {moves.map((m) => {
              const on = !off.has(m.itemId);
              return (
                <div key={m.itemId} className={clsx("flex items-start gap-3 px-4 py-3", !on && "opacity-50")}>
                  <span className="mt-0.5">
                    <CheckCircle
                      checked={on}
                      label={on ? "Não aplicar" : "Aplicar"}
                      onToggle={() =>
                        setOff((s) => {
                          const n = new Set(s);
                          if (n.has(m.itemId)) n.delete(m.itemId);
                          else n.add(m.itemId);
                          return n;
                        })
                      }
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-ink">{m.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{m.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {proposal.leftOut.length > 0 && (
        <Collapsible title="Ficaram de fora (de propósito)" count={proposal.leftOut.length}>
          <ul className="space-y-1 px-1 text-[14px] text-muted">
            {proposal.leftOut.map((l) => (
              <li key={l.itemId}>{l.title}</li>
            ))}
          </ul>
        </Collapsible>
      )}

      <div className="sticky bottom-0 mt-4 flex gap-2 bg-bg pt-2">
        <Button block onClick={onClose}>
          Agora não
        </Button>
        <Button
          block
          variant="primary"
          disabled={selected.length === 0}
          onClick={() => {
            applyPlan(selected);
            onClose();
          }}
        >
          Aplicar {selected.length > 0 ? selected.length : ""}
        </Button>
      </div>
    </div>
  );
}
