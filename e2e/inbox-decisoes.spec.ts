import { expect, test } from "@playwright/test";
import { capture, main, open, toast } from "./helpers";

test("capturar para a Inbox e aceitar", async ({ page }) => {
  await open(page);
  await capture(page, "olhar orçamento do pintor sexta");
  await expect(toast(page)).toContainText("Inbox");
  await page.goto("/inbox");
  const card = main(page).locator("article", { hasText: "orçamento do pintor" });
  await expect(card).toContainText("Olhar orçamento do pintor");
  await card.getByRole("button", { name: "Aceitar" }).click();
  await expect(card).toHaveCount(0);
});

test("editar uma captura antes de aceitar", async ({ page }) => {
  await open(page, "/inbox");
  const card = main(page).locator("article").first();
  await card.getByRole("button", { name: "Editar" }).click();
  const title = card.getByLabel("O quê").first();
  await title.fill("Título editado no teste");
  await card.getByRole("button", { name: "Salvar e organizar" }).click();
  await page.goto("/semana");
  await expect(main(page)).toContainText("Título editado no teste");
});

test("decisão 'Já paguei' sai da fila e persiste", async ({ page }) => {
  await open(page, "/decisoes");
  const cards = main(page).locator("article");
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);
  await main(page).getByRole("button", { name: "Já paguei" }).first().click();
  await expect(cards).toHaveCount(before - 1);
  await page.reload();
  await expect(cards).toHaveCount(before - 1);
});

test("decisão pode ser adiada e ignorada", async ({ page }) => {
  await open(page, "/decisoes");
  const cards = main(page).locator("article");
  const before = await cards.count();
  await cards.first().getByRole("button", { name: "Adiar" }).click();
  await expect(cards).toHaveCount(before - 1);
  await cards.first().getByRole("button", { name: "Ignorar" }).click();
  await expect(cards).toHaveCount(before - 2);
});
