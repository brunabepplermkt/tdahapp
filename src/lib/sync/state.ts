import { SYNC_TABLES, type SyncTable } from "./rows";

/** O que já foi enviado/recebido com sucesso: id remoto → hash da linha. */
export interface SyncState {
  v: 1;
  base: Record<SyncTable, Record<string, string>>;
  lastSyncAt?: string;
  /** a pessoa autorizou enviar os dados deste aparelho e a primeira reconciliação terminou */
  migratedAt?: string;
}

export const emptyState = (): SyncState => ({
  v: 1,
  base: Object.fromEntries(SYNC_TABLES.map((t) => [t, {}])) as SyncState["base"],
});

export interface SyncStateStore {
  load(userId: string): SyncState;
  save(userId: string, state: SyncState): void;
}

export class MemorySyncState implements SyncStateStore {
  private map = new Map<string, SyncState>();
  load(userId: string) {
    return structuredClone(this.map.get(userId) ?? emptyState());
  }
  save(userId: string, state: SyncState) {
    this.map.set(userId, structuredClone(state));
  }
}

const KEY = (userId: string) => `tdahapp:sync:v1:${userId}`;

export class LocalStorageSyncState implements SyncStateStore {
  load(userId: string): SyncState {
    try {
      const raw = window.localStorage.getItem(KEY(userId));
      if (raw) {
        const s = JSON.parse(raw) as SyncState;
        if (s?.v === 1 && s.base) return { ...emptyState(), ...s, base: { ...emptyState().base, ...s.base } };
      }
    } catch {
      /* estado ilegível = recomeçar a comparação (reenvia tudo; upsert é idempotente) */
    }
    return emptyState();
  }
  save(userId: string, state: SyncState) {
    try {
      window.localStorage.setItem(KEY(userId), JSON.stringify(state));
    } catch {
      /* sem espaço: o próximo sync reenvia o que faltar */
    }
  }
}
