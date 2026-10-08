/**
 * Repositório de dados.
 *
 * MVP: `LocalRepository` (localStorage do navegador — dados ficam só neste
 * aparelho). A interface existe para trocar por `SupabaseRepository`
 * (ver `supabase/migrations` e docs/ARQUITETURA.md) sem tocar na UI.
 */
import type { AppData } from "@/lib/domain/types";
import { migrate } from "./migrate";

export interface BackupInfo {
  key: string;
  at: string;
  reason: string;
  items: number | null;
}

export interface DataRepository {
  readonly id: string;
  readonly label: string;
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
  /** guarda uma cópia do estado atual antes de algo destrutivo */
  backup(reason: string): Promise<void>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(key: string): Promise<AppData | null>;
}

const KEY = "tdahapp:data:v1";
const BACKUP_PREFIX = "tdahapp:backup:";
const MAX_BACKUPS = 5;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class LocalRepository implements DataRepository {
  readonly id = "local";
  readonly label = "Neste aparelho (localStorage)";

  async load(): Promise<AppData | null> {
    const ls = storage();
    const raw = ls?.getItem(KEY);
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.backupRaw(raw, "dados corrompidos");
      return null;
    }
    const result = migrate(parsed);
    if (result.status === "unreadable") {
      // não entendeu? guarda tudo antes de recomeçar — nada some em silêncio
      this.backupRaw(raw, result.reason);
      return null;
    }
    if (result.migratedFrom !== undefined) {
      this.backupRaw(raw, `antes de atualizar da versão ${result.migratedFrom}`);
      await this.save(result.data);
    }
    return result.data;
  }

  async save(data: AppData): Promise<void> {
    try {
      storage()?.setItem(KEY, JSON.stringify(data));
    } catch {
      // armazenamento cheio/bloqueado: o app continua funcionando em memória
    }
  }

  async clear(): Promise<void> {
    try {
      storage()?.removeItem(KEY);
    } catch {
      /* noop */
    }
  }

  async backup(reason: string): Promise<void> {
    const raw = storage()?.getItem(KEY);
    if (raw) this.backupRaw(raw, reason);
  }

  async listBackups(): Promise<BackupInfo[]> {
    const ls = storage();
    if (!ls) return [];
    const out: BackupInfo[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key?.startsWith(BACKUP_PREFIX)) continue;
      try {
        const env = JSON.parse(ls.getItem(key)!) as { at: string; reason: string; raw: string };
        let items: number | null = null;
        try {
          const d = JSON.parse(env.raw) as { items?: unknown[] };
          items = Array.isArray(d.items) ? d.items.length : null;
        } catch {
          /* backup de dados corrompidos */
        }
        out.push({ key, at: env.at, reason: env.reason, items });
      } catch {
        /* ignora entrada estranha */
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }

  async restoreBackup(key: string): Promise<AppData | null> {
    const ls = storage();
    const env = ls?.getItem(key);
    if (!env) return null;
    try {
      const { raw } = JSON.parse(env) as { raw: string };
      const result = migrate(JSON.parse(raw));
      if (result.status !== "ok") return null;
      await this.backup("antes de restaurar um backup");
      await this.save(result.data);
      return result.data;
    } catch {
      return null;
    }
  }

  private backupRaw(raw: string, reason: string) {
    const ls = storage();
    if (!ls) return;
    const at = new Date().toISOString();
    try {
      ls.setItem(`${BACKUP_PREFIX}${at}`, JSON.stringify({ at, reason, raw }));
    } catch {
      return; // sem espaço: não há o que fazer sem arriscar os dados atuais
    }
    // mantém só os mais recentes
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith(BACKUP_PREFIX)) keys.push(k);
    }
    keys
      .sort()
      .slice(0, Math.max(keys.length - MAX_BACKUPS, 0))
      .forEach((k) => ls.removeItem(k));
  }
}

export const repository: DataRepository = new LocalRepository();
