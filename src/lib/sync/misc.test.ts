import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { addItem, updateItem } from "@/lib/domain/operations";
import { looksLikeServiceRole, readSupabaseConfig } from "./config";
import { rebaseData } from "./rebase";

const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;

describe("configuração do Supabase", () => {
  it("sem variáveis: modo local", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ url: "https://x.supabase.co" })).toBeNull();
  });
  it("aceita https e localhost; recusa http remoto e lixo", () => {
    expect(readSupabaseConfig({ url: "https://abc.supabase.co", anonKey: jwt("anon") })).not.toBeNull();
    expect(readSupabaseConfig({ url: "http://localhost:54321", anonKey: jwt("anon") })).not.toBeNull();
    expect(readSupabaseConfig({ url: "http://evil.example", anonKey: jwt("anon") })).toBeNull();
    expect(readSupabaseConfig({ url: "não é url", anonKey: jwt("anon") })).toBeNull();
  });
  it("recusa service role no cliente (JWT e chave sb_secret)", () => {
    expect(looksLikeServiceRole(jwt("service_role"))).toBe(true);
    expect(looksLikeServiceRole(jwt("anon"))).toBe(false);
    expect(looksLikeServiceRole("sb_secret_abc")).toBe(true);
    expect(readSupabaseConfig({ url: "https://abc.supabase.co", anonKey: jwt("service_role") })).toBeNull();
  });
});

describe("rebaseData — a pessoa continua usando o app durante a sincronização", () => {
  it("sem mudanças locais: usa o resultado da sincronização", () => {
    const snap = buildDemoData("2026-10-08");
    const merged = { ...snap, items: snap.items.slice(1) };
    expect(rebaseData(snap, merged, snap)).toBe(merged);
  });

  it("preserva a edição feita no meio e ainda aplica o que veio do remoto", () => {
    const snap = buildDemoData("2026-10-08");
    const edited = snap.items[0];
    const other = snap.items[1];
    const removed = snap.items[2];
    // remoto: trocou o título de `other`, apagou `removed` e trouxe um item novo
    const remoteNew = addItem(snap, { title: "veio do remoto" });
    const merged = {
      ...remoteNew.data,
      items: remoteNew.data.items
        .filter((i) => i.id !== removed.id)
        .map((i) => (i.id === other.id ? { ...i, title: "título remoto" } : i)),
    };
    // local, durante o sync: editou `edited` e criou outro item
    let current = updateItem(snap, edited.id, { title: "editado agora" });
    current = addItem(current, { title: "criado agora" }).data;

    const out = rebaseData(snap, merged, current);
    const titles = out.items.map((i) => i.title);
    expect(titles).toContain("editado agora");
    expect(titles).toContain("criado agora");
    expect(titles).toContain("veio do remoto");
    expect(titles).toContain("título remoto");
    expect(out.items.some((i) => i.id === removed.id)).toBe(false);
  });

  it("edição local no meio vence a versão remota do mesmo item", () => {
    const snap = buildDemoData("2026-10-08");
    const id = snap.items[0].id;
    const merged = { ...snap, items: snap.items.map((i) => (i.id === id ? { ...i, title: "remoto" } : i)) };
    const current = updateItem(snap, id, { title: "local" });
    expect(rebaseData(snap, merged, current).items.find((i) => i.id === id)!.title).toBe("local");
  });
});
