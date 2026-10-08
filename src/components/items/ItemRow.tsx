"use client";

import clsx from "clsx";
import { addDays, diffDays, relativeDay } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { isProjected } from "@/lib/domain/selectors";
import type { ISODate, Item } from "@/lib/domain/types";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { IconCheck, IconRepeat } from "@/components/ui/icons";
import { AreaDot } from "@/components/ui/primitives";
import { Swipeable } from "./Swipeable";

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
          size === "md" ? "h-6 w-6" : "h-9 w-9",
          checked ? "animate-pop border-ok bg-ok text-white" : "border-faint hover:border-accent",
        )}
      >
        {checked && <IconCheck size={size === "md" ? 15 : 22} strokeWidth={2.5} />}
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
  const postpone = useStore((s) => s.postpone);
  const openItem = useUI((s) => s.openItem);
  const meta = useItemMeta(item, { today, showDate, showProject });
  const projected = isProjected(item);
  const done = item.status === "done";
  const money = item.money;

  const canSwipe = !projected && !done && item.kind !== "event";

  return (
    <Swipeable
      enabled={canSwipe}
      rightLabel={money ? (money.direction === "in" ? "Recebido" : "Pago") : "Feito"}
      leftLabel="Amanhã"
      onRight={() => toggleDone(item.id)}
      onLeft={() => postpone(item.id, addDays(today, 1), "amanhã")}
    >
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
          "flex cursor-pointer items-start gap-4 px-[var(--row-px,1.25rem)] text-left transition hover:bg-surface-2/50 active:bg-surface-2/80",
          emphasis ? "min-h-20 py-6" : "min-h-16 py-4",
          projected && "cursor-default opacity-60",
        )}
      >
        {item.kind === "event" ? (
          <span className="mt-0.5 w-6 shrink-0 text-center text-[12px] leading-6 font-medium text-muted tabular-nums">
            {item.startTime ? item.startTime.slice(0, 2) : "•"}
          </span>
        ) : projected ? (
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-faint">
            <IconRepeat size={16} />
          </span>
        ) : (
          <span className={emphasis ? "mt-1.5" : "mt-0.5"}>
            <CheckCircle
              size={emphasis ? "lg" : "md"}
              checked={done}
              onToggle={() => toggleDone(item.id)}
              label={money ? (money.direction === "in" ? "Marcar como recebido" : "Marcar como pago") : "Concluir"}
            />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {parent && <p className="mb-1 truncate text-[13px] text-muted">Próximo passo de {parent.title}</p>}
          <p
            className={clsx(
              "text-ink",
              emphasis ? "font-display text-[28px] leading-[1.15] font-normal tracking-[-0.025em]" : "text-[16px] leading-snug",
              done && "text-muted line-through decoration-faint",
            )}
          >
            {item.title}
          </p>
          {meta.length > 0 && (
            <p className={clsx("flex flex-wrap items-center gap-x-1.5 text-muted", emphasis ? "mt-2.5 text-[15px]" : "mt-1 text-[13.5px]")}>
              {!emphasis && <AreaDot area={item.area} className="mr-0.5" />}
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
              "mt-0.5 shrink-0 font-display text-[17px] tabular-nums",
              done ? "text-muted" : money.direction === "in" ? "text-ok" : "text-ink",
            )}
          >
            {money.direction === "in" ? "+" : ""}
            {formatBRL(money.amountCents)}
          </span>
        )}
      </div>
    </Swipeable>
  );
}
