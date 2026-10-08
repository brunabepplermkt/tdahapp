"use client";

/**
 * Controlador de conta + sincronização (cliente).
 *
 * Sem variáveis do Supabase → status "unconfigured" e NADA acontece: o app
 * segue 100% local. Com configuração, o fluxo é sempre explícito:
 *   entrar (link por e-mail) → enviar dados deste aparelho (backup antes) → sincronizar.
 * O estado local é salvo primeiro; a rede é melhor esforço e se recupera sozinha.
 */
import { create } from "zustand";
import type { AppData } from "@/lib/domain/types";
import { readSupabaseConfig } from "./config";
import { SyncEngine, type SyncReport, type SyncResult } from "./engine";
import { rebaseData } from "./rebase";
import { LocalStorageSyncState } from "./state";

export type SyncStatus = "unconfigured" | "loading" | "signed_out" | "link_sent" | "ready" | "syncing" | "offline" | "error";

interface Hooks {
  getData(): AppData;
  /** aplica dados vindos do remoto: atualiza a store e salva localmente */
  setData(data: AppData): void;
  backup(reason: string): Promise<void>;
}

interface SyncStore {
  status: SyncStatus;
  email: string | null;
  migrated: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  heldDeletions: number;
  lastReport: SyncReport | null;
  init(): Promise<void>;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  migrate(): Promise<void>;
  syncNow(opts?: { allowMassDelete?: boolean }): Promise<void>;
  onLocalChange(): void;
}

let hooks: Hooks | null = null;
export function bindSyncHooks(h: Hooks) {
  hooks = h;
}

const stateStore = new LocalStorageSyncState();
let engine: SyncEngine | null = null;
let userId: string | null = null;
let client: import("@supabase/supabase-js").SupabaseClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let listenersAttached = false;

export const useSync = create<SyncStore>((set, get) => {
  const apply = (r: SyncResult, snapshot: AppData) => {
    if (!hooks) return;
    if (r.data !== snapshot) hooks.setData(rebaseData(snapshot, r.data, hooks.getData()));
    const st = r.state;
    if (r.ok) {
      set({
        status: "ready", lastSyncAt: st.lastSyncAt ?? null, migrated: !!st.migratedAt, lastError: null,
        heldDeletions: r.report.heldDeletions, lastReport: r.report,
      });
    } else {
      set({
        status: r.retryable ? "offline" : "error", lastError: r.error.message, lastReport: r.report,
        migrated: !!st.migratedAt,
      });
    }
  };

  /** uma operação de rede por vez; falhas nunca estouram para a UI */
  const enqueue = (job: () => Promise<void>) => {
    chain = chain.then(job).catch((e) => set({ status: "error", lastError: (e as Error).message }));
    return chain as Promise<void>;
  };

  const attachListeners = () => {
    if (listenersAttached || typeof window === "undefined") return;
    listenersAttached = true;
    window.addEventListener("online", () => void get().syncNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPush();
      else if (get().migrated) void get().syncNow();
    });
  };

  const flushPush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!engine || !hooks || !get().migrated) return;
    void enqueue(async () => {
      const snapshot = hooks!.getData();
      set({ status: "syncing" });
      apply(await engine!.push(snapshot), snapshot);
    });
  };

  const adoptSession = async (session: { user: { id: string; email?: string | null } } | null) => {
    if (!session || !client) {
      engine = null;
      userId = null;
      set({ status: "signed_out", email: null, migrated: false });
      return;
    }
    const { SupabaseRemote } = await import("./supabase");
    userId = session.user.id;
    engine = new SyncEngine(new SupabaseRemote(client, userId), stateStore);
    const st = engine.state();
    set({ status: "ready", email: session.user.email ?? null, migrated: !!st.migratedAt, lastSyncAt: st.lastSyncAt ?? null });
    attachListeners();
    if (st.migratedAt) void get().syncNow();
  };

  return {
    status: "unconfigured",
    email: null,
    migrated: false,
    lastSyncAt: null,
    lastError: null,
    heldDeletions: 0,
    lastReport: null,

    async init() {
      const cfg = readSupabaseConfig();
      if (!cfg) return set({ status: "unconfigured" });
      if (client) return;
      set({ status: "loading" });
      try {
        const { createSupabaseClient } = await import("./supabase");
        client = await createSupabaseClient(cfg);
        const { data } = await client.auth.getSession();
        client.auth.onAuthStateChange((_event, session) => void adoptSession(session));
        await adoptSession(data.session);
      } catch (e) {
        set({ status: "error", lastError: (e as Error).message });
      }
    },

    async signIn(email) {
      if (!client) return;
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
      });
      if (error) set({ status: "error", lastError: error.message });
      else set({ status: "link_sent", email: email.trim(), lastError: null });
    },

    async signOut() {
      // os dados locais ficam; só a conexão com a nuvem é encerrada
      await client?.auth.signOut();
      engine = null;
      userId = null;
      set({ status: "signed_out", email: null, migrated: false, lastSyncAt: null });
    },

    async migrate() {
      if (!engine || !hooks) return;
      await enqueue(async () => {
        const snapshot = hooks!.getData();
        set({ status: "syncing", lastError: null });
        await hooks!.backup("antes de enviar para a nuvem");
        apply(await engine!.reconcile(snapshot, { migrate: true }), snapshot);
      });
    },

    async syncNow(opts) {
      if (!engine || !hooks || !get().migrated) return;
      await enqueue(async () => {
        const snapshot = hooks!.getData();
        set({ status: "syncing" });
        apply(await engine!.reconcile(snapshot, { allowMassDelete: opts?.allowMassDelete }), snapshot);
      });
    },

    onLocalChange() {
      if (!engine || !get().migrated) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushPush, 1500);
    },
  };
});

export function syncUserId() {
  return userId;
}
