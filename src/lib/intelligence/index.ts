/**
 * Ponto único de acesso à camada de inteligência.
 *
 * Provider atual: heurístico local. Para plugar um LLM no futuro, implemente
 * `CaptureInterpreter` (ex.: chamando uma Route Handler do servidor que guarda
 * a chave da API em variável de ambiente) e registre aqui. A UI não muda.
 */
import { heuristicInterpreter, interpretText } from "./heuristic/parse";
import type { CaptureInterpreter } from "./types";

const providers: Record<string, CaptureInterpreter> = {
  heuristic: heuristicInterpreter,
};

export function getInterpreter(id = "heuristic"): CaptureInterpreter {
  return providers[id] ?? heuristicInterpreter;
}

export function listInterpreters(): CaptureInterpreter[] {
  return Object.values(providers);
}

/** Versão síncrona (o heurístico é síncrono) para preview enquanto digita. */
export const interpretNow = interpretText;

export { suggestSteps } from "./breakdown";
export { proposeMonthPlan, proposeWeekPlan, type PlanMove, type PlanProposal } from "./planner";
export { runAgentRules } from "./rules";
export { executeTool, runDecisionActions, toolManifest, TOOLS } from "./tools";
export type { CaptureInterpreter, InterpretContext } from "./types";
