/**
 * Repositório de dados.
 *
 * MVP: `LocalRepository` (localStorage do navegador — dados ficam só neste
 * aparelho). A interface existe para trocar por `SupabaseRepository`
 * (ver `supabase/migrations` e docs/ARQUITETURA.md) sem tocar na UI.
 */
import type { AppData } from "@/lib/domain/types";
import { DATA_VERSION } from "@/lib/demo/demo-data";

export interface DataRepository {
  readonly id: string;
  readonly label: string;
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "tdahapp:data:v1";

export class LocalRepository implements DataRepository {
  readonly id = "local";
  readonly label = "Neste aparelho (localStorage)";

  async load(): Promise<AppData | null> {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppData;
      if (!parsed || parsed.version !== DATA_VERSION || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // armazenamento cheio/bloqueado: o app continua funcionando em memória
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }
}

export const repository: DataRepository = new LocalRepository();
