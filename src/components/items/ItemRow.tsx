"use client";

import clsx from "clsx";
import { diffDays, relativeDay } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { isProjected } from "@/lib/domain/selectors";
import type { ISODate, Item } from "@/lib/domain/types";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { IconCheck, IconRepeat } from "@/components/ui/icons";
import { AreaDot } from "@/components/ui/primitives";

export function CheckCircle({
  checked,
  onToggle,
  label,
  size = "md",
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="-m-2 inline-flex shrink-0 items-center justify-center p-2"
    >
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded-full border-[1.5px] transition",
          size === "md" ? "h-[22px] w-[22px]" : "h-7 w-7",
          checked ? "animate-pop border-ok bg-ok text-white" : "border-faint hover:border-ink-2",
        )}
      >
        {checked && <IconCheck size={size === "md" ? 14 : 18} strokeWidth={2.5} />}
      </span>
    </button>
  );
}

export interface ItemMetaOptions {
  today: ISODate;
  showDate?: boolean;
  showProject?: boolean;
}

/** Linha de metadados curta: “vence amanhã · Zeloa · R$ 90”. */
export function useItemMeta(item: Item, { today, showDate = true, showProject = true }: ItemMetaOptions) {
  const projects = useStore((s) => s.data.projects);
  const items = useStore((s) => s.data.items);
  const parts: { text: string; tone?: "danger" | "warn" | "ok" }[] = [];

  if (item.kind === "event" && item.startTime) {
    parts.push({ text: item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime });
  }
  if (showDate && item.status === "open") {
    if (item.dueDate && item.kind !== "event") {
      const d = diffDays(item.dueDate, today);
      const incoming = item.money?.direction === "in";
      const when = relativeDay(item.dueDate, today);
      if (d < 0) {
        const ago = d === -1 ? "ontem" : `há ${-d} dias`;
        parts.push({ text: incoming ? `atrasado (${ago})` : `venceu ${ago}`, tone: incoming ? "warn" : "danger" });
      } else if (incoming) parts.push({ text: `previsto ${when}` });
      else if (d <= 1) parts.push({ text: `vence ${when}`, tone: "warn" });
      else parts.push({ text: item.money ? `vence ${when}` : `prazo ${when}` });
    } else if (item.scheduledDate && item.scheduledDate !== today) {
      parts.push({ text: relativeDay(item.scheduledDate, today) });
    }
  }
  if (showProject && item.projectId) {
    const p = projects.find((x) => x.id === item.projectId);
    if (p) parts.push({ text: p.name });
  }
  const steps = items.filter((c) => c.parentId === item.id);
  if (steps.length) {
    parts.push({ text: `${steps.filter((s) => s.status === "done").length}/${steps.length} passos` });
  }
  if (item.people?.length && item.kind !== "event") parts.push({ text: item.people.join(", ") });
  return parts;
}

export function ItemRow({
  item,
  today,
  parent,
  showDate = true,
  showProject = true,
  emphasis = false,
}: {
  item: Item;
  today: ISODate;
  parent?: Item;
  showDate?: boolean;
  showProject?: boolean;
  emphasis?: boolean;
}) {
  const toggleDone = useStore((s) => s.toggleDone);
  const openItem = useUI((s) => s.openItem);
  const meta = useItemMeta(item, { today, showDate, showProject });
  const projected = isProjected(item);
  const done = item.status === "done";
  const money = item.money;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !projected && openItem(parent ? parent.id : item.id)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !projected) {
          e.preventDefault();
          openItem(parent ? parent.id : item.id);
        }
      }}
      className={clsx(
        "flex min-h-14 cursor-pointer items-start gap-3.5 px-4 py-3.5 text-left transition hover:bg-surface-2/60 active:bg-surface-2",
        projected && "cursor-default opacity-60",
      )}
    >
      {item.kind === "event" ? (
        <span className="mt-0.5 w-[22px] shrink-0 text-center text-[11px] leading-[22px] font-semibold text-muted tabular-nums">
          {item.startTime ? item.startTime.slice(0, 2) : "•"}
        </span>
      ) : projected ? (
        <span className="mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center text-faint">
          <IconRepeat size={16} />
        </span>
      ) : (
        <span className="mt-0.5">
          <CheckCircle
            checked={done}
            onToggle={() => toggleDone(item.id)}
            label={money ? (money.direction === "in" ? "Marcar como recebido" : "Marcar como pago") : "Concluir"}
          />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {parent && <p className="mb-0.5 truncate text-[12px] text-muted">Próximo passo de {parent.title}</p>}
        <p
          className={clsx(
            "text-ink",
            emphasis ? "text-[18px] leading-snug font-semibold tracking-[-0.01em]" : "text-[15px] leading-snug",
            done && "text-muted line-through decoration-faint",
          )}
        >
          {item.title}
        </p>
        {meta.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
            <AreaDot area={item.area} className="mr-0.5" />
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-faint">·</span>}
                <span className={clsx(m.tone === "danger" && "text-danger", m.tone === "warn" && "text-warn")}>
                  {m.text}
                </span>
              </span>
            ))}
          </p>
        )}
      </div>

      {money && money.amountCents > 0 && (
        <span
          className={clsx(
            "mt-0.5 shrink-0 text-[15px] font-medium tabular-nums",
            done ? "text-muted" : money.direction === "in" ? "text-ok" : "text-ink",
          )}
        >
          {money.direction === "in" ? "+" : ""}
          {formatBRL(money.amountCents)}
        </span>
      )}
    </div>
  );
}
