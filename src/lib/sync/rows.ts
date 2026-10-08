/**
 * AppData ⇄ linhas do Postgres (snake_case, ids UUID).
 *
 * - Ids remotos são UUIDs DETERMINÍSTICOS de (usuário, id local): enviar a mesma
 *   coisa duas vezes cai na mesma linha (idempotência) e o id original volta em
 *   `local_id` (ida e volta sem perda).
 * - Referências quebradas (ex.: projeto apagado) viram null em vez de derrubar o
 *   envio inteiro por causa de uma chave estrangeira.
 * - `canonRow` normaliza o jeito que o Postgres devolve (timestamps, horas,
 *   números) para comparar linha local × remota sem falsos conflitos.
 */
import { stableStringify, hashHex, UUID_RE, uuidFrom } from "@/lib/domain/hash";
import { AUDIT_LIMIT } from "@/lib/domain/operations";
import type {
  AgentActivity,
  AppData,
  Capture,
  Decision,
  Item,
  Note,
  Project,
  ToolOrigin,
} from "@/lib/domain/types";

export type Row = Record<string, unknown>;
/** ordem de envio respeita chaves estrangeiras */
export const SYNC_TABLES = ["projects", "captures", "items", "notes", "decisions", "audit_log"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export type TableRows = Record<SyncTable, Row[]>;

export const emptyRows = (): TableRows => ({ projects: [], captures: [], items: [], notes: [], decisions: [], audit_log: [] });

/** tabelas append-only: nunca apagamos nem sobrescrevemos linhas existentes */
export const APPEND_ONLY: ReadonlySet<SyncTable> = new Set(["audit_log"]);

export function remoteId(userId: string, localId: string): string {
  return UUID_RE.test(localId) ? localId.toLowerCase() : uuidFrom(`${userId}:${localId}`);
}

type Kind = "text" | "ts" | "time" | "num" | "json" | "bool";
const COLS: Record<SyncTable, Record<string, Kind>> = {
  projects: {
    id: "text", local_id: "text", name: "text", area: "text", status: "text", current_state: "text", deadline: "text",
    aliases: "json", created_at: "ts", updated_at: "ts",
  },
  captures: {
    id: "text", local_id: "text", text: "text", status: "text", snoozed_until: "text", interpretation: "json",
    item_ids: "json", created_at: "ts",
  },
  items: {
    id: "text", local_id: "text", title: "text", notes: "text", kind: "text", area: "text", status: "text", priority: "text",
    focus_date: "text", due_date: "text", scheduled_date: "text", start_time: "time", end_time: "time",
    project_id: "text", parent_id: "text", people: "json", estimate_min: "num", amount_cents: "num",
    money_direction: "text", money_category: "text", settled: "bool", settled_at: "ts", recurrence_freq: "text",
    recurrence_interval: "num", series_id: "text", postpone_count: "num", capture_id: "text", history: "json",
    created_at: "ts", updated_at: "ts", completed_at: "ts",
  },
  notes: { id: "text", local_id: "text", body: "text", project_id: "text", item_id: "text", created_at: "ts" },
  decisions: {
    id: "text", local_id: "text", kind: "text", title: "text", context: "text", item_id: "text", project_id: "text",
    actions: "json", status: "text", snoozed_until: "text", dedupe_key: "text", created_by: "text", created_at: "ts",
    resolved_at: "ts",
  },
  audit_log: {
    id: "text", local_id: "text", origin: "text", actor: "text", tool: "text", summary: "text", status: "text",
    input: "json", entity_type: "text", entity_id: "text", change: "json", idempotency_key: "text", request_hash: "text",
    decision_id: "text", proposed_by: "text", at: "ts",
  },
};

/** forma única de uma linha, venha ela do app ou do Postgres */
export function canonRow(table: SyncTable, row: Row): Row {
  const out: Row = {};
  for (const [col, kind] of Object.entries(COLS[table])) {
    const v = row[col];
    if (v === undefined || v === null) {
      out[col] = null;
      continue;
    }
    switch (kind) {
      case "ts":
        out[col] = new Date(v as string).toISOString();
        break;
      case "time":
        out[col] = String(v).slice(0, 5);
        break;
      case "num":
        out[col] = Number(v);
        break;
      case "bool":
        out[col] = Boolean(v);
        break;
      case "json":
        out[col] = JSON.parse(stableStringify(v)); // chaves ordenadas, sem undefined
        break;
      default:
        out[col] = String(v);
    }
  }
  return out;
}

export const rowHash = (table: SyncTable, row: Row) => hashHex(stableStringify(canonRow(table, row)));

/** instante usado para desempatar edições concorrentes ("o último a escrever vence") */
export function rowStamp(table: SyncTable, row: Row): string {
  const c = canonRow(table, row);
  return String(c.updated_at ?? c.resolved_at ?? c.created_at ?? c.at ?? "");
}

export interface ToRowsResult {
  rows: TableRows;
  warnings: string[];
}

export function toRows(data: AppData, userId: string): ToRowsResult {
  const rid = (id: string) => remoteId(userId, id);
  const warnings: string[] = [];
  const projectIds = new Set(data.projects.map((p) => p.id));
  const itemIds = new Set(data.items.map((i) => i.id));
  const captureIds = new Set(data.captures.map((c) => c.id));
  const ref = (set: Set<string>, id: string | null | undefined, what: string): string | null => {
    if (!id) return null;
    if (set.has(id)) return rid(id);
    warnings.push(`${what}: referência a “${id}” não existe — gravada sem vínculo`);
    return null;
  };

  const projects = data.projects.map((p) => ({
    id: rid(p.id), local_id: p.id, name: p.name, area: p.area, status: p.status, current_state: p.currentState ?? null,
    deadline: p.deadline ?? null, aliases: p.aliases ?? [], created_at: p.createdAt, updated_at: p.updatedAt,
  }));

  const captures = data.captures.map((c) => ({
    id: rid(c.id), local_id: c.id, text: c.text, status: c.status, snoozed_until: c.snoozedUntil ?? null,
    interpretation: c.interpretation ?? null, item_ids: c.itemIds.filter((i) => itemIds.has(i)).map(rid),
    created_at: c.createdAt,
  }));

  // pais antes dos filhos (a FK parent_id exige a linha do pai já gravada)
  const depth = (i: Item): number => {
    let d = 0;
    let cur: Item | undefined = i;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = data.items.find((x) => x.id === cur!.parentId);
      d++;
    }
    return d;
  };
  const items = [...data.items]
    .map((i) => ({ i, d: depth(i) }))
    .sort((a, b) => a.d - b.d)
    .map(({ i }) => ({
      id: rid(i.id), local_id: i.id, title: i.title, notes: i.notes ?? null, kind: i.kind, area: i.area, status: i.status,
      priority: i.priority, focus_date: i.focusDate ?? null, due_date: i.dueDate ?? null,
      scheduled_date: i.scheduledDate ?? null, start_time: i.startTime ?? null, end_time: i.endTime ?? null,
      project_id: ref(projectIds, i.projectId, `item “${i.title}”`),
      parent_id: i.parentId === i.id ? null : ref(itemIds, i.parentId, `item “${i.title}”`),
      people: i.people ?? [], estimate_min: i.estimateMin ?? null,
      amount_cents: i.money?.amountCents ?? null, money_direction: i.money?.direction ?? null,
      money_category: i.money?.category ?? null, settled: i.money?.settled ?? false, settled_at: i.money?.settledAt ?? null,
      recurrence_freq: i.recurrence?.freq ?? null, recurrence_interval: i.recurrence?.interval ?? 1,
      series_id: i.recurrence?.seriesId ?? null, postpone_count: i.postponeCount,
      capture_id: ref(captureIds, i.captureId, `item “${i.title}”`), history: i.history,
      created_at: i.createdAt, updated_at: i.updatedAt, completed_at: i.completedAt ?? null,
    }));

  const notes = data.notes.map((n) => ({
    id: rid(n.id), local_id: n.id, body: n.body, project_id: ref(projectIds, n.projectId, "nota"),
    item_id: ref(itemIds, n.itemId, "nota"), created_at: n.createdAt,
  }));

  const decisions = data.decisions.map((d) => ({
    id: rid(d.id), local_id: d.id, kind: d.kind, title: d.title, context: d.context ?? null,
    item_id: ref(itemIds, d.itemId, "decisão"), project_id: ref(projectIds, d.projectId, "decisão"),
    actions: d.actions, status: d.status, snoozed_until: d.snoozedUntil ?? null, dedupe_key: d.dedupeKey ?? null,
    created_by: d.createdBy, created_at: d.createdAt, resolved_at: d.resolvedAt ?? null,
  }));

  const audit_log = data.activity.map((a) => ({
    id: rid(a.id), local_id: a.id, origin: a.origin ?? (a.actor === "agent" ? "agent" : a.actor === "system" ? "automation" : "user_app"),
    actor: a.actor, tool: a.tool, summary: a.summary, status: a.status, input: a.input ?? null,
    entity_type: a.entities?.[0]?.type ?? null, entity_id: a.entities?.[0]?.id ?? null,
    change: a.entities || a.change ? { entities: a.entities ?? [], fields: a.change ?? {} } : null,
    idempotency_key: a.idempotencyKey ?? null, request_hash: a.requestHash ?? null, decision_id: a.decisionId ?? null,
    proposed_by: a.proposedBy ?? null, at: a.at,
  }));

  return { rows: { projects, captures, items, notes, decisions, audit_log }, warnings };
}

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

/** Linhas → AppData (sem `version`; quem chama define). */
export function fromRows(rows: TableRows, refRows: TableRows = rows): Omit<AppData, "version"> {
  // uuid remoto → id local (ou o próprio uuid, para linhas criadas por outro escritor).
  // `refRows` permite converter só parte das linhas e ainda resolver referências para as outras.
  const local = new Map<string, string>();
  for (const t of SYNC_TABLES) for (const r of refRows[t]) local.set(String(r.id), String(r.local_id ?? r.id));
  const L = (id: unknown): string | null => (id ? (local.get(String(id)) ?? String(id)) : null);
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  const projects: Project[] = rows.projects.map((r) => ({
    id: L(r.id)!, name: String(r.name), area: r.area as Project["area"], status: r.status as Project["status"],
    currentState: opt(r.current_state as string | null), deadline: (r.deadline as string | null) ?? null,
    aliases: arr<string>(r.aliases), createdAt: canonRow("projects", r).created_at as string,
    updatedAt: canonRow("projects", r).updated_at as string,
  }));

  const captures: Capture[] = rows.captures.map((r) => ({
    id: L(r.id)!, text: String(r.text), status: r.status as Capture["status"],
    snoozedUntil: (r.snoozed_until as string | null) ?? null,
    interpretation: (r.interpretation as Capture["interpretation"]) ?? null,
    itemIds: arr<string>(r.item_ids).map((x) => L(x)!), createdAt: canonRow("captures", r).created_at as string,
  }));

  const items: Item[] = rows.items.map((r) => {
    const c = canonRow("items", r);
    const hasMoney = r.amount_cents !== null && r.amount_cents !== undefined;
    return {
      id: L(r.id)!, title: String(r.title), notes: opt(r.notes as string | null), kind: r.kind as Item["kind"],
      area: r.area as Item["area"], status: r.status as Item["status"], priority: r.priority as Item["priority"],
      focusDate: (r.focus_date as string | null) ?? null, dueDate: (r.due_date as string | null) ?? null,
      scheduledDate: (r.scheduled_date as string | null) ?? null,
      startTime: (c.start_time as string | null) ?? null, endTime: (c.end_time as string | null) ?? null,
      projectId: L(r.project_id), parentId: L(r.parent_id), people: arr<string>(r.people),
      estimateMin: (c.estimate_min as number | null) ?? null,
      money: hasMoney
        ? {
            amountCents: Number(r.amount_cents), direction: r.money_direction as "in" | "out",
            category: opt(r.money_category as string | null), settled: Boolean(r.settled),
            settledAt: opt(c.settled_at as string | null),
          }
        : null,
      recurrence: r.recurrence_freq
        ? {
            freq: r.recurrence_freq as NonNullable<Item["recurrence"]>["freq"],
            interval: Number(r.recurrence_interval ?? 1), seriesId: String(r.series_id ?? r.id),
          }
        : null,
      postponeCount: Number(r.postpone_count ?? 0), captureId: L(r.capture_id),
      history: arr(r.history), createdAt: c.created_at as string, updatedAt: c.updated_at as string,
      completedAt: (c.completed_at as string | null) ?? null,
    };
  });

  const notes: Note[] = rows.notes.map((r) => ({
    id: L(r.id)!, body: String(r.body), projectId: L(r.project_id), itemId: L(r.item_id),
    createdAt: canonRow("notes", r).created_at as string,
  }));

  const decisions: Decision[] = rows.decisions.map((r) => {
    const c = canonRow("decisions", r);
    return {
      id: L(r.id)!, kind: r.kind as Decision["kind"], title: String(r.title), context: opt(r.context as string | null),
      itemId: L(r.item_id), projectId: L(r.project_id), actions: arr(r.actions), status: r.status as Decision["status"],
      snoozedUntil: (r.snoozed_until as string | null) ?? null, dedupeKey: opt(r.dedupe_key as string | null),
      createdBy: r.created_by as Decision["createdBy"], createdAt: c.created_at as string,
      resolvedAt: (c.resolved_at as string | null) ?? null,
    };
  });

  const activity: AgentActivity[] = rows.audit_log
    .map((r) => {
      const ch = (r.change ?? null) as { entities?: AgentActivity["entities"]; fields?: AgentActivity["change"] } | null;
      return {
        id: L(r.id)!, at: canonRow("audit_log", r).at as string, actor: r.actor as AgentActivity["actor"],
        tool: String(r.tool), summary: String(r.summary), status: r.status as AgentActivity["status"],
        input: opt(r.input as Record<string, unknown> | null), origin: r.origin as ToolOrigin,
        entities: ch?.entities?.length ? ch.entities : undefined,
        change: ch?.fields && Object.keys(ch.fields).length ? ch.fields : undefined,
        idempotencyKey: opt(r.idempotency_key as string | null), requestHash: opt(r.request_hash as string | null),
        decisionId: opt(r.decision_id as string | null), proposedBy: opt(r.proposed_by as ToolOrigin | null),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, AUDIT_LIMIT);

  return { items, captures, projects, notes, decisions, activity };
}
