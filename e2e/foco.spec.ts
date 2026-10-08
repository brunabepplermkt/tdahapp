import { expect, test } from "@playwright/test";
import { main, open } from "./helpers";

test("modo foco: uma coisa por vez, pular e concluir", async ({ page }) => {
  await open(page);
  const agora = main(page).locator("section", { has: page.getByRole("heading", { name: "Agora" }) });
  const first = (await agora.locator("p").first().innerText()).trim();
  await page.getByRole("link", { name: "Modo foco" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(first);

  await page.getByRole("button", { name: "Pular" }).click();
  const second = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  expect(second).not.toBe(first);

  await page.getByRole("button", { name: "25 min" }).click();
  await expect(page.getByText(/^2[45]:\d\d$/)).toBeVisible();

  await page.getByRole("button", { name: "Feito" }).click();
  await expect(page.getByText("Feito.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(second);

  await page.getByRole("link", { name: "Sair do modo foco" }).click();
  await expect(page).toHaveURL(/\/$/);
});
