"use client";

import { relativeDay } from "@/lib/domain/dates";
import { formatBRL, parseBRL } from "@/lib/domain/money";
import {
  AREA_LABEL,
  KIND_LABEL,
  type Area,
  type ISODate,
  type ItemDraft,
  type ItemKind,
  type Project,
} from "@/lib/domain/types";
import { AreaDot, Field, inputClass, Pill, Segmented } from "@/components/ui/primitives";

/** Resumo em chips de como um rascunho foi entendido. */
export function DraftChips({ draft, today, projects }: { draft: ItemDraft; today: ISODate; projects: Project[] }) {
  const project = draft.projectId ? projects.find((p) => p.id === draft.projectId) : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill>
        <AreaDot area={draft.area} />
        {KIND_LABEL[draft.kind]}
      </Pill>
      {draft.dueDate && <Pill tone="warn">prazo {relativeDay(draft.dueDate, today)}</Pill>}
      {draft.scheduledDate && (
        <Pill tone="accent">
          {relativeDay(draft.scheduledDate, today)}
          {draft.startTime ? ` ${draft.startTime}` : ""}
        </Pill>
      )}
      {project && <Pill>{project.name}</Pill>}
      {draft.people?.map((p) => (
        <Pill key={p}>{p}</Pill>
      ))}
      {draft.money && draft.money.amountCents > 0 && (
        <Pill tone={draft.money.direction === "in" ? "ok" : "neutral"}>{formatBRL(draft.money.amountCents)}</Pill>
      )}
      {draft.recurrence && <Pill>repete</Pill>}
      {draft.priority === "high" && <Pill tone="danger">importante</Pill>}
    </div>
  );
}

const KINDS: ItemKind[] = ["task", "event", "bill", "income", "shopping", "reminder", "idea", "goal"];

/** Editor compacto de um rascunho (Inbox → Editar). */
export function DraftEditor({
  draft,
  onChange,
  projects,
}: {
  draft: ItemDraft;
  onChange: (d: ItemDraft) => void;
  projects: Project[];
}) {
  const set = (patch: Partial<ItemDraft>) => onChange({ ...draft, ...patch });
  const isMoney = draft.kind === "bill" || draft.kind === "income" || draft.kind === "expense";

  return (
    <div className="space-y-3.5">
      <Field label="O quê">
        <input className={inputClass} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Área">
        <Segmented<Area>
          value={draft.area}
          onChange={(area) => set({ area })}
          options={(Object.keys(AREA_LABEL) as Area[]).map((a) => ({ value: a, label: AREA_LABEL[a] }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select
            className={inputClass}
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as ItemKind;
              const money =
                kind === "bill" || kind === "income" || kind === "expense"
                  ? {
                      amountCents: draft.money?.amountCents ?? 0,
                      direction: kind === "income" ? ("in" as const) : ("out" as const),
                      category: draft.money?.category,
                    }
                  : null;
              set({ kind, money, area: money ? "finance" : draft.area });
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projeto">
          <select
            className={inputClass}
            value={draft.projectId ?? ""}
            onChange={(e) => set({ projectId: e.target.value || null })}
          >
            <option value="">Nenhum</option>
            {projects
              .filter((p) => p.status !== "done")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={draft.kind === "event" ? "Dia" : "Fazer em"}>
          <input
            type="date"
            className={inputClass}
            value={draft.scheduledDate ?? ""}
            onChange={(e) => set({ scheduledDate: e.target.value || null })}
          />
        </Field>
        <Field label={isMoney ? "Vencimento" : "Prazo"}>
          <input
            type="date"
            className={inputClass}
            value={draft.dueDate ?? ""}
            onChange={(e) => set({ dueDate: e.target.value || null })}
          />
        </Field>
      </div>
      {isMoney && (
        <Field label="Valor (R$)">
          <input
            inputMode="decimal"
            className={inputClass}
            defaultValue={draft.money?.amountCents ? (draft.money.amountCents / 100).toFixed(2).replace(".", ",") : ""}
            placeholder="0,00"
            onBlur={(e) =>
              set({
                money: {
                  amountCents: parseBRL(e.target.value) ?? 0,
                  direction: draft.kind === "income" ? "in" : "out",
                  category: draft.money?.category,
                },
              })
            }
          />
        </Field>
      )}
      <label className="flex min-h-11 items-center gap-3 px-1 text-[15px]">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent)]"
          checked={draft.priority === "high"}
          onChange={(e) => set({ priority: e.target.checked ? "high" : "normal" })}
        />
        Importante
      </label>
    </div>
  );
}
