"use client";

import { useState } from "react";
import { addDays } from "@/lib/domain/dates";
import {
  acceptCapture as acceptCaptureOp,
  archiveCapture,
  snoozeCapture,
  updateCapture,
} from "@/lib/domain/operations";
import { inboxCaptures } from "@/lib/domain/selectors";
import type { Capture, ItemDraft } from "@/lib/domain/types";
import { useApp } from "@/lib/hooks/useApp";
import { getInterpreter } from "@/lib/intelligence";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { DraftChips, DraftEditor } from "@/components/capture/DraftView";
import { Ready } from "@/components/shell/AppShell";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";

export default function InboxPage() {
  return (
    <Ready>
      <Inbox />
    </Ready>
  );
}

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function Inbox() {
  const { data, today } = useApp();
  const acceptCapture = useStore((s) => s.acceptCapture);
  const apply = useStore((s) => s.apply);
  const openCapture = useUI((s) => s.openCapture);
  const list = inboxCaptures(data.captures, today);
  const confident = list.filter((c) => (c.interpretation?.confidence ?? 0) >= 0.6);

  return (
    <>
      <PageHeader eyebrow="Tudo que você tirou da cabeça" title="Inbox" />

      {list.length === 0 ? (
        <EmptyState title="Inbox zerada. Cabeça leve.">
          <button className="font-medium text-accent" onClick={openCapture}>
            Capturar algo
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between gap-3">
            <p className="text-[14px] text-muted">
              {list.length === 1 ? "1 coisa" : `${list.length} coisas`}. Aceite, ajuste ou solte.
            </p>
            {confident.length > 1 && (
              <Button
                size="sm"
                onClick={() =>
                  apply((d) => {
                    let next = d;
                    for (const c of confident) next = acceptCaptureOp(next, c.id, c.interpretation?.drafts ?? []);
                    return next;
                  }, `${confident.length} capturas organizadas.`)
                }
              >
                Aceitar as {confident.length} claras
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {list.map((c) => (
              <CaptureCard
                key={c.id}
                capture={c}
                today={today}
                onAccept={(drafts) => acceptCapture(c.id, drafts)}
                onSnooze={() => apply((d) => snoozeCapture(d, c.id, addDays(today, 1)), "Volta amanhã.")}
                onArchive={() => apply((d) => archiveCapture(d, c.id), "Arquivado.")}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CaptureCard({
  capture,
  today,
  onAccept,
  onSnooze,
  onArchive,
}: {
  capture: Capture;
  today: string;
  onAccept: (drafts: ItemDraft[]) => void;
  onSnooze: () => void;
  onArchive: () => void;
}) {
  const projects = useStore((s) => s.data.projects);
  const apply = useStore((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<ItemDraft[]>(capture.interpretation?.drafts ?? []);
  const interp = capture.interpretation;
  const unsure = (interp?.confidence ?? 0) < 0.6;

  const reinterpret = async () => {
    const i = await getInterpreter().interpret(capture.text, { today, projects });
    apply((d) => updateCapture(d, capture.id, { interpretation: i }));
    setDrafts(i.drafts);
  };

  return (
    <article className="rounded-[22px] bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[16px] leading-snug text-ink">“{capture.text}”</p>
        <span className="shrink-0 text-[12px] text-faint">{timeAgo(capture.createdAt)}</span>
      </div>

      {!editing ? (
        <div className="mb-4 space-y-3 border-l-2 border-line pl-3">
          {drafts.map((d, i) => (
            <div key={i}>
              <p className="mb-1.5 text-[14px] font-medium text-ink-2">{d.title}</p>
              <DraftChips draft={d} today={today} projects={projects} />
            </div>
          ))}
          {drafts.length === 0 && (
            <button className="text-[14px] text-accent" onClick={reinterpret}>
              Interpretar
            </button>
          )}
          {interp && interp.notes.length > 0 && <p className="text-[12px] text-muted">{interp.notes.join(" · ")}</p>}
          {unsure && drafts.length > 0 && <p className="text-[12px] text-warn">Não tenho certeza — vale conferir.</p>}
        </div>
      ) : (
        <div className="mb-4 space-y-5">
          {drafts.map((d, i) => (
            <div key={i} className="rounded-2xl bg-bg p-3">
              {drafts.length > 1 && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-muted uppercase">Item {i + 1}</span>
                  <button
                    className="text-[13px] text-danger"
                    onClick={() => setDrafts((ds) => ds.filter((_, k) => k !== i))}
                  >
                    Remover
                  </button>
                </div>
              )}
              <DraftEditor
                draft={d}
                projects={projects}
                onChange={(nd) => setDrafts((ds) => ds.map((x, k) => (k === i ? nd : x)))}
              />
            </div>
          ))}
          <button
            className="text-[14px] font-medium text-accent"
            onClick={() =>
              setDrafts((ds) => [...ds, { title: "", kind: "task", area: "personal", priority: "normal" }])
            }
          >
            + Adicionar item
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={drafts.length === 0 || drafts.some((d) => !d.title.trim())}
          onClick={() => onAccept(drafts)}
        >
          {editing ? "Salvar e organizar" : "Aceitar"}
        </Button>
        {!editing ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              setDrafts(capture.interpretation?.drafts ?? []);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSnooze}>
          Amanhã
        </Button>
        <Button size="sm" variant="ghost" onClick={onArchive}>
          Arquivar
        </Button>
      </div>
    </article>
  );
}
