"use client";

import clsx from "clsx";
import { useRef, useState, type ReactNode } from "react";
import { IconCheck, IconClock } from "@/components/ui/icons";

const THRESHOLD = 84;

/**
 * Deslizar no toque: direita = concluir, esquerda = adiar.
 * Só reage a toque (mouse continua clicando normal) e só quando o gesto é
 * claramente horizontal — a rolagem vertical da lista não é afetada.
 */
export function Swipeable({
  children,
  enabled = true,
  rightLabel,
  leftLabel,
  onRight,
  onLeft,
}: {
  children: ReactNode;
  enabled?: boolean;
  rightLabel: string;
  leftLabel: string;
  onRight: () => void;
  onLeft: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const mode = useRef<"idle" | "horizontal" | "vertical">("idle");
  const swiped = useRef(false);

  if (!enabled) return <>{children}</>;

  const reset = () => {
    start.current = null;
    mode.current = "idle";
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden">
      {dx !== 0 && (
        <div
          aria-hidden
          className={clsx(
            "absolute inset-0 flex items-center px-5 text-[14px] font-medium",
            dx > 0 ? "justify-start bg-ok text-white" : "justify-end bg-surface-2 text-ink-2",
          )}
        >
          <span className={clsx("flex items-center gap-2 transition", Math.abs(dx) < THRESHOLD && "opacity-50")}>
            {dx > 0 ? <IconCheck size={18} /> : <IconClock size={18} />}
            {dx > 0 ? rightLabel : leftLabel}
          </span>
        </div>
      )}
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={clsx("relative bg-[var(--row-bg,var(--surface))]", dx === 0 && "transition-transform duration-200")}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          mode.current = "idle";
          swiped.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (mode.current === "idle") {
            if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
              mode.current = "horizontal";
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* alguns navegadores recusam captura; o gesto funciona igual */
              }
            } else if (Math.abs(my) > 10) mode.current = "vertical";
          }
          if (mode.current === "horizontal") {
            swiped.current = true;
            // resistência depois do limite
            const lim = THRESHOLD * 1.6;
            setDx(Math.max(-lim, Math.min(lim, mx)));
          }
        }}
        onPointerUp={() => {
          if (mode.current === "horizontal") {
            if (dx >= THRESHOLD) onRight();
            else if (dx <= -THRESHOLD) onLeft();
          }
          reset();
        }}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          // um gesto não deve também abrir o item
          if (swiped.current) {
            e.stopPropagation();
            e.preventDefault();
            swiped.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
