/**
 * Ferramentas do agente.
 *
 * Separação explícita:
 *  - READ  → só consultam AppData. Podem ser chamadas livremente.
 *  - WRITE → mudam AppData via `operations.ts`. Quando chamadas por um agente
 *            (actor = "agent") e `requiresConfirmation`, NÃO executam: viram um
 *            item na Fila de Decisões e só rodam depois do seu “Aprovar”.
 *  - EXTERNAL (sensitivity "external") → ações fora do app (mensagens, agenda,
 *            pagamentos). Estão declaradas para o desenho ficar claro, mas
 *            DESABILITADAS: nenhuma integração real existe neste MVP.
 *
 * Um agente futuro (ex.: Hermes) recebe `toolManifest()` e conversa com
 * `executeTool`. Nada aqui depende da UI.
 */
import { todayISO, weekDays } from "@/lib/domain/dates";
import {
  acceptCapture,
  addDecision,
  addItem,
  addNote,
  addSteps,
  completeItem,
  logActivity,
  postponeItem,
  updateItem,
  type ItemInput,
} from "@/lib/domain/operations";
import {
  inboxCaptures,
  pendingDecisions,
  selectMonth,
  selectToday,
  selectWeek,
  summarizeProject,
} from "@/lib/domain/selectors";
import type { AppData, Decision, ISODate, Item, ItemDraft, ProposedAction } from "@/lib/domain/types";
import { normalize } from "./heuristic/parse";

export type ToolKind = "read" | "write";
export type Actor = "user" | "agent" | "system";

export interface ToolContext {
  today: ISODate;
}

interface BaseTool {
  name: string;
  description: string;
  /** descrição simples dos parâmetros (vira JSON schema para um LLM no futuro) */
  params: Record<string, string>;
  sensitivity: "internal" | "external";
  enabled: boolean;
}

export interface ReadTool extends BaseTool {
  kind: "read";
  run(data: AppData, input: Record<string, unknown>, ctx: ToolContext): unknown;
}

export interface WriteTool extends BaseTool {
  kind: "write";
  requiresConfirmation: boolean;
  /** resumo humano do que a ação fará (usado na fila de decisões e no log) */
  describe(data: AppData, input: Record<string, unknown>): string;
  run(data: AppData, input: Record<string, unknown>, ctx: ToolContext): AppData;
}

export type Tool = ReadTool | WriteTool;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const itemTitle = (data: AppData, id: unknown) => data.items.find((i) => i.id === id)?.title ?? "item";

/* ---------------------------------------------------------------------------
 * READ
 * ------------------------------------------------------------------------- */

const readTools: ReadTool[] = [
  {
    kind: "read",
    name: "get_today",
    description: "O que importa hoje: prioridades, agenda, dinheiro, atrasados.",
    params: {},
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => selectToday(data, ctx.today),
  },
  {
    kind: "read",
    name: "get_week",
    description: "Visão da semana (segunda a domingo) de uma data.",
    params: { date: "yyyy-MM-dd (opcional)" },
    sensitivity: "internal",
    enabled: true,
    run: (data, input, ctx) => selectWeek(data, weekDays(str(input.date) || ctx.today), ctx.today),
  },
  {
    kind: "read",
    name: "get_month",
    description: "Visão do mês: calendário, prazos, contas, metas.",
    params: { date: "yyyy-MM-dd (opcional)" },
    sensitivity: "internal",
    enabled: true,
    run: (data, input, ctx) => selectMonth(data, str(input.date) || ctx.today, ctx.today),
  },
  {
    kind: "read",
    name: "search_items",
    description: "Busca itens por texto (título, notas, pessoas).",
    params: { query: "texto", includeDone: "boolean (opcional)" },
    sensitivity: "internal",
    enabled: true,
    run: (data, input) => {
      const q = normalize(str(input.query));
      return data.items.filter(
        (i) =>
          (input.includeDone || i.status === "open") &&
          normalize([i.title, i.notes ?? "", ...(i.people ?? [])].join(" ")).includes(q),
      );
    },
  },
  {
    kind: "read",
    name: "list_projects",
    description: "Projetos ativos com próxima ação.",
    params: {},
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) =>
      data.projects
        .filter((p) => p.status === "active")
        .map((p) => {
          const s = summarizeProject(data, p, ctx.today);
          return { id: p.id, name: p.name, state: p.currentState, nextAction: s.nextAction?.title ?? null, open: s.open.length };
        }),
  },
  {
    kind: "read",
    name: "get_project",
    description: "Detalhe de um projeto: estado, próxima ação, pendências, notas.",
    params: { projectId: "id" },
    sensitivity: "internal",
    enabled: true,
    run: (data, input, ctx) => {
      const p = data.projects.find((x) => x.id === input.projectId);
      if (!p) return null;
      return { ...summarizeProject(data, p, ctx.today), notes: data.notes.filter((n) => n.projectId === p.id) };
    },
  },
  {
    kind: "read",
    name: "finance_summary",
    description: "Resumo financeiro do mês (a pagar, pago, a receber, recebido, saldo previsto).",
    params: { date: "yyyy-MM-dd (opcional)" },
    sensitivity: "internal",
    enabled: true,
    run: (data, input, ctx) => selectMonth(data, str(input.date) || ctx.today, ctx.today).money,
  },
  {
    kind: "read",
    name: "list_inbox",
    description: "Capturas ainda não organizadas.",
    params: {},
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => inboxCaptures(data.captures, ctx.today),
  },
  {
    kind: "read",
    name: "list_decisions",
    description: "Decisões esperando a pessoa.",
    params: {},
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => pendingDecisions(data.decisions, ctx.today, data.items),
  },
  {
    kind: "read",
    name: "read_calendar",
    description: "Agenda externa (Google Calendar etc.). NÃO CONECTADO.",
    params: { from: "yyyy-MM-dd", to: "yyyy-MM-dd" },
    sensitivity: "external",
    enabled: false,
    run: () => {
      throw new Error("Integração de calendário não configurada.");
    },
  },
];

/* ---------------------------------------------------------------------------
 * WRITE (internas)
 * ------------------------------------------------------------------------- */

const writeTools: WriteTool[] = [
  {
    kind: "write",
    name: "create_item",
    description: "Cria um item (tarefa, conta, compromisso…).",
    params: { item: "ItemInput" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (_d, input) => `Criar “${(input.item as ItemInput)?.title ?? "item"}”`,
    run: (data, input) => addItem(data, input.item as ItemInput).data,
  },
  {
    kind: "write",
    name: "update_item",
    description: "Altera campos de um item.",
    params: { itemId: "id", patch: "Partial<Item>" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Editar “${itemTitle(d, input.itemId)}”`,
    run: (data, input) => updateItem(data, str(input.itemId), input.patch as Partial<Item>),
  },
  {
    kind: "write",
    name: "schedule_item",
    description: "Define o dia planejado de um item.",
    params: { itemId: "id", date: "yyyy-MM-dd | null" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Planejar “${itemTitle(d, input.itemId)}” para ${input.date ? str(input.date).split("-").reverse().slice(0, 2).join("/") : "sem dia"}`,
    run: (data, input) =>
      updateItem(data, str(input.itemId), { scheduledDate: (input.date as string | null) ?? null }),
  },
  {
    kind: "write",
    name: "postpone_item",
    description: "Adia um item para outra data (sem mudar o prazo real).",
    params: { itemId: "id", to: "yyyy-MM-dd | null" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Adiar “${itemTitle(d, input.itemId)}”`,
    run: (data, input) => postponeItem(data, str(input.itemId), (input.to as string | null) ?? null),
  },
  {
    kind: "write",
    name: "complete_item",
    description: "Marca um item como feito.",
    params: { itemId: "id" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Concluir “${itemTitle(d, input.itemId)}”`,
    run: (data, input) => completeItem(data, str(input.itemId)),
  },
  {
    kind: "write",
    name: "mark_paid",
    description: "Registra que uma conta foi paga / um valor foi recebido. NÃO movimenta dinheiro.",
    params: { itemId: "id" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Marcar “${itemTitle(d, input.itemId)}” como pago`,
    run: (data, input) => completeItem(data, str(input.itemId)),
  },
  {
    kind: "write",
    name: "add_steps",
    description: "Quebra um item em passos menores.",
    params: { itemId: "id", steps: "string[]" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (d, input) => `Quebrar “${itemTitle(d, input.itemId)}” em ${(input.steps as string[])?.length ?? 0} passo(s)`,
    run: (data, input) => addSteps(data, str(input.itemId), (input.steps as string[]) ?? []),
  },
  {
    kind: "write",
    name: "accept_capture",
    description: "Transforma uma captura da Inbox em itens.",
    params: { captureId: "id", drafts: "ItemDraft[]" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: true,
    describe: (_d, input) => `Organizar captura em ${(input.drafts as ItemDraft[])?.length ?? 0} item(ns)`,
    run: (data, input) => acceptCapture(data, str(input.captureId), (input.drafts as ItemDraft[]) ?? []),
  },
  {
    kind: "write",
    name: "add_note",
    description: "Adiciona uma nota de contexto a um projeto ou item.",
    params: { body: "texto", projectId: "id (opcional)", itemId: "id (opcional)" },
    sensitivity: "internal",
    enabled: true,
    requiresConfirmation: false,
    describe: () => "Adicionar nota",
    run: (data, input) =>
      addNote(data, {
        body: str(input.body),
        projectId: (input.projectId as string) ?? null,
        itemId: (input.itemId as string) ?? null,
      }),
  },
  /* ----- EXTERNAS: declaradas, desabilitadas ----- */
  {
    kind: "write",
    name: "send_message",
    description: "Enviar mensagem (WhatsApp/e-mail). NÃO CONECTADO.",
    params: { to: "contato", body: "texto" },
    sensitivity: "external",
    enabled: false,
    requiresConfirmation: true,
    describe: (_d, input) => `Enviar mensagem para ${str(input.to)}`,
    run: () => {
      throw new Error("Envio de mensagens não está configurado.");
    },
  },
  {
    kind: "write",
    name: "create_calendar_event",
    description: "Criar evento no calendário externo. NÃO CONECTADO.",
    params: { title: "texto", date: "yyyy-MM-dd", time: "HH:mm" },
    sensitivity: "external",
    enabled: false,
    requiresConfirmation: true,
    describe: (_d, input) => `Criar evento “${str(input.title)}” no calendário`,
    run: () => {
      throw new Error("Integração de calendário não configurada.");
    },
  },
  {
    kind: "write",
    name: "pay_bill",
    description: "Pagar uma conta de verdade. NÃO CONECTADO — e sempre exigirá confirmação.",
    params: { itemId: "id" },
    sensitivity: "external",
    enabled: false,
    requiresConfirmation: true,
    describe: (d, input) => `Pagar “${itemTitle(d, input.itemId)}”`,
    run: () => {
      throw new Error("Pagamentos reais não são suportados.");
    },
  },
];

export const TOOLS: Tool[] = [...readTools, ...writeTools];

export function getTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Descrição serializável para entregar a um LLM/agente. */
export function toolManifest() {
  return TOOLS.map((t) => ({
    name: t.name,
    kind: t.kind,
    description: t.description,
    params: t.params,
    sensitivity: t.sensitivity,
    enabled: t.enabled,
    requiresConfirmation: t.kind === "write" ? t.requiresConfirmation : false,
  }));
}

/* ---------------------------------------------------------------------------
 * Executor
 * ------------------------------------------------------------------------- */

export type ExecResult =
  | { status: "ok"; data: AppData; output?: unknown }
  | { status: "needs_confirmation"; data: AppData; decisionTitle: string }
  | { status: "error"; data: AppData; error: string };

export interface ExecOptions {
  actor: Actor;
  /** true quando a pessoa aprovou explicitamente (ex.: via Fila de Decisões) */
  confirmed?: boolean;
  ctx?: ToolContext;
  /** para quando a ação vira decisão */
  decision?: Partial<Pick<Decision, "kind" | "title" | "context" | "itemId" | "projectId" | "dedupeKey">>;
  /** não registrar no log (ex.: leituras frequentes) */
  silent?: boolean;
}

export function executeTool(data: AppData, call: ProposedAction, opts: ExecOptions): ExecResult {
  const ctx = opts.ctx ?? { today: todayISO() };
  const tool = getTool(call.tool);
  if (!tool) return { status: "error", data, error: `Ferramenta desconhecida: ${call.tool}` };
  if (!tool.enabled) {
    const next = logActivity(data, {
      actor: opts.actor,
      tool: tool.name,
      summary: `Bloqueado: ${tool.description}`,
      status: "error",
      input: call.input,
    });
    return { status: "error", data: next, error: `“${tool.name}” não está habilitada neste app.` };
  }

  if (tool.kind === "read") {
    try {
      return { status: "ok", data, output: tool.run(data, call.input, ctx) };
    } catch (e) {
      return { status: "error", data, error: (e as Error).message };
    }
  }

  const summary = tool.describe(data, call.input);
  const mustAsk = opts.actor === "agent" && (tool.requiresConfirmation || tool.sensitivity === "external");

  if (mustAsk && !opts.confirmed) {
    let next = addDecision(data, {
      kind: opts.decision?.kind ?? "agent_suggestion",
      title: opts.decision?.title ?? summary,
      context: opts.decision?.context,
      itemId: opts.decision?.itemId ?? (call.input.itemId as string) ?? null,
      projectId: opts.decision?.projectId ?? null,
      dedupeKey: opts.decision?.dedupeKey,
      actions: [call],
      createdBy: "agent",
    });
    if (next !== data) {
      next = logActivity(next, { actor: opts.actor, tool: tool.name, summary, status: "proposed", input: call.input });
    }
    return { status: "needs_confirmation", data: next, decisionTitle: summary };
  }

  try {
    let next = tool.run(data, call.input, ctx);
    if (!opts.silent) {
      next = logActivity(next, { actor: opts.actor, tool: tool.name, summary, status: "ok", input: call.input });
    }
    return { status: "ok", data: next };
  } catch (e) {
    return { status: "error", data, error: (e as Error).message };
  }
}

/** Executa as ações de uma decisão aprovada. */
export function runDecisionActions(data: AppData, decision: Decision, ctx?: ToolContext): ExecResult {
  let next = data;
  for (const action of decision.actions) {
    const r = executeTool(next, action, { actor: "user", confirmed: true, ctx });
    if (r.status === "error") return r;
    next = r.data;
  }
  return { status: "ok", data: next };
}
