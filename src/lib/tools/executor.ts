/**
 * Executor de ferramentas — o ÚNICO caminho de escrita para quem não é a UI
 * direta (agentes, automações, importações) e também usado pela própria UI.
 *
 * Pipeline de uma escrita:
 *   resolver nome → validar entrada → autorizar (origem/escopo) →
 *   idempotência → (confirmar? vira Decisão) → executar no domínio → auditar
 */
import { todayISO } from "@/lib/domain/dates";
import { hashHex, stableStringify } from "@/lib/domain/hash";
import { addDecision, logActivity } from "@/lib/domain/operations";
import type { AgentActivity, AppData, Decision, ProposedAction, ToolOrigin } from "@/lib/domain/types";
import { diffData } from "./audit";
import { getTool, InvalidStructured, LEGACY_ALIASES, NotFound } from "./definitions";
import { authorize, IDEMPOTENCY_REQUIRED } from "./policy";
import type { ErrorCode, ExecOptions, ExecResult, Tool, ToolContext, WriteTool } from "./types";

const ACTOR: Record<ToolOrigin, AgentActivity["actor"]> = {
  user_app: "user",
  agent: "agent",
  automation: "system",
  import: "system",
};

function resolve(call: ProposedAction): { tool: Tool | undefined; name: string; input: Record<string, unknown> } {
  const alias = LEGACY_ALIASES[call.tool];
  const name = alias?.tool ?? call.tool;
  return { tool: getTool(name), name, input: alias?.input ? alias.input(call.input) : call.input };
}

function fail(
  data: AppData,
  code: ErrorCode,
  error: string,
  extra?: { issues?: string[] },
): Extract<ExecResult, { status: "error" }> {
  return { status: "error", data, code, error, ...extra };
}

/** Texto humano do que uma ação proposta fará (aceita nomes legados). */
export function describeCall(data: AppData, call: ProposedAction): string {
  const { tool, input } = resolve(call);
  if (!tool || tool.mode !== "write") return call.tool;
  const parsed = tool.input.safeParse(input);
  return parsed.success ? tool.describe(data, parsed.data) : call.tool;
}

export function executeTool(data: AppData, call: ProposedAction, opts: ExecOptions): ExecResult {
  const ctx: ToolContext = opts.ctx ?? { today: todayISO() };
  const { origin } = opts;
  const { tool, name, input: rawInput } = resolve(call);

  // trilha de tentativas barradas (só para quem não é a própria pessoa no app)
  const reject = (code: ErrorCode, error: string, issues?: string[]) => {
    const next =
      origin === "user_app" || opts.silent
        ? data
        : logActivity(data, {
            actor: ACTOR[origin],
            origin,
            tool: name,
            summary: `Recusado: ${error}`,
            status: "rejected",
            input: rawInput,
            idempotencyKey: opts.idempotencyKey,
          });
    return fail(next, code, error, { issues });
  };

  if (!tool) return reject("unknown_tool", `Ferramenta desconhecida: ${call.tool}`);
  if (!tool.enabled) return reject("disabled", `“${tool.name}” não está habilitada neste app.`);

  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    return reject("invalid_input", "Entrada inválida.", issues);
  }
  const input = parsed.data as never;

  const verdict = authorize(origin, opts.scopes, tool, input);
  if (verdict.effect === "deny") return reject("forbidden", verdict.reason ?? "Sem permissão.");

  /* ---------------- READ ---------------- */
  if (tool.mode === "read") {
    try {
      return { status: "ok", data, output: tool.run(data, input, ctx) };
    } catch (e) {
      if (e instanceof NotFound) return fail(data, "not_found", e.message);
      return fail(data, "failed", (e as Error).message);
    }
  }

  /* ---------------- WRITE ---------------- */
  const write: WriteTool = tool;
  const key = opts.idempotencyKey;
  if (!key && IDEMPOTENCY_REQUIRED.has(origin)) {
    return reject("idempotency_key_required", "Escritas desta origem exigem idempotencyKey.");
  }
  const requestHash = hashHex(stableStringify({ tool: name, input: rawInput }));

  // idempotência: a mesma chave nunca executa duas vezes
  const prior = key ? data.activity.find((a) => a.idempotencyKey === key && (a.status === "ok" || a.status === "proposed")) : undefined;
  if (prior && (prior.tool !== name || prior.requestHash !== requestHash)) {
    return reject("idempotency_conflict", "Essa chave já foi usada com outro pedido.");
  }
  if (prior?.status === "ok") return { status: "ok", data, replayed: true };
  if (prior?.status === "proposed" && !opts.confirmed) {
    return { status: "needs_confirmation", data, decisionTitle: prior.summary, replayed: true };
  }

  const summary = write.describe(data, input);

  if (verdict.effect === "confirm" && !opts.confirmed) {
    let next = addDecision(data, {
      kind: opts.decision?.kind ?? "agent_suggestion",
      title: opts.decision?.title ?? summary,
      context: opts.decision?.context ?? verdict.reason,
      itemId: opts.decision?.itemId ?? (typeof rawInput.itemId === "string" ? rawInput.itemId : null),
      projectId: opts.decision?.projectId ?? null,
      dedupeKey: opts.decision?.dedupeKey ?? (key ? `idem:${key}` : undefined),
      actions: [{ tool: name, input: rawInput, origin, idempotencyKey: key }],
      createdBy: "agent",
    });
    if (next !== data) {
      next = logActivity(next, {
        actor: ACTOR[origin],
        origin,
        tool: name,
        summary,
        status: "proposed",
        input: rawInput,
        idempotencyKey: key,
        requestHash,
      });
    }
    return { status: "needs_confirmation", data: next, decisionTitle: summary };
  }

  try {
    const res = write.run(data, input, ctx, { interpretation: opts.interpretation });
    let next = res.data;
    if (!opts.silent) {
      const { entities, change } = diffData(data, next);
      next = logActivity(next, {
        actor: ACTOR[opts.via ? "user_app" : origin],
        origin: opts.via ? "user_app" : origin,
        tool: name,
        summary,
        status: "ok",
        input: rawInput,
        entities,
        change,
        idempotencyKey: key,
        requestHash,
        decisionId: opts.via?.decisionId,
        proposedBy: opts.via?.proposedBy,
      });
    }
    return { status: "ok", data: next, output: res.output };
  } catch (e) {
    if (e instanceof NotFound) return fail(data, "not_found", e.message);
    if (e instanceof InvalidStructured) return reject("invalid_input", "Estrutura enviada é inválida.", e.issues);
    return fail(data, "failed", (e as Error).message);
  }
}

/** Executa as ações de uma decisão aprovada (a pessoa aprovou ⇒ origem user_app). */
export function runDecisionActions(data: AppData, decision: Decision, ctx?: ToolContext): ExecResult {
  let next = data;
  for (const action of decision.actions) {
    const r = executeTool(next, action, {
      origin: "user_app",
      confirmed: true,
      ctx,
      idempotencyKey: action.idempotencyKey,
      via: { decisionId: decision.id, proposedBy: action.origin },
    });
    if (r.status === "error") return r;
    next = r.data;
  }
  return { status: "ok", data: next };
}
