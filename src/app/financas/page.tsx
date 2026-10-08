"use client";

import { useMemo, useState } from "react";
import { addMonths, monthLabel } from "@/lib/domain/dates";
import { newId } from "@/lib/domain/id";
import { formatBRL, parseBRL } from "@/lib/domain/money";
import { placementDate, selectMonth } from "@/lib/domain/selectors";
import type { Item, RecurrenceFreq } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { MoneyGrid } from "@/components/finance/MoneyGrid";
import { ItemRow } from "@/components/items/ItemRow";
import { Ready } from "@/components/shell/AppShell";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/components/ui/icons";
import {
  Button,
  Collapsible,
  Field,
  Group,
  IconButton,
  inputClass,
  PageHeader,
  Section,
  Segmented,
} from "@/components/ui/primitives";

export default function FinancePage() {
  return (
    <Ready>
      <Finance />
    </Ready>
  );
}

function Finance() {
  const { data, today } = useApp();
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const anchor = offset === 0 ? today : addMonths(today.slice(0, 8) + "01", offset);
  const view = useMemo(() => selectMonth(data, anchor, today), [data, anchor, today]);

  const entries = view.moneyEntries;
  const overdue = entries.filter(
    (i) => i.status === "open" && i.money?.direction === "out" && i.dueDate && i.dueDate < today,
  );
  const toPay = entries.filter((i) => i.status === "open" && i.money?.direction === "out" && !overdue.includes(i));
  const toReceive = entries.filter((i) => i.status === "open" && i.money?.direction === "in");
  const settled = entries.filter((i) => i.status === "done");

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of entries) {
      if (i.money?.direction !== "out") continue;
      const k = i.money.category ?? "Sem categoria";
      m.set(k, (m.get(k) ?? 0) + i.money.amountCents);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const maxCat = byCategory[0]?.[1] ?? 1;

  return (
    <>
      <PageHeader eyebrow={`Financeiro · ${monthLabel(anchor).split(" ").pop()}`} title={monthLabel(anchor).split(" ")[0]}>
        <div className="flex">
          <IconButton label="Mês anterior" onClick={() => setOffset((o) => o - 1)}>
            <IconChevronLeft />
          </IconButton>
          <IconButton label="Próximo mês" onClick={() => setOffset((o) => o + 1)}>
            <IconChevronRight />
          </IconButton>
        </div>
      </PageHeader>

      <Section>
        <MoneyGrid summary={view.money} />
      </Section>

      <div className="mb-8">
        {adding ? (
          <AddEntry onDone={() => setAdding(false)} defaultDate={offset === 0 ? today : anchor.slice(0, 8) + "10"} />
        ) : (
          <Button onClick={() => setAdding(true)}>
            <IconPlus size={18} /> Adicionar conta ou recebimento
          </Button>
        )}
      </div>

      {overdue.length > 0 && <List title="Venceram" items={overdue} today={today} />}
      {toPay.length > 0 && <List title="A pagar" items={toPay} today={today} />}
      {toReceive.length > 0 && <List title="A receber" items={toReceive} today={today} />}

      {byCategory.length > 0 && (
        <Section title="Saídas por categoria">
          <div className="space-y-2.5 rounded-[28px] bg-surface p-5 shadow-soft ring-1 ring-black/[0.03]">
            {byCategory.map(([cat, v]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-ink-2">{cat}</span>
                  <span className="text-muted tabular-nums">{formatBRL(v)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-1.5 rounded-full bg-area-finance"
                    style={{ width: `${Math.max((v / maxCat) * 100, 3)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {settled.length > 0 && (
        <Collapsible title="Pagos e recebidos" count={settled.length}>
          <Group flat>
            {settled.map((i) => (
              <ItemRow key={i.id} item={i} today={today} />
            ))}
          </Group>
        </Collapsible>
      )}
    </>
  );
}

function List({ title, items, today }: { title: string; items: Item[]; today: string }) {
  const sorted = [...items].sort((a, b) => (placementDate(a) ?? "").localeCompare(placementDate(b) ?? ""));
  return (
    <Section title={title}>
      <Group flat>
        {sorted.map((i) => (
          <ItemRow key={i.id} item={i} today={today} />
        ))}
      </Group>
    </Section>
  );
}

type EntryType = "bill" | "expense" | "income";

function AddEntry({ onDone, defaultDate }: { onDone: () => void; defaultDate: string }) {
  const addItem = useStore((s) => s.addItem);
  const [type, setType] = useState<EntryType>("bill");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "">("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const cents = parseBRL(amount);

  return (
    <form
      className="animate-fade space-y-3.5 rounded-[28px] bg-surface p-5 shadow-soft ring-1 ring-black/[0.03]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !cents) return;
        const isExpense = type === "expense";
        addItem({
          title: title.trim(),
          status: isExpense ? "done" : "open",
          completedAt: isExpense ? new Date().toISOString() : null,
          kind: type,
          area: "finance",
          dueDate: date || null,
          notes: notes.trim() || undefined,
          money: {
            amountCents: cents,
            direction: type === "income" ? "in" : "out",
            category: category.trim() || undefined,
            settled: isExpense,
            settledAt: isExpense ? new Date().toISOString() : undefined,
          },
          recurrence: recurrence ? { freq: recurrence, seriesId: newId("ser") } : null,
        });
        onDone();
      }}
    >
      <Segmented<EntryType>
        value={type}
        onChange={setType}
        options={[
          { value: "bill", label: "Conta a pagar" },
          { value: "expense", label: "Despesa" },
          { value: "income", label: "Recebimento" },
        ]}
      />
      <Field label="Descrição">
        <input
          autoFocus
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "income" ? "Pagamento do cliente X" : type === "expense" ? "Mercado" : "Conta de luz"}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)">
          <input
            inputMode="decimal"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label={type === "expense" ? "Data" : type === "income" ? "Previsto para" : "Vencimento"}>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repete">
          <select
            className={inputClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as RecurrenceFreq | "")}
          >
            <option value="">Não</option>
            <option value="monthly">Todo mês</option>
            <option value="weekly">Toda semana</option>
            <option value="yearly">Todo ano</option>
          </select>
        </Field>
        <Field label="Categoria">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Casa, Cartão…"
          />
        </Field>
      </div>
      <Field label="Observação">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="button" block onClick={onDone}>
          Cancelar
        </Button>
        <Button variant="primary" block disabled={!title.trim() || !cents}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
