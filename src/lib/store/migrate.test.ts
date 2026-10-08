import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";

describe("migrate", () => {
  it("aceita a versão atual e completa coleções faltando", () => {
    const r = migrate({ version: 1, items: [{ id: "a" }] });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data.items).toHaveLength(1);
      expect(r.data.decisions).toEqual([]);
      expect(r.migratedFrom).toBeUndefined();
    }
  });

  it("aplica migrações em sequência", () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, version: 2, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, version: 3, b: 2 }),
    };
    const r = migrate({ version: 1, items: [] }, migrations, 3);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data).toMatchObject({ version: 3, a: 1, b: 2 });
      expect(r.migratedFrom).toBe(1);
    }
  });

  it("recusa versão futura (não sobrescreve dados de um app mais novo)", () => {
    expect(migrate({ version: 99, items: [] }).status).toBe("unreadable");
  });

  it("recusa lixo e migração faltando", () => {
    expect(migrate(null).status).toBe("unreadable");
    expect(migrate([1, 2]).status).toBe("unreadable");
    expect(migrate({ items: [] }).status).toBe("unreadable");
    expect(migrate({ version: 1 }, {}, 2).status).toBe("unreadable");
  });
});
