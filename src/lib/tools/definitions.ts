/**
 * Catálogo de ferramentas — READ e WRITE separados.
 *
 * Regras de negócio NÃO vivem aqui: cada ferramenta valida a entrada (zod) e
 * delega para `domain/operations` e `domain/selectors`, as mesmas funções que a
 * UI usa. Ferramenta = contrato + validação + chamada ao domínio.
 *
 * Nomes legados (decisões já salvas no aparelho) continuam funcionando via
 * `LEGACY_ALIASES`.
 */
import { z } from "zod";
import { addDays, weekDays } from "@/lib/domain/dates";
import {
  acceptCapture,
  addFinancialEntry,
  addItem,
  addNote,
  addSteps,
  captureText,
  completeItem,
  postponeItem,
  updateItem,
} from "@/lib/domain/operations";
import { searchAll } from "@/lib/domain/search";
import {
  inboxCaptures,
  pendingDecisions,
  selectMonth,
  selectToday,
  selectWeek,
  summarizeProject,
} from "@/lib/domain/selectors";
import type { AppData, Item, ItemDraft, Project } from "@/lib/domain/types";
import { interpretText, matchProject, normalize } from "@/lib/intelligence/heuristic/parse";
import {
  AREAS,
  centsSchema,
  isoDateSchema,
  ITEM_KINDS,
  PRIORITIES,
  timeSchema,
  validateStructured,
} from "@/lib/intelligence/structured";
import type { ReadTool, Tool, WriteTool } from "./types";

const id = z.string().trim().min(1).max(120);
const optDate = isoDateSchema.optional();

/** Remove campos internos pesados antes de entregar itens a um agente. */
export function compactItem(i: Item) {
  const { history: _history, ...rest } = i;
  void _history;
  return rest;
}
const compactList = (items: Item[]) => items.map(compactItem);

function findProject(data: AppData, input: { projectId?: string; name?: string }): Project | null {
  if (input.projectId) return data.projects.find((p) => p.id === input.projectId) ?? null;
  if (input.name) {
    const n = normalize(input.name).trim();
    return (
      data.projects.find((p) => [p.name, ...(p.aliases ?? [])].some((x) => normalize(x).trim() === n)) ??
      matchProject(input.name, data.projects)
    );
  }
  return null;
}

const itemTitle = (data: AppData, itemId: string) => data.items.find((i) => i.id === itemId)?.title ?? "item";
const requireItem = (data: AppData, itemId: string) => {
  if (!data.items.some((i) => i.id === itemId)) throw new NotFound(`Item não encontrado: ${itemId}`);
};
export class NotFound extends Error {}

const ddmm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

/* ---------------------------------------------------------------------------
 * READ — só consultam. Nunca mudam dados.
 * ------------------------------------------------------------------------- */

const dateOnly = z.strictObject({ date: optDate });

export const READ_TOOLS: ReadTool[] = [
  {
    mode: "read",
    name: "get_today",
    description: "O que importa hoje: prioridades, agenda, dinheiro, atrasados.",
    input: z.strictObject({}),
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => selectToday(data, ctx.today),
  },
  {
    mode: "read",
    name: "get_week",
    description: "Visão da semana (segunda a domingo) de uma data (padrão: hoje).",
    input: dateOnly,
    sensitivity: "internal",
    enabled: true,
    run: (data, input: z.infer<typeof dateOnly>, ctx) =>
      selectWeek(data, weekDays(input.date ?? ctx.today), ctx.today),
  },
  {
    mode: "read",
    name: "get_month",
    description: "Visão do mês: calendário, prazos, contas, metas.",
    input: dateOnly,
    sensitivity: "internal",
    enabled: true,
    run: (data, input: z.infer<typeof dateOnly>, ctx) => selectMonth(data, input.date ?? ctx.today, ctx.today),
  },
  {
    mode: "read",
    name: "search",
    description: "Busca por texto em itens, projetos, notas e capturas (ignora acentos).",
    input: z.strictObject({ query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }),
    sensitivity: "internal",
    enabled: true,
    run: (data, input: { query: string; limit: number }) => {
      const r = searchAll(data, input.query, input.limit);
      return { ...r, items: compactList(r.items) };
    },
  },
  {
    mode: "read",
    name: "list_projects",
    description: "Projetos ativos com próxima ação.",
    input: z.strictObject({}),
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) =>
      data.projects
        .filter((p) => p.status === "active")
        .map((p) => {
          const s = summarizeProject(data, p, ctx.today);
          return {
            id: p.id,
            name: p.name,
            area: p.area,
            state: p.currentState ?? null,
            deadline: p.deadline ?? null,
            nextAction: s.nextAction?.title ?? null,
            open: s.open.length,
            overdue: s.overdue,
          };
        }),
  },
  {
    mode: "read",
    name: "get_project",
    description: "Detalhe de um projeto (por id, nome ou apelido): estado, próxima ação, pendências, notas.",
    input: z
      .strictObject({ projectId: id.optional(), name: z.string().trim().min(1).max(80).optional() })
      .refine((v) => v.projectId || v.name, "informe projectId ou name"),
    sensitivity: "internal",
    enabled: true,
    run: (data, input: { projectId?: string; name?: string }, ctx) => {
      const p = findProject(data, input);
      if (!p) throw new NotFound("Projeto não encontrado.");
      const s = summarizeProject(data, p, ctx.today);
      return {
        project: p,
        nextAction: s.nextAction ? compactItem(s.nextAction) : null,
        open: compactList(s.open),
        done: compactList(s.done.slice(0, 10)),
        overdue: s.overdue,
        notes: data.notes.filter((n) => n.projectId === p.id),
      };
    },
  },
  {
    mode: "read",
    name: "get_inbox",
    description: "Capturas ainda não organizadas.",
    input: z.strictObject({}),
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => inboxCaptures(data.captures, ctx.today),
  },
  {
    mode: "read",
    name: "get_decisions",
    description: "Decisões esperando a pessoa.",
    input: z.strictObject({}),
    sensitivity: "internal",
    enabled: true,
    run: (data, _i, ctx) => pendingDecisions(data.decisions, ctx.today, data.items),
  },
  {
    mode: "read",
    name: "get_financial_summary",
    description: "Resumo financeiro do mês: a pagar, pago, a receber, recebido, saldo previsto (centavos).",
    input: dateOnly,
    sensitivity: "internal",
    enabled: true,
    run: (data, input: z.infer<typeof dateOnly>, ctx) =>
      selectMonth(data, input.date ?? ctx.today, ctx.today).money,
  },
  {
    mode: "read",
    name: "read_calendar",
    description: "Agenda externa (Google Calendar etc.). NÃO CONECTADO.",
    input: z.strictObject({ from: isoDateSchema, to: isoDateSchema }),
    sensitivity: "external",
    enabled: false,
    run: () => {
      throw new Error("Integração de calendário não configurada.");
    },
  },
];

/* ---------------------------------------------------------------------------
 * WRITE — mudam dados, sempre via domain/operations.
 * ------------------------------------------------------------------------- */

const itemPatch = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(2000).nullable(),
    kind: z.enum(ITEM_KINDS),
    area: z.enum(AREAS),
    priority: z.enum(PRIORITIES),
    dueDate: isoDateSchema.nullable(),
    scheduledDate: isoDateSchema.nullable(),
    startTime: timeSchema.nullable(),
    endTime: timeSchema.nullable(),
    projectId: id.nullable(),
    people: z.array(z.string().trim().min(1).max(60)).max(10),
    estimateMin: z.number().int().min(1).max(24 * 60).nullable(),
    focusDate: isoDateSchema.nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "patch vazio");

const createItemInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).optional(),
  kind: z.enum(ITEM_KINDS).default("task"),
  area: z.enum(AREAS).default("personal"),
  priority: z.enum(PRIORITIES).default("normal"),
  dueDate: isoDateSchema.nullish(),
  scheduledDate: isoDateSchema.nullish(),
  startTime: timeSchema.nullish(),
  endTime: timeSchema.nullish(),
  projectId: id.nullish(),
  people: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  estimateMin: z.number().int().min(1).max(24 * 60).nullish(),
});

const financialInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  direction: z.enum(["in", "out"]),
  amountCents: centsSchema,
  dueDate: isoDateSchema.nullish(),
  category: z.string().trim().max(40).optional(),
  settled: z.boolean().default(false),
  projectId: id.nullish(),
  notes: z.string().max(2000).optional(),
  recurrence: z
    .strictObject({ freq: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(365).optional() })
    .nullish(),
});

const snoozeInput = z
  .strictObject({
    itemId: id,
    /** novo dia planejado; null = tira do radar sem data */
    until: isoDateSchema.nullable().optional(),
    /** alternativa a `until`: daqui a N dias */
    days: z.number().int().min(1).max(365).optional(),
  })
  .refine((v) => !(v.until !== undefined && v.days !== undefined), "use until OU days");

const itemIdInput = z.strictObject({ itemId: id });

/** Rascunho de item como o app o conhece (ItemDraft). */
const itemDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(ITEM_KINDS),
  area: z.enum(AREAS),
  priority: z.enum(PRIORITIES),
  dueDate: isoDateSchema.nullish(),
  scheduledDate: isoDateSchema.nullish(),
  startTime: timeSchema.nullish(),
  projectId: id.nullish(),
  people: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  context: z.string().max(500).nullish(),
  money: z
    .strictObject({ amountCents: centsSchema, direction: z.enum(["in", "out"]), category: z.string().max(40).nullish() })
    .nullish(),
  recurrence: z
    .strictObject({ freq: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(365).optional() })
    .nullish(),
});

export const WRITE_TOOLS: WriteTool[] = [
  {
    mode: "write",
    name: "capture_item",
    description:
      "Captura rápida em linguagem natural (ex.: “sexta preciso pagar a VPS”). Vai para a Inbox para revisão; " +
      "só cria itens direto quando chamada pelo próprio app com accept=true. Aceita `structured` (itens já extraídos).",
    input: z.strictObject({
      text: z.string().trim().min(1).max(10_000),
      accept: z.boolean().default(false),
      structured: z.unknown().optional(),
    }),
    sensitivity: "internal",
    enabled: true,
    risk: "low",
    riskFor: (input: { accept: boolean }) => (input.accept ? "normal" : "low"),
    describe: (_d, input: { text: string }) => `Capturar: “${input.text.slice(0, 80)}”`,
    run: (data, input: { text: string; accept: boolean; structured?: unknown }, ctx, extras) => {
      const ictx = { today: ctx.today, projects: data.projects };
      let interpretation = extras.interpretation;
      if (!interpretation && input.structured !== undefined) {
        const v = validateStructured(input.structured, ictx, "agent:structured");
        if (!v.ok) throw new InvalidStructured(v.issues);
        interpretation = v.interpretation;
      }
      interpretation ??= interpretText(input.text, ictx);
      const res = captureText(data, input.text, interpretation, input.accept);
      return {
        data: res.data,
        output: {
          captureId: res.capture.id,
          itemIds: res.capture.itemIds,
          drafts: interpretation.drafts.length,
          confidence: interpretation.confidence,
          source: interpretation.source,
          notes: interpretation.notes,
        },
      };
    },
  },
  {
    mode: "write",
    name: "create_item",
    description: "Cria um item (tarefa, compromisso, lembrete…). Para dinheiro use create_financial_entry.",
    input: z.strictObject({ item: createItemInput }),
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (_d, input: { item: { title: string } }) => `Criar “${input.item.title}”`,
    run: (data, input: { item: z.infer<typeof createItemInput> }) => {
      if (input.item.projectId && !data.projects.some((p) => p.id === input.item.projectId))
        throw new NotFound("Projeto não encontrado.");
      const r = addItem(data, input.item);
      return { data: r.data, output: { itemId: r.item.id } };
    },
  },
  {
    mode: "write",
    name: "update_item",
    description: "Altera campos de um item (título, datas, prioridade, projeto…). Não altera status nem dinheiro.",
    input: z.strictObject({ itemId: id, patch: itemPatch }),
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (d, input: { itemId: string }) => `Editar “${itemTitle(d, input.itemId)}”`,
    run: (data, input: { itemId: string; patch: z.infer<typeof itemPatch> }) => {
      requireItem(data, input.itemId);
      if (input.patch.projectId && !data.projects.some((p) => p.id === input.patch.projectId))
        throw new NotFound("Projeto não encontrado.");
      return { data: updateItem(data, input.itemId, input.patch as Partial<Item>) };
    },
  },
  {
    mode: "write",
    name: "schedule_item",
    description: "Define o dia planejado de um item (não muda o prazo).",
    input: z.strictObject({ itemId: id, date: isoDateSchema.nullable() }),
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (d, input: { itemId: string; date: string | null }) =>
      `Planejar “${itemTitle(d, input.itemId)}” para ${input.date ? ddmm(input.date) : "sem dia"}`,
    run: (data, input: { itemId: string; date: string | null }) => {
      requireItem(data, input.itemId);
      return { data: updateItem(data, input.itemId, { scheduledDate: input.date }) };
    },
  },
  {
    mode: "write",
    name: "snooze_item",
    description: "Adia um item (until=data, days=N, ou nenhum = tira do radar). O prazo real nunca muda.",
    input: snoozeInput,
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (d, input: { itemId: string }) => `Adiar “${itemTitle(d, input.itemId)}”`,
    run: (data, input: z.infer<typeof snoozeInput>, ctx) => {
      requireItem(data, input.itemId);
      const to = input.days !== undefined ? addDays(ctx.today, input.days) : (input.until ?? null);
      return { data: postponeItem(data, input.itemId, to) };
    },
  },
  {
    mode: "write",
    name: "complete_item",
    description: "Marca um item como feito (conta: registra como paga — não movimenta dinheiro).",
    input: itemIdInput,
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (d, input: { itemId: string }) => `Concluir “${itemTitle(d, input.itemId)}”`,
    run: (data, input: { itemId: string }) => {
      requireItem(data, input.itemId);
      return { data: completeItem(data, input.itemId) };
    },
  },
  {
    mode: "write",
    name: "mark_paid",
    description: "Registra que uma conta foi paga / um valor foi recebido. NÃO movimenta dinheiro.",
    input: itemIdInput,
    sensitivity: "internal",
    enabled: true,
    risk: "high",
    describe: (d, input: { itemId: string }) => `Marcar “${itemTitle(d, input.itemId)}” como pago`,
    run: (data, input: { itemId: string }) => {
      requireItem(data, input.itemId);
      return { data: completeItem(data, input.itemId) };
    },
  },
  {
    mode: "write",
    name: "create_financial_entry",
    description:
      "Lança conta a pagar, despesa ou recebimento (valor em centavos). Só REGISTRA — não paga nem move dinheiro.",
    input: financialInput,
    sensitivity: "internal",
    enabled: true,
    risk: "high",
    describe: (_d, input: z.infer<typeof financialInput>) =>
      `${input.direction === "in" ? "Registrar recebimento" : "Registrar conta"}: “${input.title}”`,
    run: (data, input: z.infer<typeof financialInput>) => {
      if (input.projectId && !data.projects.some((p) => p.id === input.projectId))
        throw new NotFound("Projeto não encontrado.");
      const r = addFinancialEntry(data, input);
      return { data: r.data, output: { itemId: r.item.id } };
    },
  },
  {
    mode: "write",
    name: "add_steps",
    description: "Quebra um item em passos menores.",
    input: z.strictObject({ itemId: id, steps: z.array(z.string().trim().min(1).max(200)).min(1).max(12) }),
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (d, input: { itemId: string; steps: string[] }) =>
      `Quebrar “${itemTitle(d, input.itemId)}” em ${input.steps.length} passo(s)`,
    run: (data, input: { itemId: string; steps: string[] }) => {
      requireItem(data, input.itemId);
      return { data: addSteps(data, input.itemId, input.steps) };
    },
  },
  {
    mode: "write",
    name: "accept_capture",
    description: "Transforma uma captura da Inbox em itens.",
    input: z.strictObject({ captureId: id, drafts: z.array(itemDraftSchema).max(12) }),
    sensitivity: "internal",
    enabled: true,
    risk: "normal",
    describe: (_d, input: { drafts: unknown[] }) => `Organizar captura em ${input.drafts.length} item(ns)`,
    run: (data, input: { captureId: string; drafts: unknown[] }) => {
      if (!data.captures.some((c) => c.id === input.captureId)) throw new NotFound("Captura não encontrada.");
      return { data: acceptCapture(data, input.captureId, input.drafts as ItemDraft[]) };
    },
  },
  {
    mode: "write",
    name: "add_note",
    description: "Adiciona uma nota de contexto a um projeto ou item.",
    input: z
      .strictObject({ body: z.string().trim().min(1).max(2000), projectId: id.nullish(), itemId: id.nullish() })
      .refine((v) => v.projectId || v.itemId, "informe projectId ou itemId"),
    sensitivity: "internal",
    enabled: true,
    risk: "low",
    describe: () => "Adicionar nota",
    run: (data, input: { body: string; projectId?: string | null; itemId?: string | null }) => {
      if (input.projectId && !data.projects.some((p) => p.id === input.projectId))
        throw new NotFound("Projeto não encontrado.");
      if (input.itemId) requireItem(data, input.itemId);
      return {
        data: addNote(data, { body: input.body, projectId: input.projectId ?? null, itemId: input.itemId ?? null }),
      };
    },
  },
  /* ----- EXTERNAS: declaradas, desabilitadas ----- */
  {
    mode: "write",
    name: "send_message",
    description: "Enviar mensagem (WhatsApp/e-mail). NÃO CONECTADO.",
    input: z.strictObject({ to: z.string().max(120), body: z.string().max(2000) }),
    sensitivity: "external",
    enabled: false,
    risk: "high",
    describe: (_d, input: { to: string }) => `Enviar mensagem para ${input.to}`,
    run: () => {
      throw new Error("Envio de mensagens não está configurado.");
    },
  },
  {
    mode: "write",
    name: "create_calendar_event",
    description: "Criar evento no calendário externo. NÃO CONECTADO.",
    input: z.strictObject({ title: z.string().max(200), date: isoDateSchema, time: timeSchema.optional() }),
    sensitivity: "external",
    enabled: false,
    risk: "high",
    describe: (_d, input: { title: string }) => `Criar evento “${input.title}” no calendário`,
    run: () => {
      throw new Error("Integração de calendário não configurada.");
    },
  },
  {
    mode: "write",
    name: "pay_bill",
    description: "Pagar uma conta de verdade. NÃO CONECTADO — e sempre exigirá confirmação.",
    input: itemIdInput,
    sensitivity: "external",
    enabled: false,
    risk: "high",
    describe: (d, input: { itemId: string }) => `Pagar “${itemTitle(d, input.itemId)}”`,
    run: () => {
      throw new Error("Pagamentos reais não são suportados.");
    },
  },
];

export class InvalidStructured extends Error {
  constructor(readonly issues: string[]) {
    super("structured inválido");
  }
}

export const TOOLS: Tool[] = [...READ_TOOLS, ...WRITE_TOOLS];

/** Nomes antigos (decisões já gravadas) → ferramenta atual + adaptação da entrada. */
export const LEGACY_ALIASES: Record<string, { tool: string; input?: (i: Record<string, unknown>) => Record<string, unknown> }> = {
  search_items: { tool: "search", input: (i) => ({ query: i.query }) },
  finance_summary: { tool: "get_financial_summary" },
  list_inbox: { tool: "get_inbox" },
  list_decisions: { tool: "get_decisions" },
  postpone_item: { tool: "snooze_item", input: (i) => ({ itemId: i.itemId, until: i.to ?? null }) },
};

export function getTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
