"use client";

import clsx from "clsx";
import Link from "next/link";
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Area } from "@/lib/domain/types";
import { IconChevronDown } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; block?: boolean }
>(function Button({ variant = "secondary", size = "md", block, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-4.5 text-[15px]",
        size === "lg" && "h-13 px-6 text-[16px]",
        variant === "primary" && "bg-accent text-accent-ink hover:opacity-90",
        variant === "secondary" && "bg-surface-2 text-ink hover:bg-line",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 active:scale-95",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 pt-4 lg:pt-10">
      {eyebrow && <p className="mb-1 text-[13px] font-medium text-muted">{eyebrow}</p>}
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-ink">{title}</h1>
        {children}
      </div>
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  hint,
}: {
  title?: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("mb-8", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
          {action}
        </div>
      )}
      {hint && <p className="mb-2 px-1 text-[13px] text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** Grupo “inset” estilo iOS: superfície com linhas separadoras finas. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl bg-surface shadow-soft [&>*+*]:border-t [&>*+*]:border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Collapsible({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-6">
      <button
        className="flex min-h-11 w-full items-center gap-2 px-1 text-left text-[14px] text-muted hover:text-ink"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <IconChevronDown size={16} className={clsx("transition", !open && "-rotate-90")} />
        <span className="font-medium">{title}</span>
        {count !== undefined && <span className="tabular-nums text-faint">{count}</span>}
      </button>
      {open && <div className="mt-1 animate-fade">{children}</div>}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-7 text-center">
      <p className="text-[15px] font-medium text-ink-2">{title}</p>
      {children && <div className="mt-1 text-[14px] text-muted">{children}</div>}
    </div>
  );
}

export function AreaDot({ area, className }: { area: Area; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        area === "work" && "bg-area-work",
        area === "personal" && "bg-area-personal",
        area === "finance" && "bg-area-finance",
        className,
      )}
    />
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "warn" | "ok" | "accent";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "accent" && "bg-accent-soft text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LinkRow({
  href,
  children,
  trailing,
  icon,
}: {
  href: string;
  children: ReactNode;
  trailing?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-13 items-center gap-3 px-4 py-3 transition hover:bg-surface-2 active:bg-surface-2"
    >
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1 text-[15px] text-ink">{children}</span>
      {trailing}
    </Link>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={clsx("flex rounded-full bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-9 flex-1 rounded-full px-3 text-[13px] font-medium transition",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";
