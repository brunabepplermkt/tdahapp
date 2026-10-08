import { expect, test } from "@playwright/test";
import { main, open, toast } from "./helpers";

test("Organizar minha semana: preview, desmarcar, aplicar", async ({ page }) => {
  await open(page, "/semana");
  await page.getByRole("button", { name: "Organizar minha semana" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Proposta para a semana");
  const apply = sheet.getByRole("button", { name: /^Aplicar/ });
  const n = Number((await apply.innerText()).replace(/\D/g, ""));
  expect(n).toBeGreaterThan(1);
  await sheet.getByRole("checkbox").first().click();
  await expect(apply).toHaveText(`Aplicar ${n - 1}`);
  await apply.click();
  await expect(toast(page)).toContainText("planejad");
});

test("Organizar meu mês abre proposta sem mudar nada até aplicar", async ({ page }) => {
  await open(page, "/mes");
  const before = await main(page).innerText();
  await page.getByRole("button", { name: "Organizar meu mês" }).click();
  await expect(page.getByRole("dialog")).toContainText("Proposta para o mês");
  await page.getByRole("dialog").getByRole("button", { name: "Agora não" }).click();
  expect(await main(page).innerText()).toBe(before);
});

test("Finanças: registrar conta a pagar", async ({ page }) => {
  await open(page, "/financas");
  await page.getByRole("button", { name: "Adicionar conta ou recebimento" }).click();
  await page.getByLabel("Descrição").fill("Conta de água teste");
  await page.getByLabel("Valor (R$)").fill("87,50");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(main(page)).toContainText("Conta de água teste");
  await expect(main(page)).toContainText("R$ 87,50");
});

test("Projeto: atualizar 'onde estou' e anotar", async ({ page }) => {
  await open(page, "/projetos");
  await main(page).getByText("Zeloa").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zeloa");
  await page.getByPlaceholder(/Anotar algo/).fill("Nota do teste e2e");
  await page.keyboard.press("Enter");
  await expect(main(page)).toContainText("Nota do teste e2e");
});
