"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  explainDictationError,
  isDictationSupported,
  startDictation,
  type DictationError,
  type DictationSession,
} from "@/lib/voice/dictation";
import { IconMic } from "@/components/ui/icons";

/**
 * Botão de ditar + linha de estado. `onText` recebe cada trecho já reconhecido;
 * quem usa decide onde inserir (ver `appendDictation`). Nada de áudio é guardado.
 */
export function Dictation({ onText, className }: { onText: (chunk: string) => void; className?: string }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<DictationError | null>(null);
  const session = useRef<DictationSession | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  // fechar a tela encerra o microfone
  useEffect(() => () => session.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      session.current?.stop();
      return;
    }
    setError(null);
    if (!isDictationSupported()) {
      setError("unsupported");
      return;
    }
    setListening(true);
    session.current = startDictation({
      onFinal: (t) => t && onTextRef.current(t),
      onInterim: setInterim,
      onError: (e) => {
        setError(e);
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
        session.current = null;
      },
    });
    if (!session.current) setListening(false);
  };

  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Parar de ditar" : "Ditar"}
        className={clsx(
          "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition active:scale-95",
          listening ? "animate-pulse bg-accent text-accent-ink" : "bg-surface text-ink ring-1 ring-line-strong/70",
        )}
      >
        <IconMic size={24} />
      </button>
      <p
        className="min-w-0 flex-1 text-[14px] leading-snug text-muted"
        aria-live="polite"
        data-testid="dictation-status"
      >
        {error ? (
          <span className="text-danger">{explainDictationError(error)}</span>
        ) : listening ? (
          interim || "Estou ouvindo…"
        ) : (
          "Ditar em vez de digitar"
        )}
      </p>
    </div>
  );
}
