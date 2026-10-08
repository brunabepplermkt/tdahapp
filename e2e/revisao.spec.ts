import { expect, test } from "@playwright/test";
import { main, open, toast } from "./helpers";

test("revisão semanal percorre os 5 passos", async ({ page }) => {
  await open(page, "/semana");
  await page.getByRole("link", { name: "Revisão semanal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Esvaziar a Inbox");

  // passo 1: aceitar uma captura
  const cards = main(page).getByTestId("review-card");
  const n = await cards.count();
  await cards.first().getByRole("button", { name: "Aceitar" }).click();
  await expect(cards).toHaveCount(n - 1);

  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O que ficou pra trás");
  await main(page).getByRole("button", { name: "Hoje" }).first().click();

  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Projetos");
  await page
    .getByPlaceholder(/Próxima ação/)
    .first()
    .fill("Definir preço do Copiloto");
  await page.keyboard.press("Enter");
  await expect(main(page)).toContainText("Próximo: Definir preço do Copiloto");

  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coisas esquecidas");
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Próxima semana");
  await main(page)
    .getByRole("button", { name: /Ver proposta/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Aplicar/ })
    .click();
  await expect(toast(page)).toContainText("planejad");

  await page.getByRole("button", { name: "Concluir revisão" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revisão feita.");
});
