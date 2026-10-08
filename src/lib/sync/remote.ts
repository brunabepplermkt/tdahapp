/**
 * Contrato mínimo com o banco remoto. O motor de sincronização só conhece isto —
 * por baixo pode estar o Supabase (com a sessão e a RLS do usuário) ou um fake em memória.
 * Nenhuma implementação usa service role.
 */
import type { Row, SyncTable } from "./rows";

export type RemoteErrorKind = "network" | "auth" | "forbidden" | "constraint" | "unknown";

export class RemoteError extends Error {
  constructor(
    readonly kind: RemoteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RemoteError";
  }
  /** vale tentar de novo mais tarde sem ninguém mexer em nada */
  get retryable() {
    return this.kind === "network";
  }
}

export interface RemoteDb {
  /** dono dos dados (vem da sessão autenticada) */
  readonly userId: string;
  fetchAll(table: SyncTable): Promise<Row[]>;
  upsert(table: SyncTable, rows: Row[], opts?: { ignoreDuplicates?: boolean }): Promise<void>;
  remove(table: SyncTable, ids: string[]): Promise<void>;
}
