/**
 * Migração dos dados salvos no aparelho.
 *
 * Regra: NUNCA descartar dados da pessoa em silêncio. Versões antigas passam
 * pelas migrações em sequência; qualquer coisa que não dê para entender
 * (versão futura, JSON corrompido) é guardada como backup antes de o app
 * começar de novo.
 */
import type { AppData } from "@/lib/domain/types";

export const CURRENT_VERSION = 1;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * `MIGRATIONS[n]` leva os dados da versão n para n + 1.
 * Ao mudar o formato de AppData: incremente CURRENT_VERSION e adicione aqui.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // exemplo para o futuro:
  // 1: (d) => ({ ...d, version: 2, items: (d.items as Item[]).map((i) => ({ ...i, novoCampo: null })) }),
};

export type MigrateResult =
  { status: "ok"; data: AppData; migratedFrom?: number } | { status: "unreadable"; reason: string };

const COLLECTIONS = ["items", "captures", "projects", "notes", "decisions", "activity"] as const;

/** Garante que todas as coleções existem (dados parciais não derrubam o app). */
function normalize(d: Record<string, unknown>): AppData {
  const out: Record<string, unknown> = { ...d };
  for (const k of COLLECTIONS) if (!Array.isArray(out[k])) out[k] = [];
  return out as unknown as AppData;
}

export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target = CURRENT_VERSION,
): MigrateResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { status: "unreadable", reason: "formato inválido" };
  let data = raw as Record<string, unknown>;
  const from = typeof data.version === "number" ? data.version : NaN;
  if (!Number.isInteger(from) || from < 1) return { status: "unreadable", reason: "sem versão" };
  if (from > target) return { status: "unreadable", reason: `versão ${from} é mais nova que este app (${target})` };

  for (let v = from; v < target; v++) {
    const step = migrations[v];
    if (!step) return { status: "unreadable", reason: `sem migração da versão ${v}` };
    data = step(data);
    if (data.version !== v + 1) return { status: "unreadable", reason: `migração ${v} não atualizou a versão` };
  }
  return { status: "ok", data: normalize(data), migratedFrom: from < target ? from : undefined };
}
