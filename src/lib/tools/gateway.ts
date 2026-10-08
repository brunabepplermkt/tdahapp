/**
 * Gateway de ferramentas — a fronteira para agentes (ex.: Hermes, no futuro).
 *
 *   agente → gateway.call(nome, entrada, { idempotencyKey })
 *            → carrega o estado (fonte única) → executeTool → salva → resposta JSON
 *
 * Garantias:
 *  - o `Principal` (origem + escopos) é definido por quem monta o gateway, a
 *    partir da sessão autenticada — o agente não escolhe a própria origem;
 *  - chamadas são serializadas (sem "lost update" entre duas mensagens seguidas);
 *  - a resposta só diz "ok" depois de persistir; se salvar falhar, nada foi
 *    aplicado do ponto de vista do agente e ele pode repetir a MESMA chave;
 *  - nenhuma credencial de serviço: o `store` usa a sessão/RLS do próprio usuário.
 *
 * Não há endpoint HTTP, WhatsApp ou Hermes ligado neste bloco.
 */
import { todayISO } from "@/lib/domain/dates";
import type { AppData, ISODate } from "@/lib/domain/types";
import { getInterpreter } from "@/lib/intelligence";
import type { CaptureInterpreter } from "@/lib/intelligence/types";
import { executeTool } from "./executor";
import type { Principal } from "./types";

export interface GatewayStore {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

export type GatewayResponse =
  | { status: "ok"; output: unknown; replayed?: boolean }
  | { status: "needs_confirmation"; message: string; replayed?: boolean }
  | { status: "error"; code: string; error: string; issues?: string[] };

export interface GatewayOptions {
  principal: Principal;
  store: GatewayStore;
  today?: () => ISODate;
  /** interpretador assíncrono para capture_item (padrão: o registrado no app) */
  interpreter?: CaptureInterpreter;
}

const jsonSafe = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function createToolGateway(opts: GatewayOptions) {
  let queue: Promise<unknown> = Promise.resolve();

  async function run(name: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<GatewayResponse> {
    const today = (opts.today ?? todayISO)();
    let data: AppData;
    try {
      data = await opts.store.load();
    } catch (e) {
      return { status: "error", code: "persist_failed", error: `Não consegui carregar os dados: ${(e as Error).message}` };
    }

    let interpretation;
    if (name === "capture_item" && typeof input.text === "string" && input.structured === undefined) {
      const interpreter = opts.interpreter ?? getInterpreter();
      interpretation = await interpreter
        .interpret(input.text.trim(), { today, projects: data.projects })
        .catch(() => undefined);
    }

    const r = executeTool(data, { tool: name, input }, {
      origin: opts.principal.origin,
      scopes: opts.principal.scopes,
      ctx: { today },
      idempotencyKey,
      interpretation,
    });

    // mesmo recusas e propostas são auditadas: precisam ser salvas
    if (r.data !== data) {
      try {
        await opts.store.save(r.data);
      } catch (e) {
        return {
          status: "error",
          code: "persist_failed",
          error: `Não consegui salvar (${(e as Error).message}). Nada foi aplicado; repita com a mesma chave.`,
        };
      }
    }
    if (r.status === "ok") return { status: "ok", output: jsonSafe(r.output ?? null), replayed: r.replayed };
    if (r.status === "needs_confirmation") {
      return { status: "needs_confirmation", message: `Aguardando aprovação no app: ${r.decisionTitle}`, replayed: r.replayed };
    }
    return { status: "error", code: r.code, error: r.error, issues: r.issues };
  }

  return {
    principal: opts.principal,
    call(name: string, input: Record<string, unknown> = {}, o: { idempotencyKey?: string } = {}) {
      const result = queue.then(() => run(name, input, o.idempotencyKey));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
