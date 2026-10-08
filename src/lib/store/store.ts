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
import { executeTool, runAgentRules, runDecisionActions } from "@/lib/intelligence";
import { getInterpreter } from "@/lib/intelligence";
import type { PlanMove } from "@/lib/intelligence";
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
  resetDemo(): void;
  clearAll(): void;
}

let toastSeq = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void repository.save(data);
  }, 150);
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
    get().apply(
      (d) => {
        const res = ops.addCapture(d, { text: clean, interpretation });
        let next = res.data;
        if (opts?.acceptNow) next = ops.acceptCapture(next, res.capture.id, interpretation.drafts);
        return ops.logActivity(next, {
          actor: "user",
          tool: "capture",
          summary: opts?.acceptNow ? `Capturou e organizou: “${clean}”` : `Capturou: “${clean}”`,
          status: "ok",
        });
      },
      opts?.acceptNow ? "Organizado." : "Guardado na Inbox. Pode esquecer por agora.",
    );
  },

  acceptCapture(captureId, drafts) {
    get().apply(
      (d) => executeTool(d, { tool: "accept_capture", input: { captureId, drafts } }, { actor: "user" }).data,
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
          executeTool(d, { tool: item.money ? "mark_paid" : "complete_item", input: { itemId: id } }, { actor: "user" })
            .data,
        msg,
      );
    }
  },

  postpone(id, to, label) {
    get().apply(
      (d) => executeTool(d, { tool: "postpone_item", input: { itemId: id, to } }, { actor: "user" }).data,
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
            { actor: "user", silent: true },
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

  resetDemo() {
    get().apply(() => buildDemoData(todayISO()), "Dados de demonstração recriados.");
  },

  clearAll() {
    get().apply(() => emptyData(), "Tudo limpo. Começando do zero.");
  },
}));
