import { expect, test } from "@playwright/test";
import { capture, main, open, toast } from "./helpers";

test("Hoje é enxuto: um 'Agora' e no máximo 2 depois", async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(Bom dia|Boa tarde|Boa noite)\.$/);
  await expect(main(page).getByRole("heading", { name: "Agora" })).toBeVisible();
  const depois = main(page).locator("section", { has: page.getByRole("heading", { name: "Depois" }) });
  expect(await depois.getByRole("checkbox").count()).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("capturar e já organizar → aparece no Hoje", async ({ page }) => {
  await open(page);
  await capture(page, "comprar pão hoje urgente", "organize");
  await expect(toast(page)).toContainText("Organizado");
  await expect(main(page)).toContainText("Comprar pão");
});

test("concluir mostra 'Desfazer' e desfazer restaura", async ({ page }) => {
  await open(page);
  const agora = main(page).locator("section", { has: page.getByRole("heading", { name: "Agora" }) });
  const title = (await agora.locator("p").first().innerText()).trim();
  await agora.getByRole("checkbox").first().click();
  await expect(toast(page)).toContainText("Um a menos");
  await expect(agora).not.toContainText(title);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(agora).toContainText(title);
});

test("adiar sem culpa tira o item do 'Agora'", async ({ page }) => {
  await open(page);
  const agora = main(page).locator("section", { has: page.getByRole("heading", { name: "Agora" }) });
  const title = (await agora.locator("p").first().innerText()).trim();
  await agora.getByText(title).click();
  await page.getByRole("button", { name: "Adiar" }).click();
  await page.getByRole("button", { name: "Semana que vem" }).click();
  await expect(toast(page)).toContainText("Tudo bem");
  await expect(agora).not.toContainText(title);
});

test("dados persistem depois de recarregar", async ({ page }) => {
  await open(page);
  await capture(page, "testar persistência amanhã", "organize");
  await expect(toast(page)).toContainText("Organizado");
  await page.goto("/semana");
  await expect(main(page)).toContainText("Testar persistência");
  await page.reload();
  await expect(main(page)).toContainText("Testar persistência");
});
