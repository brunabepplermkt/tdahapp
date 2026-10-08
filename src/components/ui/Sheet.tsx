"use client";

import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";

/**
 * Bottom sheet no celular, diálogo centralizado no desktop.
 * Fecha com Esc, toque fora ou botão.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 animate-fade bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={clsx(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-[28px] bg-bg shadow-soft sm:rounded-[28px]",
          size === "md" ? "sm:max-w-lg" : "sm:max-w-2xl",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-1">
          <div className="min-w-0 text-[17px] font-semibold text-ink">{title}</div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <IconX size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
        {footer && (
          <div className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">{footer}</div>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}
