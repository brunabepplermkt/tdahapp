import type { AppData, ISODate, Interpretation, Project } from "@/lib/domain/types";

export interface InterpretContext {
  today: ISODate;
  projects: Project[];
}

/**
 * Provider de interpretação de capturas.
 *
 * Hoje existe apenas o `heuristic` (local, determinístico, sem rede).
 * Um provider LLM futuro implementa a mesma interface — a UI não muda.
 */
export interface CaptureInterpreter {
  readonly id: string;
  readonly label: string;
  interpret(text: string, ctx: InterpretContext): Promise<Interpretation>;
}

export interface BreakdownSuggester {
  suggestSteps(title: string, data: AppData): string[];
}
