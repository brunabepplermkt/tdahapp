import { expect, type Page } from "@playwright/test";

/** Abre uma rota e espera o app hidratar (dados locais carregados). */
export async function open(page: Page, path = "/") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(path);
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  return errors;
}

export async function capture(page: Page, text: string, mode: "inbox" | "organize" = "inbox") {
  await page.getByRole("button", { name: "Capturar algo" }).click();
  await page.getByPlaceholder(/do jeito que vier/).fill(text);
  await page.getByRole("button", { name: mode === "inbox" ? "Guardar na Inbox" : "Já organizar" }).click();
  await page.keyboard.press("Escape");
}

export const main = (page: Page) => page.locator("main");
export const toast = (page: Page) => page.getByRole("status");
