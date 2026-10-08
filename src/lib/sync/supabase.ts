/**
 * Adaptador do Supabase. Só é carregado (import dinâmico) se houver configuração.
 * Usa a sessão do PRÓPRIO usuário: tudo passa pela RLS. Não existe service role aqui.
 *
 * NÃO conectado a nenhuma conta neste bloco — ainda sem teste contra um projeto real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "./config";
import { RemoteError, type RemoteDb } from "./remote";
import type { Row, SyncTable } from "./rows";

export async function createSupabaseClient(cfg: SupabaseConfig): Promise<SupabaseClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

export function mapError(e: { message?: string; code?: string; status?: number } | unknown): RemoteError {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number };
  const msg = err.message ?? String(e);
  if (/fetch|network|timeout|offline|ECONN|ENOTFOUND/i.test(msg) && !err.code) return new RemoteError("network", msg);
  if (err.status === 401 || /jwt|not authenticated/i.test(msg) || err.code === "PGRST301") return new RemoteError("auth", msg);
  if (err.code === "42501" || err.status === 403) return new RemoteError("forbidden", msg);
  if (err.code?.startsWith("23")) return new RemoteError("constraint", msg);
  if (err.status !== undefined && err.status >= 500) return new RemoteError("network", msg);
  return new RemoteError("unknown", msg);
}

const PAGE = 1000;

export class SupabaseRemote implements RemoteDb {
  constructor(
    private client: SupabaseClient,
    readonly userId: string,
  ) {}

  async fetchAll(table: SyncTable): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client.from(table).select("*").order("id").range(from, from + PAGE - 1);
      if (error) throw mapError(error);
      out.push(...(data as Row[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async upsert(table: SyncTable, rows: Row[], opts: { ignoreDuplicates?: boolean } = {}): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: opts.ignoreDuplicates });
    if (error) throw mapError(error);
  }

  async remove(table: SyncTable, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client.from(table).delete().in("id", ids);
    if (error) throw mapError(error);
  }
}
