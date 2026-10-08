"use client";

import { useEffect } from "react";
import { todayISO } from "@/lib/domain/dates";
import { useUI } from "@/lib/store/ui";

/**
 * Mantém `today` (no store de UI) atualizado. Calculado só no cliente
 * (evita divergência com o HTML pré-renderizado) e atualizado quando vira o
 * dia com o app aberto. Usado uma única vez, no AppShell.
 */
export function useTodayTicker() {
  const setToday = useUI((s) => s.setToday);
  useEffect(() => {
    const tick = () => setToday(todayISO());
    tick();
    const id = setInterval(tick, 60_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setToday]);
}
