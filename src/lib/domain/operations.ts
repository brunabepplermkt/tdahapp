/**
 * Operações puras sobre AppData (retornam um novo estado).
 *
 * São a única forma de mudar dados: a UI (via store) e as WRITE tools da
 * camada de inteligência chamam estas funções. Isso garante histórico e
 * regras iguais independentemente de quem age (você ou um agente).
 */
import { nextOccurrence } from "./dates";
import { newId, nowISO } from "./id";
import type {
  AgentActivity,
  AppData,
  Capture,
  Decision,
  HistoryEntry,
  ISODate,
  Item,
  ItemDraft,
  Note,
  Project,
} from "./types";

export type ItemInput = Partial<Omit<Item, "id" | "history" | "createdAt" | "updatedAt">> & {
  title: string;
};

export function makeItem(input: ItemInput, at = nowISO()): Item {
  return {
    kind: "task",
    area: "personal",
    status: "open",
    priority: "normal",
    postponeCount: 0,
    ...input,
    title: input.title.trim(),
    id: newId("itm"),
    history: [{ at, type: "created" }],
    createdAt: at,
    updatedAt: at,
  };
}

function mapItem(data: AppData, id: string, fn: (item: Item) => Item): AppData {
  return { ...data, items: data.items.map((i) => (i.id === id ? fn(i) : i)) };
}

function withHistory(item: Item, entry: Omit<HistoryEntry, "at">, at = nowISO()): Item {
  return { ...item, updatedAt: at, history: [...item.history, { at, ...entry }].slice(-30) };
}

export function addItem(data: AppData, input: ItemInput): { data: AppData; item: Item } {
  const item = makeItem(input);
  return { data: { ...data, items: [...data.items, item] }, item };
}

export function updateItem(data: AppData, id: string, patch: Partial<Item>): AppData {
  return mapItem(data, id, (i) => {
    const next = { ...i, ...patch };
    const scheduleChanged = patch.scheduledDate !== undefined && patch.scheduledDate !== i.scheduledDate;
    return withHistory(
      next,
      scheduleChanged
        ? { type: "scheduled", from: i.scheduledDate ?? null, to: patch.scheduledDate ?? null }
        : { type: "edited" },
    );
  });
}

export function deleteItem(data: AppData, id: string): AppData {
  return {
    ...data,
    items: data.items.filter((i) => i.id !== id && i.parentId !== id),
  };
}

/**
 * Conclui um item. Itens recorrentes geram a próxima ocorrência (nova linha,
 * mesma série) — assim histórico de pagamentos fica preservado.
 */
export function completeItem(data: AppData, id: string): AppData {
  const item = data.items.find((i) => i.id === id);
  if (!item || item.status === "done") return data;
  const at = nowISO();
  let next = mapItem(data, id, (i) =>
    withHistory(
      {
        ...i,
        status: "done",
        completedAt: at,
        money: i.money ? { ...i.money, settled: true, settledAt: at } : i.money,
      },
      { type: i.money ? "settled" : "completed" },
      at,
    ),
  );

  if (item.recurrence) {
    const { freq, interval = 1 } = item.recurrence;
    const base: Partial<Item> = {};
    if (item.dueDate) base.dueDate = nextOccurrence(item.dueDate, freq, interval);
    if (item.scheduledDate) base.scheduledDate = nextOccurrence(item.scheduledDate, freq, interval);
    const already = data.items.some(
      (i) =>
        i.recurrence?.seriesId === item.recurrence!.seriesId &&
        i.status === "open" &&
        i.id !== item.id,
    );
    if (!already) {
      const { id: _id, history: _h, createdAt: _c, updatedAt: _u, completedAt: _d, ...rest } = item;
      void _id; void _h; void _c; void _u; void _d;
      next = addItem(next, {
        ...rest,
        ...base,
        status: "open",
        postponeCount: 0,
        focusDate: null,
        money: item.money ? { ...item.money, settled: false, settledAt: undefined } : item.money,
      }).data;
    }
  }
  return next;
}

export function reopenItem(data: AppData, id: string): AppData {
  return mapItem(data, id, (i) =>
    withHistory(
      {
        ...i,
        status: "open",
        completedAt: null,
        money: i.money ? { ...i.money, settled: false, settledAt: undefined } : i.money,
      },
      { type: "reopened" },
    ),
  );
}

/**
 * Adiar sem culpa: move o dia planejado. O prazo real (dueDate) não muda —
 * mentir para si mesmo sobre prazos não ajuda.
 */
export function postponeItem(data: AppData, id: string, to: ISODate | null): AppData {
  return mapItem(data, id, (i) =>
    withHistory(
      {
        ...i,
        scheduledDate: to,
        focusDate: null,
        postponeCount: i.postponeCount + 1,
      },
      { type: "postponed", from: i.scheduledDate ?? i.dueDate ?? null, to },
    ),
  );
}

export function moveToSomeday(data: AppData, id: string): AppData {
  return mapItem(data, id, (i) =>
    withHistory({ ...i, status: "someday", scheduledDate: null, focusDate: null }, { type: "moved_to_someday" }),
  );
}

export function setFocus(data: AppData, id: string, date: ISODate | null): AppData {
  return mapItem(data, id, (i) => withHistory({ ...i, focusDate: date }, { type: "edited", note: "foco" }));
}

export function archiveItem(data: AppData, id: string): AppData {
  return mapItem(data, id, (i) => withHistory({ ...i, status: "archived" }, { type: "edited", note: "arquivado" }));
}

/** Quebra um item em passos menores (filhos). */
export function addSteps(data: AppData, parentId: string, titles: string[]): AppData {
  const parent = data.items.find((i) => i.id === parentId);
  if (!parent) return data;
  let next = data;
  for (const title of titles.map((t) => t.trim()).filter(Boolean)) {
    next = addItem(next, {
      title,
      kind: "task",
      area: parent.area,
      projectId: parent.projectId ?? null,
      parentId,
      priority: "normal",
      estimateMin: 15,
    }).data;
  }
  return next;
}

/* ---------------------------------------------------------------------------
 * Capturas
 * ------------------------------------------------------------------------- */

export function addCapture(data: AppData, capture: Omit<Capture, "id" | "createdAt" | "status" | "itemIds">): {
  data: AppData;
  capture: Capture;
} {
  const c: Capture = { ...capture, id: newId("cap"), createdAt: nowISO(), status: "inbox", itemIds: [] };
  return { data: { ...data, captures: [...data.captures, c] }, capture: c };
}

export function draftToItemInput(draft: ItemDraft, captureId?: string): ItemInput {
  return {
    title: draft.title,
    kind: draft.kind,
    area: draft.area,
    priority: draft.priority,
    dueDate: draft.dueDate ?? null,
    scheduledDate: draft.scheduledDate ?? null,
    startTime: draft.startTime ?? null,
    projectId: draft.projectId ?? null,
    people: draft.people ?? [],
    money: draft.money ? { ...draft.money, settled: false } : null,
    recurrence: draft.recurrence ? { ...draft.recurrence, seriesId: newId("ser") } : null,
    captureId: captureId ?? null,
  };
}

/** Aceita (com ou sem edição) os rascunhos de uma captura e cria os itens. */
export function acceptCapture(data: AppData, captureId: string, drafts: ItemDraft[]): AppData {
  let next = data;
  const ids: string[] = [];
  for (const d of drafts) {
    const res = addItem(next, draftToItemInput(d, captureId));
    next = res.data;
    ids.push(res.item.id);
  }
  return {
    ...next,
    captures: next.captures.map((c) =>
      c.id === captureId ? { ...c, status: "processed", itemIds: [...c.itemIds, ...ids] } : c,
    ),
  };
}

export function snoozeCapture(data: AppData, captureId: string, until: ISODate): AppData {
  return {
    ...data,
    captures: data.captures.map((c) => (c.id === captureId ? { ...c, status: "snoozed", snoozedUntil: until } : c)),
  };
}

export function archiveCapture(data: AppData, captureId: string): AppData {
  return {
    ...data,
    captures: data.captures.map((c) => (c.id === captureId ? { ...c, status: "archived" } : c)),
  };
}

export function updateCapture(data: AppData, captureId: string, patch: Partial<Capture>): AppData {
  return {
    ...data,
    captures: data.captures.map((c) => (c.id === captureId ? { ...c, ...patch } : c)),
  };
}

/* ---------------------------------------------------------------------------
 * Projetos e notas
 * ------------------------------------------------------------------------- */

export function addProject(
  data: AppData,
  input: Pick<Project, "name" | "area"> & Partial<Project>,
): { data: AppData; project: Project } {
  const at = nowISO();
  const project: Project = { status: "active", ...input, id: newId("prj"), createdAt: at, updatedAt: at };
  return { data: { ...data, projects: [...data.projects, project] }, project };
}

export function updateProject(data: AppData, id: string, patch: Partial<Project>): AppData {
  return {
    ...data,
    projects: data.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p)),
  };
}

export function addNote(data: AppData, input: Omit<Note, "id" | "createdAt">): AppData {
  const note: Note = { ...input, id: newId("note"), createdAt: nowISO() };
  return { ...data, notes: [...data.notes, note] };
}

/* ---------------------------------------------------------------------------
 * Decisões e atividade
 * ------------------------------------------------------------------------- */

export function addDecision(
  data: AppData,
  input: Omit<Decision, "id" | "createdAt" | "status">,
): AppData {
  if (input.dedupeKey && data.decisions.some((d) => d.dedupeKey === input.dedupeKey)) return data;
  const decision: Decision = { ...input, id: newId("dec"), createdAt: nowISO(), status: "pending" };
  return { ...data, decisions: [...data.decisions, decision] };
}

export function resolveDecision(
  data: AppData,
  id: string,
  status: Decision["status"],
  snoozedUntil?: ISODate,
): AppData {
  return {
    ...data,
    decisions: data.decisions.map((d) =>
      d.id === id
        ? {
            ...d,
            status,
            snoozedUntil: snoozedUntil ?? null,
            resolvedAt: status === "snoozed" ? null : nowISO(),
          }
        : d,
    ),
  };
}

export function logActivity(data: AppData, entry: Omit<AgentActivity, "id" | "at">): AppData {
  const a: AgentActivity = { ...entry, id: newId("act"), at: nowISO() };
  return { ...data, activity: [a, ...data.activity].slice(0, 200) };
}
