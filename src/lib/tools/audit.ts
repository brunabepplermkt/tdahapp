/**
 * Auditoria: descobre, de forma genérica, O QUE uma operação mudou comparando
 * o estado antes/depois — assim nenhuma ferramenta precisa descrever o próprio
 * efeito (e não dá para esquecer de auditar).
 */
import type { AppData, AuditEntity } from "@/lib/domain/types";
import { stableStringify } from "@/lib/domain/hash";

type Change = Record<string, Record<string, [unknown, unknown]>>;

const COLLECTIONS = [
  ["items", "item"],
  ["captures", "capture"],
  ["projects", "project"],
  ["notes", "note"],
  ["decisions", "decision"],
] as const;

/** campos que mudam em toda edição e só fazem barulho na trilha */
const NOISY = new Set(["history", "updatedAt"]);
const MAX_ENTITIES = 20;

function short(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (v === null || typeof v !== "object") return v;
  const s = stableStringify(v);
  return s.length > 200 ? `${s.slice(0, 197)}…` : s;
}

export function diffData(before: AppData, after: AppData): { entities: AuditEntity[]; change: Change } {
  const entities: AuditEntity[] = [];
  const change: Change = {};
  const push = (e: AuditEntity) => entities.length < MAX_ENTITIES && entities.push(e);

  for (const [key, type] of COLLECTIONS) {
    const prev = new Map((before[key] as { id: string }[]).map((e) => [e.id, e as Record<string, unknown>]));
    const next = new Map((after[key] as { id: string }[]).map((e) => [e.id, e as Record<string, unknown>]));
    for (const [id, now] of next) {
      const was = prev.get(id);
      if (!was) {
        push({ type, id, op: "create" });
        if (entities.length < MAX_ENTITIES) change[id] = { "*": [null, "criado"] };
        continue;
      }
      if (was === now) continue;
      const fields: Record<string, [unknown, unknown]> = {};
      for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
        if (NOISY.has(k)) continue;
        if (stableStringify(was[k]) !== stableStringify(now[k])) fields[k] = [short(was[k]), short(now[k])];
      }
      if (Object.keys(fields).length === 0) continue;
      push({ type, id, op: "update" });
      if (entities.length <= MAX_ENTITIES) change[id] = fields;
    }
    for (const id of prev.keys()) if (!next.has(id)) push({ type, id, op: "delete" });
  }
  return { entities, change };
}
