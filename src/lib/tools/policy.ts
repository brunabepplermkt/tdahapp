/**
 * Autorização: o que cada ORIGEM pode fazer.
 *
 *  user_app   a pessoa, dentro do app → tudo que está habilitado
 *  automation regras locais / rotinas → lê; escreve só risco baixo; o resto vira Decisão
 *  agent      agente externo (ex.: Hermes) → igual a automation + exige chave de idempotência
 *  import     importações → só cria (captura/item/lançamento); exige chave de idempotência
 *
 * "confirm" = não executa: vira uma Decisão e só roda depois do “Aprovar”.
 * Escopos (`Principal.scopes`) restringem ainda mais — nunca ampliam.
 */
import type { ToolOrigin } from "@/lib/domain/types";
import type { Tool } from "./types";

export type Effect = "allow" | "confirm" | "deny";
export interface Verdict {
  effect: Effect;
  reason?: string;
}

const IMPORT_ALLOWED = new Set(["capture_item", "create_item", "create_financial_entry"]);

/** Origens que precisam enviar `idempotencyKey` em toda escrita. */
export const IDEMPOTENCY_REQUIRED: ReadonlySet<ToolOrigin> = new Set(["agent", "import"]);

export function authorize(origin: ToolOrigin, scopes: string[] | undefined, tool: Tool, input?: unknown): Verdict {
  if (scopes && !scopes.includes(tool.name)) {
    return { effect: "deny", reason: `“${tool.name}” está fora do escopo concedido.` };
  }
  if (origin === "user_app") return { effect: "allow" };

  if (tool.mode === "read") {
    return origin === "import"
      ? { effect: "deny", reason: "Importações não leem dados." }
      : { effect: "allow" };
  }

  if (origin === "import") {
    return IMPORT_ALLOWED.has(tool.name)
      ? { effect: "allow" }
      : { effect: "deny", reason: `Importações não podem executar “${tool.name}”.` };
  }

  // automation | agent
  if (tool.sensitivity === "external") return { effect: "confirm", reason: "Ação externa exige aprovação." };
  const risk = (input !== undefined && tool.riskFor ? tool.riskFor(input) : tool.risk);
  if (risk === "low") return { effect: "allow" };
  return { effect: "confirm", reason: risk === "high" ? "Envolve dinheiro." : "Altera seus dados." };
}
