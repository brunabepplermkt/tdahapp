import { describe, expect, it } from "vitest";
import { suggestMicroSteps, totalMinutes } from "./breakdown";
import { sortDump, splitDump } from "./braindump";

const ctx = { today: "2026-10-09", projects: [] };

describe("splitDump", () => {
  it("separa por linha, ; e marcadores", () => {
    expect(splitDump("- ligar pro João\n2) pagar a luz; comprar leite\n\n  ")).toEqual([
      "ligar pro João",
      "pagar a luz",
      "comprar leite",
    ]);
  });
});

describe("sortDump", () => {
  it("separa preocupações do resto e nunca perde linhas", () => {
    const r = sortDump("ligar pro dentista\nestou preocupada com o prazo do projeto\ncomprar café", ctx);
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.find((e) => e.bucket === "worry")?.text).toContain("preocupada");
    expect(r.filter((e) => e.bucket !== "worry").length).toBeGreaterThanOrEqual(2);
  });

  it("texto vazio não gera nada", () => {
    expect(sortDump("  \n ", ctx)).toEqual([]);
  });
});

describe("suggestMicroSteps", () => {
  it("o primeiro passo é sempre de até 2 minutos", () => {
    for (const t of ["pagar a luz", "responder Ana", "resolver imposto", "terminar relatório", "aprender violão"]) {
      const steps = suggestMicroSteps(t);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps[0].min).toBeLessThanOrEqual(2);
      expect(steps.every((s) => s.min <= 15)).toBe(true);
      expect(steps.every((s) => !/\(\d+ min\)/.test(s.title))).toBe(true);
    }
  });
  it("soma o tempo", () => {
    expect(
      totalMinutes([
        { title: "a", min: 1 },
        { title: "b", min: 5 },
      ]),
    ).toBe(6);
  });
});
