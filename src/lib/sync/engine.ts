/**
 * Motor de sincronização local ⇄ remoto (offline-first).
 *
 * Princípios:
 *  1. O estado local é sempre salvo primeiro; a rede é "melhor esforço".
 *  2. Compara LINHAS (hash canônico) com a última base sincronizada → só o que
 *     mudou trafega, e repetir qualquer operação é seguro (upsert por id estável).
 *  3. Três vias (local × remoto × base): edição só de um lado vence sem conflito;
 *     dos dois lados, vence o mais recente (updated_at), empate fica com o local.
 *  4. Apagar só propaga o que JÁ foi sincronizado antes; a migração inicial nunca apaga nada.
 *  5. Falha no meio do caminho mantém o progresso: a base só avança em lotes confirmados.
 *  6. Remoções em massa ficam retidas até a pessoa confirmar (proteção contra "recriar demo").
 */
import type { AppData } from "@/lib/domain/types";
import { AUDIT_LIMIT } from "@/lib/domain/operations";
import { RemoteError, type RemoteDb } from "./remote";
import {
  APPEND_ONLY,
  emptyRows,
  fromRows,
  rowHash,
  rowStamp,
  SYNC_TABLES,
  toRows,
  type Row,
  type SyncTable,
  type TableRows,
} from "./rows";
import { emptyState, type SyncState, type SyncStateStore } from "./state";

export interface SyncReport {
  pushed: number;
  pulled: number;
  deletedRemote: number;
  deletedLocal: number;
  conflicts: number;
  /** remoções locais que NÃO foram enviadas por serem em massa (aguardam confirmação) */
  heldDeletions: number;
  warnings: string[];
}

/**
 * `commit()` registra na base o que veio do remoto. Só deve ser chamado DEPOIS de os
 * dados mesclados terem sido salvos localmente: se o app fechar antes, a próxima
 * sincronização simplesmente traz tudo de novo (nunca confunde "ainda não aplicado"
 * com "apagado aqui").
 */
export type SyncResult =
  | { ok: true; data: AppData; report: SyncReport; state: SyncState; commit(): void }
  | { ok: false; data: AppData; report: SyncReport; state: SyncState; error: Error; retryable: boolean; commit(): void };

export interface EngineOptions {
  chunkSize?: number;
}

interface Plan {
  upserts: TableRows;
  deleteRemote: Record<SyncTable, string[]>;
  adopt: TableRows;
  deleteLocal: Record<SyncTable, string[]>;
  base: SyncState["base"];
  /** mudanças de base que dependem de o dado local já ter sido aplicado */
  deferred: { set: Record<SyncTable, Record<string, string>>; del: Record<SyncTable, string[]> };
  conflicts: number;
}

const emptyIds = (): Record<SyncTable, string[]> => ({
  projects: [], captures: [], items: [], notes: [], decisions: [], audit_log: [],
});
const newReport = (): SyncReport => ({
  pushed: 0, pulled: 0, deletedRemote: 0, deletedLocal: 0, conflicts: 0, heldDeletions: 0, warnings: [],
});
const count = (r: Record<SyncTable, unknown[]>) => SYNC_TABLES.reduce((n, t) => n + r[t].length, 0);

export class SyncEngine {
  private chunk: number;
  constructor(
    private remote: RemoteDb,
    private store: SyncStateStore,
    opts: EngineOptions = {},
  ) {
    this.chunk = opts.chunkSize ?? 200;
  }

  get userId() {
    return this.remote.userId;
  }

  state(): SyncState {
    return this.store.load(this.userId);
  }

  /** Caminho rápido (a cada salvamento): só envia o que mudou. Não lê o remoto. */
  async push(data: AppData, opts: { allowMassDelete?: boolean } = {}): Promise<SyncResult> {
    const state = this.state();
    const report = newReport();
    const { rows, warnings } = toRows(data, this.userId);
    report.warnings.push(...warnings);

    const plan = this.emptyPlan(state.base);
    for (const t of SYNC_TABLES) {
      const seen = new Set<string>();
      for (const row of rows[t]) {
        const id = String(row.id);
        seen.add(id);
        const h = rowHash(t, row);
        if (state.base[t][id] === h) continue;
        plan.upserts[t].push(row);
      }
      if (!APPEND_ONLY.has(t)) for (const id of Object.keys(state.base[t])) if (!seen.has(id)) plan.deleteRemote[t].push(id);
    }
    return this.execute(data, state, plan, report, opts.allowMassDelete ?? false);
  }

  /**
   * Reconciliação completa (lê o remoto): usada ao abrir, ao voltar ao app, no
   * "sincronizar agora" e na migração inicial (`migrate: true` ⇒ nunca apaga nada).
   */
  async reconcile(data: AppData, opts: { migrate?: boolean; allowMassDelete?: boolean } = {}): Promise<SyncResult> {
    const state = this.state();
    const report = newReport();
    const { rows: localRows, warnings } = toRows(data, this.userId);
    report.warnings.push(...warnings);

    const remoteRows = emptyRows();
    try {
      for (const t of SYNC_TABLES) remoteRows[t] = await this.remote.fetchAll(t);
    } catch (e) {
      return this.fail(data, state, report, e);
    }

    const plan = this.plan(localRows, remoteRows, state.base, !opts.migrate);
    report.conflicts = plan.conflicts;

    // 1) aplica localmente o que veio do remoto (puro; nunca depende da rede)
    let merged = data;
    if (count(plan.adopt) + count(plan.deleteLocal) > 0) {
      merged = this.applyRemote(data, plan, localRows, remoteRows);
      report.pulled = count(plan.adopt);
      report.deletedLocal = count(plan.deleteLocal);
    }
    state.base = plan.base;
    this.store.save(this.userId, state);

    // 2) envia o que é só local
    return this.execute(merged, state, plan, report, opts.allowMassDelete ?? false, opts.migrate);
  }

  /* ------------------------------------------------------------------ plano */

  private emptyPlan(base: SyncState["base"]): Plan {
    return {
      upserts: emptyRows(), deleteRemote: emptyIds(), adopt: emptyRows(), deleteLocal: emptyIds(), base,
      deferred: {
        set: Object.fromEntries(SYNC_TABLES.map((t) => [t, {}])) as Plan["deferred"]["set"],
        del: emptyIds(),
      },
      conflicts: 0,
    };
  }

  private plan(local: TableRows, remote: TableRows, baseIn: SyncState["base"], allowDeletes: boolean): Plan {
    const plan = this.emptyPlan(structuredClone(baseIn));
    for (const t of SYNC_TABLES) {
      const base = plan.base[t];
      const L = new Map(local[t].map((r) => [String(r.id), r]));
      const R = new Map(remote[t].map((r) => [String(r.id), r]));
      const ids = new Set([...L.keys(), ...R.keys(), ...Object.keys(base)]);
      const append = APPEND_ONLY.has(t);
      for (const id of ids) {
        const l = L.get(id);
        const r = R.get(id);
        const b = allowDeletes ? base[id] : undefined;
        const lh = l && rowHash(t, l);
        const rh = r && rowHash(t, r);
        if (l && r) {
          if (lh === rh) base[id] = lh!;
          else if (append) base[id] = rh!;
          else if (b === lh) this.adopt(plan, t, r, rh!);
          else if (b === rh) plan.upserts[t].push(l);
          else {
            plan.conflicts++;
            if (rowStamp(t, r) > rowStamp(t, l)) this.adopt(plan, t, r, rh!);
            else plan.upserts[t].push(l);
          }
        } else if (l) {
          if (append || b === undefined || lh !== b) plan.upserts[t].push(l);
          else {
            plan.deleteLocal[t].push(id); // já estava sincronizado e sumiu do remoto
            plan.deferred.del[t].push(id);
          }
        } else if (r) {
          if (append || b === undefined || rh !== b) this.adopt(plan, t, r, rh!);
          else plan.deleteRemote[t].push(id); // já estava sincronizado e foi apagado aqui
        } else delete base[id];
      }
    }
    return plan;
  }

  private adopt(plan: Plan, t: SyncTable, row: Row, hash: string) {
    plan.adopt[t].push(row);
    plan.deferred.set[t][String(row.id)] = hash;
  }

  private applyRemote(data: AppData, plan: Plan, local: TableRows, remote: TableRows): AppData {
    const all: TableRows = emptyRows();
    for (const t of SYNC_TABLES) all[t] = [...local[t], ...remote[t]];
    const adopted = fromRows(plan.adopt, all);
    const localId = (t: SyncTable, remoteId: string) =>
      String((local[t].find((r) => String(r.id) === remoteId)?.local_id as string | undefined) ?? remoteId);
    const drop = (t: SyncTable) => new Set(plan.deleteLocal[t].map((id) => localId(t, id)));
    const merge = <T extends { id: string }>(current: T[], incoming: T[], removed: Set<string>) => {
      const inc = new Map(incoming.map((x) => [x.id, x]));
      const kept = current.filter((x) => !removed.has(x.id)).map((x) => inc.get(x.id) ?? x);
      const have = new Set(kept.map((x) => x.id));
      return [...kept, ...incoming.filter((x) => !have.has(x.id))];
    };
    return {
      ...data,
      projects: merge(data.projects, adopted.projects, drop("projects")),
      captures: merge(data.captures, adopted.captures, drop("captures")),
      items: merge(data.items, adopted.items, drop("items")),
      notes: merge(data.notes, adopted.notes, drop("notes")),
      decisions: merge(data.decisions, adopted.decisions, drop("decisions")),
      activity: merge(data.activity, adopted.activity, new Set())
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, AUDIT_LIMIT),
    };
  }

  /* ------------------------------------------------------------------- rede */

  private async execute(
    data: AppData,
    state: SyncState,
    plan: Plan,
    report: SyncReport,
    allowMassDelete: boolean,
    migrating = false,
  ): Promise<SyncResult> {
    // proteção: muitas remoções de uma vez ficam retidas
    const total = SYNC_TABLES.reduce((n, t) => n + Object.keys(state.base[t]).length, 0);
    const dels = count(plan.deleteRemote);
    if (dels > 0 && !allowMassDelete && dels > Math.max(5, total * 0.5)) {
      report.heldDeletions = dels;
      plan.deleteRemote = emptyIds();
    }

    try {
      for (const t of SYNC_TABLES) {
        const rows = plan.upserts[t];
        for (let i = 0; i < rows.length; i += this.chunk) {
          const batch = rows.slice(i, i + this.chunk);
          try {
            await this.remote.upsert(t, batch, { ignoreDuplicates: APPEND_ONLY.has(t) });
          } catch (e) {
            // auditoria nunca trava os dados: conflito de restrição vira aviso
            if (APPEND_ONLY.has(t) && e instanceof RemoteError && e.kind === "constraint") {
              report.warnings.push(`auditoria: ${e.message}`);
              break;
            }
            throw e;
          }
          for (const r of batch) state.base[t][String(r.id)] = rowHash(t, r);
          report.pushed += batch.length;
          this.store.save(this.userId, state);
        }
      }
      for (const t of [...SYNC_TABLES].reverse()) {
        const ids = plan.deleteRemote[t];
        for (let i = 0; i < ids.length; i += this.chunk) {
          const batch = ids.slice(i, i + this.chunk);
          await this.remote.remove(t, batch);
          for (const id of batch) delete state.base[t][id];
          report.deletedRemote += batch.length;
          this.store.save(this.userId, state);
        }
      }
    } catch (e) {
      return this.fail(data, state, report, e, this.committer(plan));
    }

    state.lastSyncAt = new Date().toISOString();
    if (migrating) state.migratedAt ??= state.lastSyncAt;
    this.store.save(this.userId, state);
    return { ok: true, data, report, state, commit: this.committer(plan) };
  }

  private committer(plan: Plan): () => void {
    return () => {
      const st = this.store.load(this.userId);
      for (const t of SYNC_TABLES) {
        Object.assign(st.base[t], plan.deferred.set[t]);
        for (const id of plan.deferred.del[t]) delete st.base[t][id];
      }
      this.store.save(this.userId, st);
    };
  }

  private fail(data: AppData, state: SyncState, report: SyncReport, e: unknown, commit: () => void = () => undefined): SyncResult {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, data, report, state, error, retryable: error instanceof RemoteError ? error.retryable : false, commit };
  }
}

export { emptyState };
