/**
 * Pipeline de interpretação: provider estruturado (opcional) → validação →
 * fallback no parser local. NUNCA falha: sem provider, com provider fora do ar,
 * lento ou devolvendo lixo, a captura continua funcionando.
 *
 * Nenhum provider real está configurado. `createStructuredInterpreter` existe
 * para o dia em que houver um (a chamada ao modelo fica atrás de
 * `StructuredProvider`, no servidor).
 */
import type { Interpretation } from "@/lib/domain/types";
import { interpretText } from "./heuristic/parse";
import { buildExtractionPrompt, validateStructured } from "./structured";
import type { CaptureInterpreter, InterpretContext } from "./types";

export interface StructuredProvider {
  readonly id: string;
  readonly label: string;
  /** devolve JSON cru no formato de `structuredInterpretationSchema` */
  extract(input: { text: string; prompt: string; ctx: InterpretContext; signal: AbortSignal }): Promise<unknown>;
}

export interface StructuredInterpreterOptions {
  timeoutMs?: number;
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error("tempo esgotado"));
    }, ms);
  });
  return Promise.race([run(ctrl.signal), timeout]).finally(() => clearTimeout(timer));
}

export function createStructuredInterpreter(
  provider: StructuredProvider,
  options: StructuredInterpreterOptions = {},
): CaptureInterpreter {
  const timeoutMs = options.timeoutMs ?? 8000;
  return {
    id: provider.id,
    label: provider.label,
    async interpret(text, ctx): Promise<Interpretation> {
      const fallback = (why: string): Interpretation => {
        const local = interpretText(text, ctx);
        return { ...local, notes: [`Usei o interpretador local (${why})`, ...local.notes] };
      };
      try {
        const raw = await withTimeout(
          (signal) => provider.extract({ text, prompt: buildExtractionPrompt(text, ctx), ctx, signal }),
          timeoutMs,
        );
        const result = validateStructured(raw, ctx, `llm:${provider.id}`);
        if (!result.ok) return fallback("resposta inválida");
        return result.interpretation;
      } catch (e) {
        return fallback((e as Error).message === "tempo esgotado" ? "provider lento" : "provider indisponível");
      }
    },
  };
}
