/**
 * Fluxo de contas ponta a ponta com Supabase FALSO (auth em memória + FakeBackend com RLS).
 * Não prova nada sobre um projeto Supabase real — prova a nossa lógica: separação entre
 * pessoas, envio automático, sair/entrar e erros em português.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "@/lib/demo/demo-data";
import { addItem } from "@/lib/domain/operations";
import type { AppData } from "@/lib/domain/types";
import { FakeBackend } from "./fake-remote";

const backend = new FakeBackend();
type Listener = (event: string, session: unknown) => void;

/** Auth falso: cadastros em memória, sessão única, eventos como no supabase-js. */
class FakeAuth {
  users = new Map<string, { id: string; password: string }>();
  session: { user: { id: string; email: string } } | null = null;
  listeners: Listener[] = [];
  private emit(event: string) {
    for (const l of this.listeners) l(event, this.session);
  }
  async getSession() {
    return { data: { session: this.session } };
  }
  onAuthStateChange(l: Listener) {
    this.listeners.push(l);
  }
  async signUp({ email, password }: { email: string; password: string }) {
    if (this.users.has(email)) return { data: { user: { identities: [] }, session: null }, error: null };
    const id = `00000000-0000-4000-8000-${String(this.users.size + 1).padStart(12, "0")}`;
    this.users.set(email, { id, password });
    this.session = { user: { id, email } };
    queueMicrotask(() => this.emit("SIGNED_IN"));
    return { data: { user: { identities: [{}] }, session: this.session }, error: null };
  }
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const u = this.users.get(email);
    if (!u || u.password !== password) {
      return { data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } };
    }
    this.session = { user: { id: u.id, email } };
    queueMicrotask(() => this.emit("SIGNED_IN"));
    return { data: { session: this.session }, error: null };
  }
  async signOut() {
    this.session = null;
    this.emit("SIGNED_OUT");
    return { error: null };
  }
}

const auth = new FakeAuth();
vi.mock("./supabase", () => ({
  createSupabaseClient: async () => ({ auth }),
  SupabaseRemote: class {
    constructor(
      _c: unknown,
      readonly userId: string,
    ) {
      return backend.client(userId);
    }
  },
}));

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

async function setup() {
  vi.resetModules();
  mem.clear();
  auth.users.clear();
  auth.session = null;
  auth.listeners = [];
  Object.assign(globalThis, {
    window: { localStorage: ls, location: { origin: "https://leve.test" }, addEventListener: () => undefined },
    document: { addEventListener: () => undefined, visibilityState: "visible" },
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
  const { useSync, bindSyncHooks } = await import("./controller");
  let local: AppData = emptyData();
  let current: string | null = null;
  const perUser = new Map<string, AppData>(); // o que o repositório guarda por pessoa
  const switched: (string | null)[] = [];
  const hooks = {
    getData: () => local,
    setData: (d: AppData) => void (local = d),
    backup: async () => undefined,
    switchUser: async (id: string | null) => {
      switched.push(id);
      if (current) perUser.set(current, local);
      current = id;
      if (!id) {
        local = emptyData();
        return { fresh: false };
      }
      const saved = perUser.get(id);
      local = saved ?? emptyData();
      return { fresh: !saved };
    },
  };
  bindSyncHooks(hooks);
  await useSync.getState().init();
  return {
    useSync,
    getLocal: () => local,
    setLocal: (d: AppData) => void (local = d),
    switched,
    forgetLocal: (id: string) => perUser.delete(id),
  };
}

beforeEach(() => {
  backend.offline = false;
});

describe("contas (modo conta)", () => {
  it("sem sessão: fica deslogado e o app tranca (switchUser(null))", async () => {
    const { useSync, switched } = await setup();
    const s = useSync.getState();
    expect(s.status).toBe("signed_out");
    expect(s.signedIn).toBe(false);
    expect(switched).toEqual([null]);
  });

  it("valida e-mail e senha antes de ir à rede, em português", async () => {
    const { useSync } = await setup();
    await useSync.getState().signUp("sem-arroba", "12345678");
    expect(useSync.getState().lastError).toMatch(/e-mail/);
    await useSync.getState().signUp("a@b.co", "curta");
    expect(useSync.getState().lastError).toMatch(/8 caracteres/);
    expect(auth.users.size).toBe(0);
  });

  it("cria conta, entra e envia os dados para a nuvem sozinho", async () => {
    const { useSync, getLocal, setLocal, switched } = await setup();
    await useSync.getState().signUp("ana@teste.com", "senha-forte-1");
    await settle();
    const s = useSync.getState();
    expect(s.signedIn).toBe(true);
    expect(s.email).toBe("ana@teste.com");
    expect(s.migrated).toBe(true);
    expect(switched.at(-1)).toBe("00000000-0000-4000-8000-000000000001");

    setLocal(
      addItem(getLocal(), { title: "Ligar pro dentista", kind: "task", area: "personal", priority: "normal" }).data,
    );
    useSync.getState().onLocalChange();
    await new Promise((r) => setTimeout(r, 1700));
    await settle();
    const rows = backend.rowsOf("00000000-0000-4000-8000-000000000001", "items");
    expect(rows.map((r) => r.title)).toContain("Ligar pro dentista");
  });

  it("e-mail repetido e senha errada dão mensagens claras", async () => {
    const { useSync } = await setup();
    await useSync.getState().signUp("ana@teste.com", "senha-forte-1");
    await settle();
    await useSync.getState().signOut();
    await useSync.getState().signUp("ana@teste.com", "outra-senha-9");
    expect(useSync.getState().lastError).toMatch(/já tem conta/);
    await useSync.getState().signIn("ana@teste.com", "errada-errada");
    expect(useSync.getState().lastError).toBe("E-mail ou senha incorretos.");
    expect(useSync.getState().signedIn).toBe(false);
  });

  it("duas pessoas no mesmo aparelho não veem nem recebem dados uma da outra", async () => {
    const { useSync, getLocal, setLocal } = await setup();
    await useSync.getState().signUp("ana@teste.com", "senha-forte-1");
    await settle();
    setLocal(addItem(getLocal(), { title: "Segredo da Ana", kind: "task", area: "personal", priority: "normal" }).data);
    useSync.getState().onLocalChange();
    await new Promise((r) => setTimeout(r, 1700));
    await settle();

    await useSync.getState().signOut();
    expect(useSync.getState().signedIn).toBe(false);
    expect(getLocal().items).toHaveLength(0); // sair esvazia a memória

    await useSync.getState().signUp("bia@teste.com", "senha-forte-2");
    await settle();
    expect(useSync.getState().email).toBe("bia@teste.com");
    expect(getLocal().items.map((i) => i.title)).not.toContain("Segredo da Ana");
    expect(backend.rowsOf("00000000-0000-4000-8000-000000000002", "items")).toHaveLength(0);

    // a Ana volta e encontra o que é dela vindo da nuvem
    await useSync.getState().signOut();
    await useSync.getState().signIn("ana@teste.com", "senha-forte-1");
    await settle();
    expect(getLocal().items.map((i) => i.title)).toContain("Segredo da Ana");
  });

  it("se os dados locais sumirem mas o histórico de sync ficar, a nuvem NÃO é esvaziada", async () => {
    const { useSync, getLocal, setLocal, forgetLocal } = await setup();
    await useSync.getState().signUp("ana@teste.com", "senha-forte-1");
    await settle();
    setLocal(addItem(getLocal(), { title: "Importante", kind: "task", area: "personal", priority: "normal" }).data);
    useSync.getState().onLocalChange();
    await new Promise((r) => setTimeout(r, 1700));
    await settle();
    const id = "00000000-0000-4000-8000-000000000001";
    const before = backend.rowsOf(id, "items").length;
    expect(before).toBeGreaterThan(0);

    await useSync.getState().signOut();
    forgetLocal(id); // ex.: dados locais perdidos; o registro de sincronização continua no aparelho
    await useSync.getState().signIn("ana@teste.com", "senha-forte-1");
    await settle();
    expect(backend.rowsOf(id, "items")).toHaveLength(before);
    expect(getLocal().items.map((i) => i.title)).toContain("Importante");
  });
});
