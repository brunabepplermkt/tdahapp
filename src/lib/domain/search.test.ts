import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { searchAll } from "./search";

const data = buildDemoData("2026-10-08");

describe("searchAll", () => {
  it("ignora acentos e acha em notas", () => {
    const r = searchAll(data, "relatorio semanal");
    expect(r.notes.some((n) => n.body.includes("relatório semanal"))).toBe(true);
  });
  it("todas as palavras precisam aparecer", () => {
    expect(searchAll(data, "webhook falhando").items.length).toBe(1);
    expect(searchAll(data, "webhook banana").total).toBe(0);
  });
  it("acha projeto por apelido e pessoa em item", () => {
    expect(searchAll(data, "beds24").projects.map((p) => p.name)).toContain("Sítio Recanto Azul");
    expect(searchAll(data, "carla").items[0].title).toContain("Carla");
  });
  it("consulta vazia não retorna nada", () => {
    expect(searchAll(data, " ").total).toBe(0);
  });
});
