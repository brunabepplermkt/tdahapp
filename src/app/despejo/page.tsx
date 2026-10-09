"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { addCapture, acceptCapture, draftToItemInput, addItem, moveToSomeday } from "@/lib/domain/operations";
import { BUCKET_LABEL, BUCKET_ORDER, sortDump, type DumpBucket, type DumpEntry } from "@/lib/intelligence/braindump";
import type { ItemDraft } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { useStore } from "@/lib/store/store";
import { Ready } from "@/components/shell/AppShell";
import { IconX } from "@/components/ui/icons";
import { Button, EmptyState, PageHeader, Section } from "@/components/ui/primitives";

export default function DumpPage() {
  return (
    <Ready>
      <Dump />
    </Ready>
  );
}

function Dump() {
  const { data, today } = useApp();
  const apply = useStore((s) => s.apply);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<DumpEntry[] | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const projects = data.projects;

  const sort = () => {
    if (!text.trim()) return;
    setEntries(sortDump(text, { today, projects }));
  };

  const move = (id: string, bucket: DumpBucket) =>
    setEntries((es) => es && es.map((e) => (e.id === id ? { ...e, bucket } : e)));
  const drop = (id: string) => setEntries((es) => es && es.filter((e) => e.id !== id));

  const grouped = useMemo(
    () =>
      BUCKET_ORDER.map((b) => [b, (entries ?? []).filter((e) => e.bucket === b)] as const).filter(([, l]) => l.length),
    [entries],
  );

  const save = () => {
    if (!entries?.length) return;
    const keep = entries;
    apply(
      (d) => {
        // tudo vira UMA captura já processada (fica o registro do que foi despejado)
        const cap = addCapture(d, { text, interpretation: null });
        let next = acceptCapture(cap.data, cap.capture.id, keep.filter((e) => e.bucket !== "worry").map(draftFor));
        // preocupações não são tarefas: guardadas fora do radar, sem cobrança
        for (const w of keep.filter((e) => e.bucket === "worry")) {
          const res = addItem(next, {
            ...draftToItemInput(w.draft, cap.capture.id),
            kind: "idea",
            notes: "Preocupação",
            priority: "low",
          });
          next = moveToSomeday(res.data, res.item.id);
        }
        return next;
      },
      `${keep.length} ${keep.length === 1 ? "coisa tirada" : "coisas tiradas"} da cabeça.`,
    );
    setText("");
    setEntries(null);
  };

  return (
    <>
      <PageHeader eyebrow="Cabeça cheia?" title="Despejo" />

      {!entries ? (
        <>
          <textarea
            ref={ref}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder={"Uma coisa por linha, sem ordem.\nTarefas, ideias, medos, contas…"}
            className="min-h-64 w-full resize-none rounded-[28px] bg-surface px-6 py-5 font-display text-[22px] leading-[1.35] font-light tracking-[-0.02em] text-ink shadow-soft ring-1 ring-black/[0.04] placeholder:text-faint focus:ring-2 focus:ring-accent/30 focus:outline-none focus-ring-own"
          />
          <div className="mt-4">
            <Button variant="primary" size="lg" block disabled={!text.trim()} onClick={sort}>
              Separar pra mim
            </Button>
          </div>
        </>
      ) : entries.length === 0 ? (
        <EmptyState title="Não achei nada para separar.">
          <button className="font-medium text-accent-text" onClick={() => setEntries(null)}>
            Voltar
          </button>
        </EmptyState>
      ) : (
        <>
          {grouped.map(([bucket, list]) => (
            <Section key={bucket} title={BUCKET_LABEL[bucket]}>
              <div className="overflow-hidden rounded-[24px] bg-surface shadow-soft ring-1 ring-black/[0.03] [&>*+*]:border-t [&>*+*]:border-line">
                {list.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 py-2 pr-2 pl-5">
                    <span className="min-w-0 flex-1 text-[16px] text-ink">{e.text}</span>
                    <select
                      aria-label={`Mudar o tipo de “${e.text}”`}
                      value={e.bucket}
                      onChange={(ev) => move(e.id, ev.target.value as DumpBucket)}
                      className="h-9 min-h-0 rounded-full bg-surface-2 px-3 text-[13px] text-ink-2"
                    >
                      {BUCKET_ORDER.map((b) => (
                        <option key={b} value={b}>
                          {BUCKET_LABEL[b]}
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label="Tirar da lista"
                      onClick={() => drop(e.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                    >
                      <IconX size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          ))}
          <p className="mb-5 px-1 text-[14px] text-muted">
            Preocupações ficam guardadas em “Algum dia”, fora do radar.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
            <Button variant="primary" size="lg" block onClick={save}>
              Guardar tudo
            </Button>
            <Button size="lg" block onClick={() => setEntries(null)}>
              Voltar e editar
            </Button>
          </div>
        </>
      )}

      <p className="mt-8 text-center">
        <Link href="/" className="text-[14px] text-muted hover:text-ink">
          Voltar pro Hoje
        </Link>
      </p>
    </>
  );
}

/** O tipo escolhido na lista manda no tipo do item (sem criar conta sem valor, nem tarefa com valor). */
function draftFor(e: DumpEntry): ItemDraft {
  const d = e.draft;
  const isMoney = d.kind === "bill" || d.kind === "expense" || d.kind === "income";
  switch (e.bucket) {
    case "event":
      return { ...d, kind: "event", money: null };
    case "idea":
      return { ...d, kind: "idea", money: null };
    case "buy":
      return { ...d, kind: "shopping", money: null };
    case "money":
      return isMoney && d.money ? d : { ...d, kind: "task", money: null };
    default:
      return {
        ...d,
        kind: isMoney || d.kind === "event" || d.kind === "idea" || d.kind === "shopping" ? "task" : d.kind,
        money: null,
      };
  }
}
