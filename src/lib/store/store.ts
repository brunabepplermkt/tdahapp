"use client";

/**
 * Store do cliente (Zustand + persistência).
 *
 * Toda mutação passa por `operations.ts` (puro). A persistência é feita pelo
 * `repository` configurado — hoje localStorage; Supabase depois, sem mudar UI.
 */
import { create } from "zustand";
import { todayISO } from "@/lib/domain/dates";
import * as ops from "@/lib/domain/operations";
import type { AppData, Decision, ISODate, Item, ItemDraft, Project } from "@/lib/domain/types";
import { buildDemoData, emptyData } from "@/lib/demo/demo-data";
import { getInterpreter, runAgentRules } from "@/lib/intelligence";
import { executeTool, runDecisionActions } from "@/lib/tools";
import type { PlanMove } from "@/lib/intelligence";
import { bindSyncHooks, useSync } from "@/lib/sync/controller";
import { repository } from "./repository";

export interface Toast {
  id: number;
  message: string;
  undo?: AppData;
}

interface StoreState {
  data: AppData;
  hydrated: boolean;
  toast: Toast | null;

  hydrate(): Promise<void>;
  /** aplica uma transformação pura e persiste */
  apply(fn: (d: AppData) => AppData, toast?: string, undoable?: boolean): void;
  showToast(message: string, undo?: AppData): void;
  dismissToast(): void;
  undo(): void;

  capture(text: string, opts?: { acceptNow?: boolean }): Promise<void>;
  acceptCapture(captureId: string, drafts: ItemDraft[]): void;
  addItem(input: ops.ItemInput): Item;
  updateItem(id: string, patch: Partial<Item>): void;
  toggleDone(id: string): void;
  postpone(id: string, to: ISODate | null, label?: string): void;
  someday(id: string): void;
  addProject(input: Pick<Project, "name" | "area"> & Partial<Project>): Project;
  approveDecision(decision: Decision): void;
  applyPlan(moves: PlanMove[]): void;
  runAgent(today: ISODate): void;
  resetDemo(): Promise<void>;
  clearAll(): Promise<void>;
  restoreBackup(key: string): Promise<boolean>;
}

let toastSeq = 0;
/** grava o estado atual e guarda uma cópia de segurança */
async function snapshot(reason: string, data: AppData) {
  await repository.save(data);
  await repository.backup(reason);
}

/**
 * Salva imediatamente. Sem debounce de propósito: no iPhone o app pode ser
 * fechado a qualquer momento, e a última ação não pode se perder.
 */
function persist(data: AppData) {
  void repository.save(data);
  useSync.getState().onLocalChange(); // no-op sem conta/migração
}

export const useStore = create<StoreState>((set, get) => ({
  data: emptyData(),
  hydrated: false,
  toast: null,

  async hydrate() {
    if (get().hydrated) return;
    const today = todayISO();
    let data = await repository.load();
    if (!data) {
      data = buildDemoData(today);
      await repository.save(data);
    }
    set({ data, hydrated: true });
    void useSync.getState().init();
  },

  apply(fn, toast, undoable = true) {
    const prev = get().data;
    const next = fn(prev);
    if (next === prev) return;
    set({ data: next });
    persist(next);
    if (toast) get().showToast(toast, undoable ? prev : undefined);
  },

  showToast(message, undo) {
    set({ toast: { id: ++toastSeq, message, undo } });
  },
  dismissToast() {
    set({ toast: null });
  },
  undo() {
    const t = get().toast;
    if (!t?.undo) return;
    set({ data: t.undo, toast: null });
    persist(t.undo);
  },

  async capture(text, opts) {
    const clean = text.trim();
    if (!clean) return;
    const data = get().data;
    const interpretation = await getInterpreter().interpret(clean, { today: todayISO(), projects: data.projects });
    const accept = !!opts?.acceptNow;
    let failure: string | null = null;
    get().apply(
      (d) => {
        const r = executeTool(
          d,
          { tool: "capture_item", input: { text: clean, accept } },
          { origin: "user_app", interpretation },
        );
        if (r.status === "error") {
          failure = r.error;
          return d;
        }
        return r.data;
      },
      accept ? "Organizado." : "Guardado na Inbox. Pode esquecer por agora.",
    );
    // nunca perder uma captura em silêncio
    if (failure) get().showToast(`Não consegui guardar: ${failure}`);
  },

  acceptCapture(captureId, drafts) {
    get().apply(
      (d) => executeTool(d, { tool: "accept_capture", input: { captureId, drafts } }, { origin: "user_app" }).data,
      drafts.length > 1 ? `${drafts.length} itens organizados.` : "Organizado.",
    );
  },

  addItem(input) {
    let created: Item | null = null;
    get().apply((d) => {
      const res = ops.addItem(d, input);
      created = res.item;
      return res.data;
    }, "Criado.");
    return created!;
  },

  updateItem(id, patch) {
    get().apply((d) => ops.updateItem(d, id, patch));
  },

  toggleDone(id) {
    const item = get().data.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "done") {
      get().apply((d) => ops.reopenItem(d, id), "Reaberto.");
    } else {
      const msg = item.money
        ? item.money.direction === "in"
          ? "Recebido. ✓"
          : "Pago. Um a menos."
        : "Feito. Um a menos.";
      get().apply(
        (d) =>
          executeTool(d, { tool: item.money ? "mark_paid" : "complete_item", input: { itemId: id } }, { origin: "user_app" })
            .data,
        msg,
      );
    }
  },

  postpone(id, to, label) {
    get().apply(
      (d) => executeTool(d, { tool: "snooze_item", input: { itemId: id, until: to } }, { origin: "user_app" }).data,
      label ? `Tudo bem. Volta ${label}.` : "Tirado do radar por enquanto.",
    );
  },

  someday(id) {
    get().apply((d) => ops.moveToSomeday(d, id), "Guardado em “algum dia”. Sem culpa.");
  },

  addProject(input) {
    let created: Project | null = null;
    get().apply((d) => {
      const res = ops.addProject(d, input);
      created = res.project;
      return res.data;
    }, "Projeto criado.");
    return created!;
  },

  approveDecision(decision) {
    get().apply((d) => {
      const r = runDecisionActions(d, decision);
      if (r.status === "error") {
        return ops.logActivity(d, { actor: "user", tool: "approve", summary: r.error, status: "error" });
      }
      return ops.resolveDecision(r.data, decision.id, "approved");
    }, "Feito.");
  },

  applyPlan(moves) {
    get().apply(
      (d) => {
        let next = d;
        for (const m of moves) {
          next = executeTool(
            next,
            { tool: "schedule_item", input: { itemId: m.itemId, date: m.to } },
            { origin: "user_app", silent: true },
          ).data;
        }
        return ops.logActivity(next, {
          actor: "user",
          tool: "apply_plan",
          summary: `Aplicou plano: ${moves.length} item(ns) com novo dia`,
          status: "ok",
        });
      },
      `${moves.length} ${moves.length === 1 ? "item planejado" : "itens planejados"}.`,
    );
  },

  runAgent(today) {
    get().apply((d) => runAgentRules(d, today), undefined, false);
  },

  async resetDemo() {
    await snapshot("antes de recriar a demonstração", get().data);
    get().apply(() => buildDemoData(todayISO()), "Dados de demonstração recriados. Backup guardado.", false);
  },

  async clearAll() {
    await snapshot("antes de começar do zero", get().data);
    get().apply(() => emptyData(), "Tudo limpo. Backup guardado em Mais.", false);
  },

  async restoreBackup(key) {
    const data = await repository.restoreBackup(key);
    if (!data) {
      get().showToast("Não consegui ler esse backup.");
      return false;
    }
    set({ data });
    get().showToast("Backup restaurado.");
    return true;
  },
}));

// o controlador de sincronização enxerga a store só por estas funções (sem import circular)
bindSyncHooks({
  getData: () => useStore.getState().data,
  setData: (data) => {
    useStore.setState({ data });
    void repository.save(data);
  },
  backup: (reason) => repository.backup(reason),
});
