"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { inboxCaptures, pendingDecisions } from "@/lib/domain/selectors";
import { useApp } from "@/lib/hooks/useApp";
import { useTodayTicker } from "@/lib/hooks/useToday";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { CaptureSheet } from "@/components/capture/CaptureSheet";
import { ItemSheet } from "@/components/items/ItemSheet";
import { SearchSheet } from "@/components/search/SearchSheet";
import {
  IconDecision,
  IconFolder,
  IconInbox,
  IconMonth,
  IconMore,
  IconPlus,
  IconSearch,
  IconToday,
  IconWallet,
  IconWeek,
} from "@/components/ui/icons";
import { Toast } from "@/components/ui/Toast";

const MOBILE_NAV = [
  { href: "/", label: "Hoje", icon: IconToday },
  { href: "/semana", label: "Semana", icon: IconWeek },
  { href: "/mes", label: "Mês", icon: IconMonth },
  { href: "/inbox", label: "Inbox", icon: IconInbox, badge: "inbox" as const },
  { href: "/mais", label: "Mais", icon: IconMore, badge: "decisions" as const },
];

const DESKTOP_NAV = [
  { href: "/", label: "Hoje", icon: IconToday },
  { href: "/semana", label: "Semana", icon: IconWeek },
  { href: "/mes", label: "Mês", icon: IconMonth },
  { href: "/inbox", label: "Inbox", icon: IconInbox, badge: "inbox" as const },
  {
    href: "/decisoes",
    label: "Decisões",
    icon: IconDecision,
    badge: "decisions" as const,
  },
  { href: "/projetos", label: "Projetos", icon: IconFolder },
  { href: "/financas", label: "Finanças", icon: IconWallet },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type Badges = { inbox: number; decisions: number };

/** usePathname precisa de Suspense em rotas dinâmicas; o fallback é a nav sem item ativo. */
function WithPath({ render }: { render: (pathname: string) => ReactNode }) {
  return (
    <Suspense fallback={render("")}>
      <PathReader render={render} />
    </Suspense>
  );
}

function PathReader({ render }: { render: (pathname: string) => ReactNode }) {
  return <>{render(usePathname())}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const runAgent = useStore((s) => s.runAgent);
  const openCapture = useUI((s) => s.openCapture);
  const openSearch = useUI((s) => s.openSearch);
  const { data, today, ready } = useApp();
  useTodayTicker();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // o “agente” local observa os dados e propõe decisões (nunca age sozinho)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => runAgent(today), 800);
    return () => clearTimeout(t);
  }, [ready, today, data.items, runAgent]);

  // atalho de teclado: “n” ou “c” abre a captura
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "c") {
        e.preventDefault();
        openCapture();
      } else if (e.key === "/") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCapture, openSearch]);

  const badges = {
    inbox: ready ? inboxCaptures(data.captures, today).length : 0,
    decisions: ready ? pendingDecisions(data.decisions, today, data.items).length : 0,
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* lateral — desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <Link href="/" className="mb-6 px-3 font-display text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Leve
        </Link>
        <button
          onClick={openCapture}
          className="mb-6 flex h-11 items-center gap-2 rounded-xl bg-surface px-3 text-left text-[14px] text-muted shadow-soft transition hover:text-ink"
        >
          <IconPlus size={18} />
          <span className="flex-1 truncate">O que está na cabeça?</span>
          <kbd className="rounded-md border border-line px-1.5 text-[11px] text-faint">N</kbd>
        </button>
        <button
          onClick={openSearch}
          className="-mt-4 mb-4 flex h-10 items-center gap-3 rounded-xl px-3 text-left text-[14px] text-ink-2 hover:bg-surface-2"
        >
          <IconSearch size={18} className="text-muted" />
          <span className="flex-1">Buscar</span>
          <kbd className="rounded-md border border-line px-1.5 text-[11px] text-faint">/</kbd>
        </button>
        <WithPath render={(pathname) => <DesktopNav pathname={pathname} badges={badges} />} />
        <div className="mt-auto">
          <WithPath
            render={(pathname) => (
              <Link
                href="/mais"
                className={clsx(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-ink-2 hover:bg-surface-2",
                  isActive(pathname, "/mais") && "bg-surface font-medium text-ink shadow-soft",
                )}
              >
                <IconMore size={18} className="text-muted" />
                Mais
              </Link>
            )}
          />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-2xl px-5 pt-[max(env(safe-area-inset-top),12px)] pb-[calc(env(safe-area-inset-bottom)+132px)] lg:px-10 lg:pb-16">
        {children}
      </main>

      {/* botão de captura — mobile */}
      <button
        onClick={openCapture}
        aria-label="Capturar algo"
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-soft transition active:scale-95 lg:hidden"
      >
        <IconPlus size={26} strokeWidth={2} />
      </button>

      {/* navegação inferior — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <WithPath render={(pathname) => <MobileNav pathname={pathname} badges={badges} />} />
      </nav>

      <CaptureSheet />
      <SearchSheet />
      <ItemSheet />
      <Toast />
    </div>
  );
}

function DesktopNav({ pathname, badges }: { pathname: string; badges: Badges }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {DESKTOP_NAV.map((n) => {
        const active = isActive(pathname, n.href);
        const count = n.badge ? badges[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={clsx(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition",
              active ? "bg-surface font-medium text-ink shadow-soft" : "text-ink-2 hover:bg-surface-2",
            )}
          >
            <n.icon size={18} className={active ? "text-accent" : "text-muted"} />
            <span className="flex-1">{n.label}</span>
            {count > 0 && <span className="text-[12px] text-muted tabular-nums">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNav({ pathname, badges }: { pathname: string; badges: Badges }) {
  return (
    <div className="mx-auto flex max-w-2xl">
      {MOBILE_NAV.map((n) => {
        const active = isActive(pathname, n.href);
        const count = n.badge ? badges[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={clsx(
              "relative flex h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition",
              active ? "text-ink" : "text-muted",
            )}
          >
            <span className="relative">
              <n.icon size={23} strokeWidth={active ? 2 : 1.6} className={active ? "text-accent" : undefined} />
              {count > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-[17px] rounded-full bg-ink px-1 text-center text-[10px] leading-[17px] text-bg tabular-nums">
                  {count}
                </span>
              )}
            </span>
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Mostra um esqueleto calmo até os dados locais carregarem. */
export function Ready({ children }: { children: ReactNode }) {
  const { ready } = useApp();
  if (!ready) {
    return (
      <div className="animate-pulse space-y-4 pt-16" aria-busy="true" aria-label="Carregando">
        <div className="h-8 w-48 rounded-lg bg-surface-2" />
        <div className="h-24 rounded-2xl bg-surface-2" />
        <div className="h-40 rounded-2xl bg-surface-2" />
      </div>
    );
  }
  return <>{children}</>;
}
