import type { AgentActivity, AppData } from "@/lib/domain/types";

type Entity = { id: string };
const COLLECTIONS = ["items", "captures", "projects", "notes", "decisions", "activity"] as const;

/**
 * A sincronização leva tempo; a pessoa continua usando o app. Ao terminar, o
 * resultado (`merged`, calculado a partir de `snapshot`) é aplicado sobre o
 * estado ATUAL: o que a pessoa mexeu no meio do caminho nunca é sobrescrito.
 * Compara por identidade de objeto (as operações do domínio são imutáveis).
 */
export function rebaseData(snapshot: AppData, merged: AppData, current: AppData): AppData {
  if (current === snapshot) return merged;
  const out: AppData = { ...current };
  for (const key of COLLECTIONS) {
    const snap = new Map((snapshot[key] as Entity[]).map((e) => [e.id, e]));
    const mer = new Map((merged[key] as Entity[]).map((e) => [e.id, e]));
    const cur = current[key] as Entity[];
    const curIds = new Set(cur.map((e) => e.id));
    const next: Entity[] = [];
    for (const e of cur) {
      const s = snap.get(e.id);
      const m = mer.get(e.id);
      const untouched = s === e;
      if (untouched && !m) continue; // removido remotamente
      next.push(untouched && m ? m : e);
    }
    for (const [id, m] of mer) if (!snap.has(id) && !curIds.has(id)) next.push(m); // novo vindo do remoto
    if (key === "activity") {
      const at = (e: Entity) => (e as unknown as AgentActivity).at;
      next.sort((a, b) => at(b).localeCompare(at(a)));
    }
    (out as unknown as Record<string, Entity[]>)[key] = next;
  }
  return out;
}
