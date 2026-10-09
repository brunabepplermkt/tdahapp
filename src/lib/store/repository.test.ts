import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoData, emptyData } from "@/lib/demo/demo-data";
import { LocalRepository } from "./repository";

const mem = new Map<string, string>();
const ls = {
  get length() {
    return mem.size;
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

beforeEach(() => {
  mem.clear();
  Object.assign(globalThis, { window: { localStorage: ls } });
});

describe("LocalRepository — modo conta", () => {
  it("cada pessoa tem o seu espaço; trancado sem pessoa", async () => {
    const repo = new LocalRepository();
    repo.setUser(null);
    await repo.save(buildDemoData("2026-10-09")); // trancado: não grava
    expect(mem.size).toBe(0);
    expect(await repo.load()).toBeNull();

    repo.setUser("ana");
    await repo.save(buildDemoData("2026-10-09"));
    repo.setUser("bia");
    expect(await repo.load()).toBeNull(); // a Bia não enxerga os dados da Ana
    await repo.save(emptyData());
    repo.setUser("ana");
    expect((await repo.load())?.items.length).toBeGreaterThan(0);
  });

  it("backups são por pessoa e não restauram os de outra", async () => {
    const repo = new LocalRepository();
    repo.setUser("ana");
    await repo.save(buildDemoData("2026-10-09"));
    await repo.backup("teste");
    const [b] = await repo.listBackups();
    expect(b).toBeTruthy();

    repo.setUser("bia");
    expect(await repo.listBackups()).toEqual([]);
    expect(await repo.restoreBackup(b.key)).toBeNull();
  });

  it("dados do modo antigo ficam disponíveis só para importar, sem serem lidos como da conta", async () => {
    const legacy = new LocalRepository();
    await legacy.save(buildDemoData("2026-10-09")); // modo antigo: chave global
    const repo = new LocalRepository();
    repo.setUser("ana");
    expect(await repo.load()).toBeNull();
    expect(repo.loadLegacy()?.items.length).toBeGreaterThan(0);
  });
});
