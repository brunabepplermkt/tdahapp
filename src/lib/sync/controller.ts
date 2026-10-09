"use client";

/**
 * Controlador de conta + sincronização (cliente).
 *
 * Sem variáveis do Supabase → status "unconfigured" e NADA acontece: o app
 * segue 100% local. Com configuração (modo conta):
 *   entrar (e-mail + senha) → dados locais separados por pessoa → envio/sincronização automáticos.
 * O estado local é salvo primeiro; a rede é melhor esforço e se recupera sozinha.
 */
import { create } from "zustand";
import type { AppData } from "@/lib/domain/types";
import { readSupabaseConfig } from "./config";
import { SyncEngine, type SyncReport, type SyncResult } from "./engine";
import { authErrorMessage, checkCredentials } from "./auth-errors";
import { rebaseData } from "./rebase";
import { emptyState, LocalStorageSyncState } from "./state";

export type SyncStatus =
  | "unconfigured"
  | "loading"
  | "signed_out"
  /** conta criada; falta confirmar o e-mail */
  | "confirm_email"
  | "ready"
  | "syncing"
  | "offline"
  | "error";

interface Hooks {
  getData(): AppData;
  /** aplica dados vindos do remoto: atualiza a store e salva localmente */
  setData(data: AppData): void;
  backup(reason: string): Promise<void>;
  /** troca o espaço local para a pessoa (ou tranca, com `null`) */
  switchUser(userId: string | null): Promise<{ fresh: boolean }>;
}

interface SyncStore {
  status: SyncStatus;
  /** há uma pessoa autenticada neste aparelho */
  signedIn: boolean;
  /** abriu o link de “esqueci a senha”: precisa definir a nova antes de usar o app */
  recovery: boolean;
  /** uma chamada de login/cadastro em andamento */
  busy: boolean;
  /** aviso positivo (ex.: “enviei um e-mail”) */
  notice: string | null;
  email: string | null;
  migrated: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  heldDeletions: number;
  lastReport: SyncReport | null;
  init(): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
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
let initStarted = false;

export const useSync = create<SyncStore>((set, get) => {
  const apply = (r: SyncResult, snapshot: AppData) => {
    if (!hooks) return;
    if (r.data !== snapshot) hooks.setData(rebaseData(snapshot, r.data, hooks.getData()));
    r.commit(); // só agora o que veio do remoto conta como "já aplicado aqui"
    const st = engine?.state() ?? r.state;
    if (r.ok) {
      set({
        status: "ready",
        lastSyncAt: st.lastSyncAt ?? null,
        migrated: !!st.migratedAt,
        lastError: null,
        heldDeletions: r.report.heldDeletions,
        lastReport: r.report,
      });
    } else {
      set({
        status: r.retryable ? "offline" : "error",
        lastError: r.error.message,
        lastReport: r.report,
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
      const eng = engine!;
      const snapshot = hooks!.getData();
      set({ status: "syncing" });
      const result = await eng.push(snapshot);
      if (eng !== engine) return; // a pessoa trocou/saiu no meio: o resultado é de outra conta
      apply(result, snapshot);
    });
  };

  const adoptSession = async (session: { user: { id: string; email?: string | null } } | null) => {
    if (timer) clearTimeout(timer); // nada agendado de uma conta anterior
    timer = null;
    if (!session || !client) {
      engine = null;
      userId = null;
      await hooks?.switchUser(null);
      set({ status: "signed_out", signedIn: false, recovery: false, email: null, migrated: false, lastSyncAt: null });
      return;
    }
    const { SupabaseRemote } = await import("./supabase");
    userId = session.user.id;
    // cada pessoa tem o seu espaço local: nada se mistura entre contas no mesmo aparelho
    const { fresh } = (await hooks?.switchUser(userId)) ?? { fresh: false };
    // sem dados locais desta pessoa, o histórico de sincronização não vale: se valesse, “nada aqui”
    // seria lido como “apaguei tudo” e a nuvem seria esvaziada. Recomeça só trazendo (nunca apaga).
    if (fresh) stateStore.save(userId, emptyState());
    engine = new SyncEngine(new SupabaseRemote(client, userId), stateStore);
    const st = engine.state();
    set({
      status: "ready",
      signedIn: true,
      email: session.user.email ?? null,
      migrated: !!st.migratedAt,
      lastSyncAt: st.lastSyncAt ?? null,
      lastError: null,
      notice: null,
    });
    attachListeners();
    // primeira vez nesta conta/aparelho: reconcilia sem apagar nada (traz o que já está na nuvem)
    if (st.migratedAt) void get().syncNow();
    else void get().migrate();
  };

  return {
    status: "unconfigured",
    signedIn: false,
    recovery: false,
    busy: false,
    notice: null,
    email: null,
    migrated: false,
    lastSyncAt: null,
    lastError: null,
    heldDeletions: 0,
    lastReport: null,

    async init() {
      const cfg = readSupabaseConfig();
      if (!cfg) return set({ status: "unconfigured" });
      if (initStarted) return;
      initStarted = true;
      set({ status: "loading" });
      try {
        const { createSupabaseClient } = await import("./supabase");
        client = await createSupabaseClient(cfg);
        const { data } = await client.auth.getSession();
        client.auth.onAuthStateChange((event, session) => {
          if (event === "PASSWORD_RECOVERY") {
            set({ recovery: true });
            void adoptSession(session);
          } else if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
            void adoptSession(session);
          }
        });
        await adoptSession(data.session);
      } catch (e) {
        initStarted = false;
        set({ status: "error", signedIn: false, lastError: authErrorMessage(e) });
      }
    },

    async signUp(email, password) {
      if (!client) return;
      const check = checkCredentials(email, password);
      if (!check.ok) return set({ lastError: check.error ?? null, notice: null });
      set({ busy: true, lastError: null, notice: null });
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return set({ busy: false, lastError: authErrorMessage(error) });
      // e-mail já cadastrado: o Supabase não acusa erro (para não revelar contas), mas não traz identidades
      if (data.user && (data.user.identities?.length ?? 1) === 0) {
        return set({ busy: false, lastError: authErrorMessage({ code: "user_already_exists" }) });
      }
      if (!data.session) {
        return set({
          busy: false,
          status: "confirm_email",
          notice: "Enviei um e-mail para confirmar. Abra o link e volte aqui para entrar.",
        });
      }
      set({ busy: false }); // com sessão, o evento SIGNED_IN assume
    },

    async signIn(email, password) {
      if (!client) return;
      const check = checkCredentials(email, password);
      if (!check.ok) return set({ lastError: check.error ?? null, notice: null });
      set({ busy: true, lastError: null, notice: null });
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      set({ busy: false, ...(error ? { lastError: authErrorMessage(error) } : {}) });
    },

    async resetPassword(email) {
      if (!client) return;
      const check = checkCredentials(email, "", { needPassword: false });
      if (!check.ok) return set({ lastError: check.error ?? null, notice: null });
      set({ busy: true, lastError: null, notice: null });
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) return set({ busy: false, lastError: authErrorMessage(error) });
      // mesma resposta exista a conta ou não
      set({ busy: false, notice: "Se esse e-mail tiver conta, enviei um link para criar a nova senha." });
    },

    async updatePassword(password) {
      if (!client) return;
      const check = checkCredentials("x@x.xx", password);
      if (!check.ok) return set({ lastError: check.error ?? null });
      set({ busy: true, lastError: null });
      const { error } = await client.auth.updateUser({ password });
      if (error) return set({ busy: false, lastError: authErrorMessage(error) });
      set({ busy: false, recovery: false, notice: "Senha trocada." });
    },

    async signOut() {
      await client?.auth.signOut();
      await adoptSession(null);
    },

    async migrate() {
      if (!engine || !hooks) return;
      const eng = engine;
      await enqueue(async () => {
        if (eng !== engine) return;
        const snapshot = hooks!.getData();
        set({ status: "syncing", lastError: null });
        await hooks!.backup("antes de enviar para a nuvem");
        const result = await eng.reconcile(snapshot, { migrate: true });
        if (eng !== engine) return;
        apply(result, snapshot);
      });
    },

    async syncNow(opts) {
      if (!engine || !hooks || !get().migrated) return;
      const eng = engine;
      await enqueue(async () => {
        if (eng !== engine) return;
        const snapshot = hooks!.getData();
        set({ status: "syncing" });
        const result = await eng.reconcile(snapshot, { allowMassDelete: opts?.allowMassDelete });
        if (eng !== engine) return;
        apply(result, snapshot);
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
