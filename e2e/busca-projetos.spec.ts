import { expect, test } from "@playwright/test";
import { capture, main, open, toast } from "./helpers";

test("busca encontra nota sem acento e abre o projeto", async ({ page }) => {
  await open(page);
  await main(page).getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("textbox", { name: "Buscar" }).fill("relatorio semanal");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("relatório semanal");
  await dialog.getByText("relatório semanal", { exact: false }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zeloa");
});

test("busca abre um item na folha de detalhes", async ({ page }) => {
  await open(page);
  await main(page).getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("textbox", { name: "Buscar" }).fill("dentista");
  await page.getByRole("dialog").getByText("Marcar dentista").click();
  await expect(page.getByRole("dialog").getByLabel("Título")).toHaveValue("Marcar dentista");
});

test("apelido novo faz a captura chegar ligada ao projeto", async ({ page }) => {
  await open(page, "/projetos/prj_copiloto");
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Apelidos (separados por vírgula)").fill("assistente");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(toast(page)).toContainText("Projeto atualizado");
  await capture(page, "testar o assistente com voz");
  await page.goto("/inbox");
  await expect(main(page).locator("article").first()).toContainText("Copiloto");
});
