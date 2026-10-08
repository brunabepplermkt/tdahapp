/**
 * Backend remoto FALSO, em memória — para testes e desenvolvimento sem conta.
 * Imita o que importa do Supabase/Postgres:
 *   - isolamento por usuário (RLS): cada cliente só vê e altera as próprias linhas;
 *   - formatos do Postgres (timestamptz com +00:00, time com segundos, bigint);
 *   - chaves estrangeiras e unicidade (local_id, idempotência);
 *   - falhas de rede injetáveis, inclusive no meio de um envio.
 */
import { RemoteError, type RemoteDb } from "./remote";
import { APPEND_ONLY, SYNC_TABLES, type Row, type SyncTable } from "./rows";

type Store = Record<SyncTable, Map<string, Row>>;

const TS = new Set(["created_at", "updated_at", "settled_at", "completed_at", "resolved_at", "at"]);
const TIME = new Set(["start_time", "end_time"]);

function pgNormalize(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (TS.has(k) && typeof v === "string") out[k] = new Date(v).toISOString().replace("Z", "+00:00");
    else if (TIME.has(k) && typeof v === "string") out[k] = v.length === 5 ? `${v}:00` : v;
    else out[k] = v === undefined ? null : structuredClone(v);
  }
  return out;
}

const FKS: Partial<Record<SyncTable, [string, SyncTable][]>> = {
  items: [["project_id", "projects"], ["parent_id", "items"], ["capture_id", "captures"]],
  notes: [["project_id", "projects"], ["item_id", "items"]],
  decisions: [["project_id", "projects"], ["item_id", "items"]],
};

export class FakeBackend {
  readonly tables: Store = Object.fromEntries(SYNC_TABLES.map((t) => [t, new Map()])) as unknown as Store;
  offline = false;
  /** lança erro de rede na N-ésima próxima chamada de escrita (1 = a próxima) */
  private failWriteAt: number | null = null;
  writes = 0;
  calls: string[] = [];

  failWriteNumber(n: number) {
    this.failWriteAt = n;
  }

  client(userId: string): RemoteDb {
    return new FakeClient(this, userId);
  }

  /** linhas do usuário (para asserções) */
  rowsOf(userId: string, table: SyncTable): Row[] {
    return [...this.tables[table].values()].filter((r) => r.user_id === userId);
  }

  /** @internal */
  guard(write: boolean, what: string) {
    this.calls.push(what);
    if (this.offline) throw new RemoteError("network", "sem conexão");
    if (write) {
      this.writes++;
      if (this.failWriteAt !== null && --this.failWriteAt === 0) {
        this.failWriteAt = null;
        throw new RemoteError("network", "conexão caiu no meio do envio");
      }
    }
  }
}

class FakeClient implements RemoteDb {
  constructor(
    private backend: FakeBackend,
    readonly userId: string,
  ) {}

  async fetchAll(table: SyncTable): Promise<Row[]> {
    this.backend.guard(false, `fetch:${table}`);
    return this.backend.rowsOf(this.userId, table).map((r) => structuredClone(r));
  }

  async upsert(table: SyncTable, rows: Row[], opts: { ignoreDuplicates?: boolean } = {}): Promise<void> {
    this.backend.guard(true, `upsert:${table}`);
    const store = this.backend.tables;
    const pending = new Map<string, Row>();
    for (const input of rows) {
      const row = pgNormalize(input);
      const id = String(row.id);
      const existing = store[table].get(id);
      if (existing && existing.user_id !== this.userId) {
        throw new RemoteError("forbidden", "new row violates row-level security policy");
      }
      if (existing && opts.ignoreDuplicates) continue;
      if (existing && APPEND_ONLY.has(table)) continue;
      row.user_id = this.userId;
      pending.set(id, row);
    }
    // restrições avaliadas no fim do comando (como o Postgres): FK e unicidade
    for (const [id, row] of pending) {
      for (const [col, ref] of FKS[table] ?? []) {
        const target = row[col];
        if (target == null) continue;
        const t = String(target);
        const ok = (pending.has(t) && ref === table) || store[ref].get(t)?.user_id === this.userId;
        if (!ok) throw new RemoteError("constraint", `violates foreign key (${table}.${col})`);
      }
      if (row.local_id != null) {
        for (const other of store[table].values()) {
          if (other.user_id === this.userId && other.local_id === row.local_id && other.id !== id) {
            throw new RemoteError("constraint", `duplicate key (${table}.local_id)`);
          }
        }
      }
      if (table === "audit_log" && row.idempotency_key && ["ok", "proposed"].includes(String(row.status))) {
        for (const other of store.audit_log.values()) {
          if (
            other.user_id === this.userId && other.idempotency_key === row.idempotency_key && other.id !== id &&
            ["ok", "proposed"].includes(String(other.status))
          ) {
            throw new RemoteError("constraint", "duplicate key (audit_log idempotency)");
          }
        }
      }
    }
    for (const [id, row] of pending) store[table].set(id, row);
  }

  async remove(table: SyncTable, ids: string[]): Promise<void> {
    this.backend.guard(true, `remove:${table}`);
    if (APPEND_ONLY.has(table)) throw new RemoteError("forbidden", "audit_log é append-only");
    for (const id of ids) {
      const row = this.backend.tables[table].get(id);
      if (row && row.user_id === this.userId) this.backend.tables[table].delete(id); // de outro usuário: 0 linhas (RLS)
    }
  }
}
