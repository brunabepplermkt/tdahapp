"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/hooks/useApp";
import { dueReminders, markFired } from "@/lib/prefs/model";
import { showSystemNotification } from "@/lib/prefs/notify";
import { usePrefs } from "@/lib/prefs/store";
import { inboxCaptures } from "@/lib/domain/selectors";
import { useStore } from "@/lib/store/store";

/**
 * Dispara os lembretes configurados enquanto o app está aberto (ou volta ao
 * primeiro plano). Sem permissão de notificação, o aviso aparece dentro do app.
 * Não há servidor de push: com o app totalmente fechado nada é entregue.
 */
export function ReminderRunner() {
  const { data, today, ready } = useApp();
  const hydrate = usePrefs((s) => s.hydrate);
  const showToast = useStore((s) => s.showToast);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const { prefs, update } = usePrefs.getState();
      if (!prefs.reminders.enabled) return;
      const now = new Date();
      const events = data.items
        .filter(
          (i) => i.kind === "event" && i.status === "open" && i.startTime && (i.scheduledDate ?? i.dueDate) === today,
        )
        .map((i) => ({ id: i.id, title: i.title, startTime: i.startTime! }));
      const due = dueReminders(prefs, {
        now,
        today,
        inboxCount: inboxCaptures(data.captures, today).length,
        events,
      });
      if (!due.length) return;
      // marca antes de mostrar: nunca repete, mesmo se algo falhar
      update((p) =>
        markFired(
          p,
          today,
          due.map((d) => d.key),
        ),
      );
      for (const d of due) {
        void showSystemNotification(d.title, d.body, d.href).then((ok) => {
          if (!ok && document.visibilityState === "visible") showToast(`${d.title} — ${d.body}`);
        });
      }
    };
    check();
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ready, today, data.items, data.captures, showToast]);

  return null;
}
