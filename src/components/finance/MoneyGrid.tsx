"use client";

import clsx from "clsx";
import { formatBRL } from "@/lib/domain/money";
import type { MoneySummary } from "@/lib/domain/selectors";

export function MoneyGrid({ summary }: { summary: MoneySummary }) {
  const cells = [
    { label: "A pagar", value: summary.toPay, tone: summary.overdueToPay > 0 ? "text-danger" : "text-ink" },
    { label: "Pago", value: summary.paid, tone: "text-muted" },
    { label: "A receber", value: summary.toReceive, tone: "text-ink" },
    { label: "Recebido", value: summary.received, tone: "text-ok" },
  ];
  return (
    <div className="overflow-hidden rounded-[22px] bg-surface shadow-soft">
      <div className="grid grid-cols-2">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={clsx("px-4 py-3.5", i % 2 === 1 && "border-l border-line", i > 1 && "border-t border-line")}
          >
            <p className="text-[12px] text-muted">{c.label}</p>
            <p className={clsx("mt-0.5 text-[17px] font-medium tabular-nums", c.tone)}>{formatBRL(c.value)}</p>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-line px-4 py-3.5">
        <p className="text-[14px] text-ink-2">Saldo previsto</p>
        <p
          className={clsx("text-[20px] font-semibold tabular-nums", summary.forecast < 0 ? "text-danger" : "text-ink")}
        >
          {formatBRL(summary.forecast)}
        </p>
      </div>
      {summary.overdueToPay > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-danger">
          {formatBRL(summary.overdueToPay)} já venceu.
        </p>
      )}
    </div>
  );
}
