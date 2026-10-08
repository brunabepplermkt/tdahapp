"use client";

import clsx from "clsx";
import { useState } from "react";
import { addDays, fromISODate, relativeDay, weekStart } from "@/lib/domain/dates";
import { newId } from "@/lib/domain/id";
import { formatBRL, parseBRL } from "@/lib/domain/money";
import { addSteps, archiveItem, deleteItem, setFocus } from "@/lib/domain/operations";
import {
  AREA_LABEL,
  KIND_LABEL,
  type Area,
  type ISODate,
  type Item,
  type ItemKind,
  type RecurrenceFreq,
} from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { suggestSteps } from "@/lib/intelligence";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { IconClock, IconLeaf, IconSparkle, IconStar, IconTrash } from "@/components/ui/icons";
import { Button, Field, inputClass, Pill, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { CheckCircle } from "./ItemRow";

export function snoozeOptions(today: ISODate): { label: string; toast: string; date: ISODate }[] {
  const wd = fromISODate(today).getDay();
  const saturday = addDays(today, (6 - wd + 7) % 7 || 7);
  const nextMonday = addDays(weekStart(today), 7);
  const opts = [
    { label: "Amanhã", toast: "amanhã", date: addDays(today, 1) },
    ...(wd >= 1 && wd <= 4 ? [{ label: "Fim de semana", toast: "no sábado", date: saturday }] : []),
    { label: "Semana que vem", toast: "na segunda", date: nextMonday },
    {
      label: "Daqui 2 semanas",
      toast: `em ${relativeDay(addDays(nextMonday, 7), today)}`,
      date: addDays(nextMonday, 7),
    },
  ];
  return opts;
}

const KIND_OPTIONS: ItemKind[] = [
  "task",
  "event",
  "bill",
  "income",
  "expense",
  "shopping",
  "reminder",
  "idea",
  "routine",
  "goal",
];

export function ItemSheet() {
  const id = useUI((s) => s.openItemId);
  const close = useUI((s) => s.closeItem);
  const { data, today, ready } = useApp();
  const item = id ? data.items.find((i) => i.id === id) : undefined;

  return (
    <Sheet open={!!item && ready} onClose={close} size="md">
      {item && <ItemDetail key={item.id} item={item} today={today} onClose={close} />}
    </Sheet>
  );
}

function ItemDetail({ item, today, onClose }: { item: Item; today: ISODate; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const apply = useStore((s) => s.apply);
  const update = useStore((s) => s.updateItem);
  const toggleDone = useStore((s) => s.toggleDone);
  const postpone = useStore((s) => s.postpone);
  const someday = useStore((s) => s.someday);
  const openItem = useUI((s) => s.openItem);

  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [amount, setAmount] = useState(item.money ? formatBRL(item.money.amountCents).replace("R$", "").trim() : "");
  const [showSnooze, setShowSnooze] = useState(false);
  const [stepText, setStepText] = useState("");
  const [suggested, setSuggested] = useState<string[] | null>(null);

  const steps = data.items.filter((i) => i.parentId === item.id);
  const parent = item.parentId ? data.items.find((i) => i.id === item.parentId) : undefined;
  const isFocus = item.focusDate === today;
  const done = item.status === "done";
  const moneyKind = item.kind === "bill" || item.kind === "income" || item.kind === "expense";

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== item.title) update(item.id, { title: t });
  };

  const setKind = (kind: ItemKind) => {
    const patch: Partial<Item> = { kind };
    if ((kind === "bill" || kind === "expense" || kind === "income") && !item.money) {
      patch.money = { amountCents: 0, direction: kind === "income" ? "in" : "out", settled: false };
      patch.area = "finance";
    } else if (item.money && (kind === "bill" || kind === "expense" || kind === "income")) {
      patch.money = { ...item.money, direction: kind === "income" ? "in" : "out" };
    }
    update(item.id, patch);
  };

  const addStep = (titles: string[]) => {
    apply((d) => addSteps(d, item.id, titles), titles.length > 1 ? "Passos adicionados." : undefined);
  };

  return (
    <div className="pb-2">
      {parent && (
        <button onClick={() => openItem(parent.id)} className="mb-2 text-[13px] text-accent-text">
          ← Parte de {parent.title}
        </button>
      )}

      <div className="flex items-start gap-3">
        <span className="mt-1.5">
          <CheckCircle checked={done} size="lg" onToggle={() => toggleDone(item.id)} label="Concluir" />
        </span>
        <textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          aria-label="Título"
          className="field-sizing-content min-h-9 w-full resize-none bg-transparent font-display text-[30px] leading-[1.15] font-light tracking-[-0.025em] text-ink focus:outline-none"
        />
      </div>

      <div className="mt-3 mb-5 flex flex-wrap gap-1.5 pl-10">
        <Pill>{KIND_LABEL[item.kind]}</Pill>
        <Pill>{AREA_LABEL[item.area]}</Pill>
        {item.recurrence && <Pill>Repete</Pill>}
        {item.postponeCount > 0 && <Pill tone="neutral">adiado {item.postponeCount}×</Pill>}
        {item.money && item.money.amountCents > 0 && (
          <Pill tone={item.money.direction === "in" ? "ok" : "warn"}>{formatBRL(item.money.amountCents)}</Pill>
        )}
      </div>

      {/* ações rápidas */}
      {!done && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          <QuickAction
            active={isFocus}
            icon={<IconStar size={20} />}
            label={isFocus ? "No foco" : "Foco hoje"}
            onClick={() =>
              apply(
                (d) => setFocus(d, item.id, isFocus ? null : today),
                isFocus ? "Tirado do foco." : "Está no seu foco de hoje.",
              )
            }
          />
          <QuickAction
            icon={<IconClock size={20} />}
            label="Adiar"
            active={showSnooze}
            onClick={() => setShowSnooze((s) => !s)}
          />
          <QuickAction
            icon={<IconLeaf size={20} />}
            label="Algum dia"
            onClick={() => {
              someday(item.id);
              onClose();
            }}
          />
        </div>
      )}

      {showSnooze && !done && (
        <div className="mb-5 animate-fade rounded-[24px] bg-surface p-4 shadow-soft ring-1 ring-black/[0.03]">
          <p className="t-label mb-2 px-1">Quando?</p>
          <div className="flex flex-wrap gap-2">
            {snoozeOptions(today).map((o) => (
              <Button
                key={o.label}
                size="sm"
                onClick={() => {
                  postpone(item.id, o.date, o.toast);
                  onClose();
                }}
              >
                {o.label}
              </Button>
            ))}
            <input
              type="date"
              min={today}
              aria-label="Escolher dia"
              className="h-9 min-h-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-ink"
              onChange={(e) => {
                if (e.target.value) {
                  postpone(item.id, e.target.value, relativeDay(e.target.value, today));
                  onClose();
                }
              }}
            />
          </div>
          {item.postponeCount >= 2 && steps.length === 0 && (
            <p className="mt-3 px-1 text-[13px] text-ink-2">
              Já foi adiado {item.postponeCount} vezes. Talvez esteja grande demais —{" "}
              <button className="font-medium text-accent-text" onClick={() => setSuggested(suggestSteps(item.title))}>
                quebrar em passos?
              </button>
            </p>
          )}
        </div>
      )}

      {/* passos */}
      {item.kind !== "event" && !item.parentId && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <h3 className="t-label">Próximos passos</h3>
            {!suggested && (
              <button
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text"
                onClick={() => setSuggested(suggestSteps(item.title))}
              >
                <IconSparkle size={14} /> Sugerir
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-[24px] bg-surface shadow-soft ring-1 ring-black/[0.03] [&>*+*]:border-t [&>*+*]:border-line">
            {steps.map((s) => (
              <div key={s.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <CheckCircle checked={s.status === "done"} onToggle={() => toggleDone(s.id)} label="Concluir passo" />
                <span className={clsx("flex-1 text-[15px]", s.status === "done" && "text-muted line-through")}>
                  {s.title}
                </span>
              </div>
            ))}
            <form
              className="flex items-center gap-2 px-4 py-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (stepText.trim()) addStep([stepText]);
                setStepText("");
              }}
            >
              <span className="w-[22px] text-center text-faint">+</span>
              <input
                value={stepText}
                onChange={(e) => setStepText(e.target.value)}
                placeholder={steps.length ? "Outro passo" : "Um passo pequeno e concreto"}
                className="h-10 flex-1 bg-transparent text-[15px] placeholder:text-faint focus:outline-none"
              />
            </form>
          </div>
          {suggested && (
            <div className="mt-2 animate-fade rounded-2xl border border-dashed border-line p-3">
              <p className="mb-2 text-[13px] text-muted">Sugestão (local, sem IA):</p>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-[14px] text-ink-2">
                {suggested.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    addStep(suggested);
                    setSuggested(null);
                  }}
                >
                  Usar esses passos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggested(null)}>
                  Agora não
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* detalhes */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={item.kind === "event" ? "Dia" : "Fazer em"}>
            <input
              type="date"
              className={inputClass}
              value={item.scheduledDate ?? ""}
              onChange={(e) => update(item.id, { scheduledDate: e.target.value || null })}
            />
          </Field>
          {item.kind === "event" ? (
            <Field label="Horário">
              <input
                type="time"
                className={inputClass}
                value={item.startTime ?? ""}
                onChange={(e) => update(item.id, { startTime: e.target.value || null })}
              />
            </Field>
          ) : (
            <Field label={moneyKind ? "Vencimento" : "Prazo"}>
              <input
                type="date"
                className={inputClass}
                value={item.dueDate ?? ""}
                onChange={(e) => update(item.id, { dueDate: e.target.value || null })}
              />
            </Field>
          )}
        </div>

        {(moneyKind || item.money) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input
                inputMode="decimal"
                className={inputClass}
                value={amount}
                placeholder="0,00"
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => {
                  const cents = parseBRL(amount) ?? 0;
                  update(item.id, {
                    money: {
                      ...(item.money ?? { direction: item.kind === "income" ? "in" : "out", settled: false }),
                      amountCents: cents,
                    },
                  });
                }}
              />
            </Field>
            <Field label="Categoria">
              <input
                className={inputClass}
                defaultValue={item.money?.category ?? ""}
                placeholder="Casa, Cartão…"
                onBlur={(e) =>
                  item.money &&
                  update(item.id, { money: { ...item.money, category: e.target.value.trim() || undefined } })
                }
              />
            </Field>
          </div>
        )}

        <Field label="Área">
          <Segmented<Area>
            value={item.area}
            onChange={(area) => update(item.id, { area })}
            options={[
              { value: "personal", label: "Pessoal" },
              { value: "work", label: "Trabalho" },
              { value: "finance", label: "Financeiro" },
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select className={inputClass} value={item.kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Projeto">
            <select
              className={inputClass}
              value={item.projectId ?? ""}
              onChange={(e) => update(item.id, { projectId: e.target.value || null })}
            >
              <option value="">Nenhum</option>
              {data.projects
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
          <Field label="Importância">
            <select
              className={inputClass}
              value={item.priority}
              onChange={(e) => update(item.id, { priority: e.target.value as Item["priority"] })}
            >
              <option value="high">Importante</option>
              <option value="normal">Normal</option>
              <option value="low">Pode esperar</option>
            </select>
          </Field>
          <Field label="Repete">
            <select
              className={inputClass}
              value={item.recurrence?.freq ?? ""}
              onChange={(e) =>
                update(item.id, {
                  recurrence: e.target.value
                    ? { freq: e.target.value as RecurrenceFreq, seriesId: item.recurrence?.seriesId ?? newId("ser") }
                    : null,
                })
              }
            >
              <option value="">Não</option>
              <option value="daily">Todo dia</option>
              <option value="weekly">Toda semana</option>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
            </select>
          </Field>
        </div>

        <Field label="Notas">
          <textarea
            className={clsx(inputClass, "min-h-24")}
            value={notes}
            placeholder="Contexto, links, onde parei…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (item.notes ?? "") && update(item.id, { notes })}
          />
        </Field>

        {item.history.length > 1 && (
          <details className="px-1 text-[13px] text-muted">
            <summary className="cursor-pointer py-2">Histórico</summary>
            <ul className="mt-1 space-y-1">
              {[...item.history]
                .reverse()
                .slice(0, 10)
                .map((h, i) => (
                  <li key={i}>
                    {new Date(h.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} —{" "}
                    {HISTORY_LABEL[h.type]}
                    {h.to ? ` → ${h.to.split("-").reverse().slice(0, 2).join("/")}` : ""}
                  </li>
                ))}
            </ul>
          </details>
        )}

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              apply((d) => archiveItem(d, item.id), "Arquivado.");
              onClose();
            }}
          >
            Arquivar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              apply((d) => deleteItem(d, item.id), "Excluído.");
              onClose();
            }}
          >
            <IconTrash size={16} /> Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}

const HISTORY_LABEL: Record<Item["history"][number]["type"], string> = {
  created: "criado",
  postponed: "adiado",
  scheduled: "planejado",
  completed: "concluído",
  reopened: "reaberto",
  edited: "editado",
  settled: "pago/recebido",
  moved_to_someday: "foi para algum dia",
};

function QuickAction({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex h-[68px] flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-medium transition active:scale-[0.97]",
        active ? "bg-accent-soft text-accent-text" : "bg-surface text-ink-2 shadow-soft hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
