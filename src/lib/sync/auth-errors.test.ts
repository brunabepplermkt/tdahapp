import { describe, expect, it } from "vitest";
import { authErrorMessage, checkCredentials } from "./auth-errors";

describe("authErrorMessage", () => {
  it("traduz os erros comuns", () => {
    expect(authErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(authErrorMessage({ message: "User already registered" })).toMatch(/já tem conta/);
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirme/);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/8 caracteres/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(authErrorMessage(new Error("Failed to fetch"))).toMatch(/Sem internet/);
  });
  it("não vaza texto cru desconhecido", () => {
    const m = authErrorMessage({ message: "pg: relation auth.users secret detail" });
    expect(m).toBe("Não deu certo. Tente de novo.");
    expect(authErrorMessage(null)).toBe("Não deu certo. Tente de novo.");
  });
});

describe("checkCredentials", () => {
  it("valida e-mail e tamanho da senha", () => {
    expect(checkCredentials("a@b.co", "12345678").ok).toBe(true);
    expect(checkCredentials("sem-arroba", "12345678").ok).toBe(false);
    expect(checkCredentials("a@b.co", "1234567").ok).toBe(false);
    expect(checkCredentials("a@b.co", "", { needPassword: false }).ok).toBe(true);
  });
});
