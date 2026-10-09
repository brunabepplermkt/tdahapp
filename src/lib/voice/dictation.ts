"use client";

/**
 * Ditado por voz com a Web Speech API (pt-BR). O áudio é processado pelo
 * reconhecimento de voz do próprio navegador/sistema — o Leve não grava nem
 * guarda áudio. Se o aparelho não suportar, `isDictationSupported()` é falso e a
 * tela sugere o microfone do teclado do iPhone, que funciona em qualquer campo.
 */

interface SpeechAlt {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlt;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationSupported(): boolean {
  return ctor() !== null;
}

export type DictationError = "denied" | "no-speech" | "no-mic" | "network" | "unsupported" | "other";

export function explainDictationError(e: DictationError): string {
  switch (e) {
    case "denied":
      return "Sem permissão do microfone. Libere em Ajustes do iPhone → Safari → Microfone, ou use o microfone do teclado.";
    case "no-speech":
      return "Não ouvi nada. Tente de novo, mais perto do microfone.";
    case "no-mic":
      return "Não achei um microfone neste aparelho.";
    case "network":
      return "O reconhecimento de voz precisa de internet. Use o microfone do teclado.";
    case "unsupported":
      return "Este navegador não dita. Use o microfone do teclado do iPhone.";
    default:
      return "O ditado falhou. Use o microfone do teclado do iPhone.";
  }
}

function mapError(code: string): DictationError {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "no-speech") return "no-speech";
  if (code === "audio-capture") return "no-mic";
  if (code === "network") return "network";
  return "other";
}

export interface DictationHandlers {
  /** trecho já reconhecido de forma definitiva */
  onFinal(text: string): void;
  /** palavras ainda em reconhecimento (para mostrar ao vivo) */
  onInterim(text: string): void;
  onError(error: DictationError): void;
  onEnd(): void;
}

export interface DictationSession {
  stop(): void;
}

export function startDictation(h: DictationHandlers): DictationSession | null {
  const Ctor = ctor();
  if (!Ctor) {
    h.onError("unsupported");
    return null;
  }
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) h.onFinal(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    h.onInterim(interim.trim());
  };
  rec.onerror = (e) => h.onError(mapError(e.error));
  rec.onend = () => {
    h.onInterim("");
    h.onEnd();
  };
  try {
    rec.start();
  } catch {
    h.onError("other");
    return null;
  }
  return { stop: () => rec.stop() };
}
