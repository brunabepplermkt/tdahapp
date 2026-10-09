import { describe, expect, it } from "vitest";
import { appendDictation, applyVoiceCommands } from "./commands";

describe("applyVoiceCommands", () => {
  it("nova linha vira quebra de linha", () => {
    expect(applyVoiceCommands("ligar pro dentista nova linha pagar a luz")).toBe("ligar pro dentista\npagar a luz");
    expect(applyVoiceCommands("comprar pão próxima linha comprar leite")).toBe("comprar pão\ncomprar leite");
  });
  it("pontuação falada", () => {
    expect(applyVoiceCommands("oi vírgula tudo bem interrogação")).toBe("oi, tudo bem ?".replace(" ?", "?"));
    expect(applyVoiceCommands("terminei ponto final")).toBe("terminei.");
  });
  it("texto normal passa intacto", () => {
    expect(applyVoiceCommands("  pagar a conta de luz  ")).toBe("pagar a conta de luz");
  });
});

describe("appendDictation", () => {
  it("junta com espaço e respeita quebras", () => {
    expect(appendDictation("", "comprar café")).toBe("comprar café");
    expect(appendDictation("comprar café", "e pão")).toBe("comprar café e pão");
    expect(appendDictation("comprar café\n", "pagar luz")).toBe("comprar café\npagar luz");
    expect(appendDictation("comprar café", "nova linha pagar luz")).toBe("comprar café\npagar luz");
  });
  it("trecho vazio não muda nada", () => {
    expect(appendDictation("abc", "   ")).toBe("abc");
  });
});
