"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { todayISO } from "@/lib/domain/dates";
import { interpretNow } from "@/lib/intelligence";
import { useStore } from "@/lib/store/store";
import { useUI } from "@/lib/store/ui";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { DraftChips } from "./DraftView";

/**
 * Captura rápida: escrever sem decidir nada.
 * Padrão = guardar na Inbox. “Organizar agora” é opcional.
 * Fica aberta depois de salvar para despejar várias coisas seguidas.
 */
export function CaptureSheet() {
  const open = useUI((s) => s.captureOpen);
  const close = useUI((s) => s.closeCapture);
  return (
    <Sheet open={open} onClose={close} title="O que está na sua cabeça?">
      {open && <CaptureForm onDone={close} />}
    </Sheet>
  );
}

function CaptureForm({ onDone }: { onDone: () => void }) {
  const capture = useStore((s) => s.capture);
  const projects = useStore((s) => s.data.projects);
  const [text, setText] = useState("");
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const deferred = useDeferredValue(text);
  const today = useMemo(() => todayISO(), []);

  useEffect(() => {
    // iOS só abre o teclado se o foco vier logo após o toque
    ref.current?.focus();
  }, []);

  const preview = useMemo(
    () => (deferred.trim().length > 2 ? interpretNow(deferred, { today, projects }) : null),
    [deferred, today, projects],
  );

  const submit = async (acceptNow = false) => {
    if (!text.trim()) return;
    await capture(text, { acceptNow });
    setText("");
    setCount((c) => c + 1);
    ref.current?.focus();
  };

  return (
    <div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit(e.metaKey || e.ctrlKey);
          }
        }}
        rows={3}
        placeholder="pagar cartão, responder fulano, ideia para o Zeloa… do jeito que vier"
        className="w-full resize-none rounded-2xl bg-surface px-4 py-3.5 text-[17px] leading-relaxed text-ink shadow-soft placeholder:text-faint focus:outline-none"
        enterKeyHint="done"
        autoCapitalize="sentences"
      />

      <div className="min-h-[76px] px-1 pt-3">
        {preview ? (
          <div className="animate-fade space-y-2">
            <p className="text-[13px] text-muted">Vou entender assim — você pode mudar depois:</p>
            {preview.drafts.map((d, i) => (
              <div key={i} className="space-y-1.5">
                {preview.drafts.length > 1 && <p className="text-[14px] font-medium text-ink-2">{d.title}</p>}
                <DraftChips draft={d} today={today} projects={projects} />
              </div>
            ))}
          </div>
        ) : count > 0 ? (
          <p className="text-[14px] text-ok">
            {count === 1 ? "Guardado." : `${count} coisas guardadas.`} Pode continuar despejando.
          </p>
        ) : (
          <p className="text-[14px] text-muted">Não precisa escolher data, projeto ou categoria. Só tire da cabeça.</p>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse">
        <Button variant="primary" size="lg" block disabled={!text.trim()} onClick={() => submit(false)}>
          Guardar na Inbox
        </Button>
        <Button
          size="lg"
          block
          disabled={!text.trim() || !preview}
          onClick={() => submit(true)}
          title="Cria os itens direto, como mostrado acima"
        >
          Já organizar
        </Button>
      </div>
      {count > 0 && !text && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Pronto
          </Button>
        </div>
      )}
    </div>
  );
}
