/**
 * Modelo de domínio único.
 *
 * Princípio: Hoje, Semana e Mês NÃO têm dados próprios. Tudo é um `Item`
 * (tarefa, compromisso, conta, recebimento, compra, ideia...) e a tela em que
 * ele aparece é derivada de datas, estado e relevância (ver `selectors.ts`).
 */

/** Data local no formato `yyyy-MM-dd`. */
export type ISODate = string;
/** Timestamp ISO completo. */
export type ISODateTime = string;
/** Hora local `HH:mm`. */
export type TimeOfDay = string;

export type Area = "personal" | "work" | "finance";

export type ItemKind =
  | "task" // algo para fazer
  | "event" // compromisso com hora/dia marcado
  | "bill" // conta a pagar
  | "expense" // despesa já feita/avulsa
  | "income" // recebimento esperado
  | "shopping" // compra
  | "idea" // ideia (não é obrigação)
  | "reminder" // lembrete simples
  | "routine" // rotina recorrente
  | "goal"; // meta (normalmente do mês)

export type ItemStatus =
  | "open" // ativo
  | "done" // concluído / pago / recebido
  | "someday" // "algum dia" — fora do radar sem culpa
  | "archived";

export type Priority = "high" | "normal" | "low";

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: RecurrenceFreq;
  /** a cada N períodos (default 1) */
  interval?: number;
  /** id compartilhado entre as ocorrências da mesma série */
  seriesId: string;
}

/** Dados financeiros opcionais de um item (conta, despesa, recebimento). */
export interface Money {
  /** valor em centavos (sempre positivo) */
  amountCents: number;
  direction: "out" | "in";
  category?: string;
  /** pago / recebido */
  settled: boolean;
  settledAt?: ISODateTime;
}

export interface HistoryEntry {
  at: ISODateTime;
  type: "created" | "postponed" | "scheduled" | "completed" | "reopened" | "edited" | "settled" | "moved_to_someday";
  note?: string;
  from?: ISODate | null;
  to?: ISODate | null;
}

export interface Item {
  id: string;
  title: string;
  notes?: string;
  kind: ItemKind;
  area: Area;
  status: ItemStatus;
  priority: Priority;
  /** marcado manualmente como foco do dia em `focusDate` */
  focusDate?: ISODate | null;

  /** prazo real (quando "tem que" estar feito) */
  dueDate?: ISODate | null;
  /** dia planejado para fazer (pode diferir do prazo) */
  scheduledDate?: ISODate | null;
  /** para eventos */
  startTime?: TimeOfDay | null;
  endTime?: TimeOfDay | null;

  projectId?: string | null;
  /** item pai — permite quebrar um item grande em próximas ações */
  parentId?: string | null;
  people?: string[];
  /** estimativa em minutos */
  estimateMin?: number | null;

  money?: Money | null;
  recurrence?: Recurrence | null;

  /** quantas vezes foi adiado (sinal para sugerir quebrar/“algum dia”) */
  postponeCount: number;
  /** captura de origem */
  captureId?: string | null;

  history: HistoryEntry[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime | null;
}

/* ---------------------------------------------------------------------------
 * Captura / Inbox
 * ------------------------------------------------------------------------- */

/** Sugestão estruturada extraída de uma captura (pela camada de inteligência). */
export interface ItemDraft {
  title: string;
  kind: ItemKind;
  area: Area;
  priority: Priority;
  dueDate?: ISODate | null;
  scheduledDate?: ISODate | null;
  startTime?: TimeOfDay | null;
  projectId?: string | null;
  people?: string[];
  /** contexto livre (por quê / onde / com quem) — vira a nota do item */
  context?: string | null;
  money?: Omit<Money, "settled" | "settledAt"> | null;
  recurrence?: { freq: RecurrenceFreq; interval?: number } | null;
}

export interface Interpretation {
  /** quem interpretou: "heuristic" (local), "llm:<modelo>" etc. */
  source: string;
  intent: "do" | "pay" | "receive" | "buy" | "meet" | "remember" | "idea" | "decide";
  drafts: ItemDraft[];
  /** 0..1 — baixa confiança deve ficar na Inbox pedindo revisão */
  confidence: number;
  /** explicações curtas em linguagem humana (“entendi ‘sexta’ como 9/out”) */
  notes: string[];
}

export type CaptureStatus = "inbox" | "processed" | "snoozed" | "archived";

export interface Capture {
  id: string;
  text: string;
  createdAt: ISODateTime;
  status: CaptureStatus;
  snoozedUntil?: ISODate | null;
  interpretation?: Interpretation | null;
  /** itens criados a partir desta captura */
  itemIds: string[];
}

/* ---------------------------------------------------------------------------
 * Projetos e notas
 * ------------------------------------------------------------------------- */

export type ProjectStatus = "active" | "paused" | "done";

export interface Project {
  id: string;
  name: string;
  area: Area;
  status: ProjectStatus;
  /** "onde estou" — uma frase de estado atual */
  currentState?: string;
  deadline?: ISODate | null;
  /** palavras extras que a captura usa para reconhecer o projeto */
  aliases?: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Note {
  id: string;
  body: string;
  projectId?: string | null;
  itemId?: string | null;
  createdAt: ISODateTime;
}

/* ---------------------------------------------------------------------------
 * Fila de decisões + atividade do agente
 * ------------------------------------------------------------------------- */

export type DecisionKind = "reply" | "approve" | "pay" | "choose_date" | "agent_suggestion";

export type DecisionStatus = "pending" | "approved" | "snoozed" | "ignored";

/** Chamada de ferramenta (WRITE) proposta, executada só após aprovação. */
export interface ProposedAction {
  tool: string;
  input: Record<string, unknown>;
  /** quem propôs (preenchido pelo executor ao virar decisão) */
  origin?: ToolOrigin;
  idempotencyKey?: string;
}

export interface Decision {
  id: string;
  kind: DecisionKind;
  title: string;
  context?: string;
  itemId?: string | null;
  projectId?: string | null;
  /** quando aprovada, estas ações são executadas pelo executor de ferramentas */
  actions: ProposedAction[];
  status: DecisionStatus;
  snoozedUntil?: ISODate | null;
  /** chave de deduplicação para regras automáticas */
  dedupeKey?: string;
  createdBy: "user" | "agent" | "system";
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime | null;
}

/** De onde veio uma operação. Toda escrita carrega uma origem. */
export type ToolOrigin = "user_app" | "automation" | "agent" | "import";

export interface AuditEntity {
  type: "item" | "capture" | "project" | "note" | "decision";
  id: string;
  op: "create" | "update" | "delete";
}

/**
 * Trilha de auditoria (append-only): quem (origem), o quê (tool), em qual
 * entidade, o que mudou, quando e com qual chave de idempotência.
 * Entradas antigas não têm os campos opcionais.
 */
export interface AgentActivity {
  id: string;
  at: ISODateTime;
  actor: "user" | "agent" | "system";
  tool: string;
  summary: string;
  status: "ok" | "error" | "proposed" | "rejected";
  input?: Record<string, unknown>;
  origin?: ToolOrigin;
  entities?: AuditEntity[];
  /** mudança mínima por id: { campo: [antes, depois] } (criação: { "*": [null, "criado"] }) */
  change?: Record<string, Record<string, [unknown, unknown]>>;
  idempotencyKey?: string;
  /** hash do pedido — detecta a mesma chave usada com conteúdo diferente */
  requestHash?: string;
  /** executada ao aprovar esta decisão */
  decisionId?: string;
  /** origem que propôs a ação, quando foi aprovada depois */
  proposedBy?: ToolOrigin;
}

export type AuditEntry = AgentActivity;

/* ---------------------------------------------------------------------------
 * Estado completo (o que o repositório persiste)
 * ------------------------------------------------------------------------- */

export interface AppData {
  version: number;
  items: Item[];
  captures: Capture[];
  projects: Project[];
  notes: Note[];
  decisions: Decision[];
  activity: AgentActivity[];
}

export const AREA_LABEL: Record<Area, string> = {
  personal: "Pessoal",
  work: "Trabalho",
  finance: "Financeiro",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  task: "Tarefa",
  event: "Compromisso",
  bill: "Conta a pagar",
  expense: "Despesa",
  income: "Recebimento",
  shopping: "Compra",
  idea: "Ideia",
  reminder: "Lembrete",
  routine: "Rotina",
  goal: "Meta",
};
