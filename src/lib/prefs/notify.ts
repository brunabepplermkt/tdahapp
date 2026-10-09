"use client";

/** Notificações do navegador/PWA. Sem permissão, quem chama cai num aviso dentro do app. */

export type NotifySupport = "unsupported" | "default" | "granted" | "denied";

export function notifySupport(): NotifySupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function askNotifyPermission(): Promise<NotifySupport> {
  if (notifySupport() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notifySupport();
  }
}

/** Mostra a notificação do sistema; devolve `false` se não foi possível (use o aviso interno). */
export async function showSystemNotification(title: string, body: string, href: string): Promise<boolean> {
  if (notifySupport() !== "granted") return false;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `leve:${href}:${title}`,
        data: { href },
      });
      return true;
    }
    const n = new Notification(title, { body, icon: "/icon-192.png" });
    n.onclick = () => {
      window.focus();
      window.location.href = href;
    };
    return true;
  } catch {
    return false;
  }
}
