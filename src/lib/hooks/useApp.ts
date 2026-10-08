"use client";

import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";

/** Dados + hoje, prontos só depois de hidratar no cliente. */
export function useApp() {
  const data = useStore((s) => s.data);
  const hydrated = useStore((s) => s.hydrated);
  const today = useUI((s) => s.today);
  return { data, today: today ?? "", ready: hydrated && !!today };
}
