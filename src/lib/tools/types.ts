import type { z } from "zod";
import type { AppData, Decision, ISODate, ToolOrigin } from "@/lib/domain/types";
import type { Interpretation } from "@/lib/domain/types";

export type { ToolOrigin };
export type ToolMode = "read" | "write";
export type Sensitivity = "internal" | "external";
/**
 * Risco de uma escrita. Define o que um agente/automação pode fazer SOZINHO:
 *  - low    → reversível e cai em revisão (ex.: captura vai para a Inbox)
 *  - normal → muda dados do usuário → precisa de aprovação
 *  - high   → dinheiro → precisa de aprovação
 */
export type Risk = "low" | "normal" | "high";

/** Quem está chamando. Vem da sessão autenticada — NUNCA do corpo da requisição. */
export interface Principal {
  origin: ToolOrigin;
  /** se definido, restringe a estas ferramentas (concessão do agente) */
  scopes?: string[];
}

export interface ToolContext {
  today: ISODate;
}

export type ErrorCode =
  | "unknown_tool"
  | "disabled"
  | "invalid_input"
  | "forbidden"
  | "idempotency_key_required"
  | "idempotency_conflict"
  | "not_found"
  | "persist_failed"
  | "failed";

interface Base<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  sensitivity: Sensitivity;
  enabled: boolean;
}

export interface ReadTool<S extends z.ZodType = z.ZodType> extends Base<S> {
  mode: "read";
  run(data: AppData, input: z.infer<S>, ctx: ToolContext): unknown;
}

export interface WriteResult {
  data: AppData;
  /** o que o chamador precisa saber (ids criados etc.) */
  output?: Record<string, unknown>;
}

export interface WriteRunExtras {
  /** interpretação já calculada (ex.: provider assíncrono) — só o código do app define isso */
  interpretation?: Interpretation;
}

export interface WriteTool<S extends z.ZodType = z.ZodType> extends Base<S> {
  mode: "write";
  risk: Risk;
  /** risco depende da entrada (ex.: capturar para revisar é baixo; criar itens direto não) */
  riskFor?(input: z.infer<S>): Risk;
  /** resumo humano do que será feito (decisão, auditoria) */
  describe(data: AppData, input: z.infer<S>): string;
  run(data: AppData, input: z.infer<S>, ctx: ToolContext, extras: WriteRunExtras): WriteResult;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tool = ReadTool<any> | WriteTool<any>;

export type ExecResult =
  | { status: "ok"; data: AppData; output?: unknown; replayed?: boolean }
  | { status: "needs_confirmation"; data: AppData; decisionTitle: string; replayed?: boolean }
  | { status: "error"; data: AppData; code: ErrorCode; error: string; issues?: string[] };

export interface ExecOptions {
  origin: ToolOrigin;
  scopes?: string[];
  /** a pessoa aprovou explicitamente (ex.: via Fila de Decisões) */
  confirmed?: boolean;
  ctx?: ToolContext;
  idempotencyKey?: string;
  /** para quando a ação vira decisão */
  decision?: Partial<Pick<Decision, "kind" | "title" | "context" | "itemId" | "projectId" | "dedupeKey">>;
  /** executada ao aprovar uma decisão */
  via?: { decisionId: string; proposedBy?: ToolOrigin };
  interpretation?: Interpretation;
  /** não registrar na trilha (ex.: lote já resumido pelo chamador) */
  silent?: boolean;
}
