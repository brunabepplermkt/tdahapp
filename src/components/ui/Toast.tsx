"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store/store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  const undo = useStore((s) => s.undo);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.undo ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 flex justify-center px-4 lg:bottom-8"
    >
      <div className="pointer-events-auto flex animate-sheet items-center gap-4 rounded-full bg-ink py-2 pr-2 pl-5 text-[14px] text-bg shadow-soft">
        <span>{toast.message}</span>
        {toast.undo ? (
          <button onClick={undo} className="h-9 rounded-full px-3.5 font-semibold text-bg/90 hover:bg-white/10">
            Desfazer
          </button>
        ) : (
          <span className="w-2" />
        )}
      </div>
    </div>
  );
}
