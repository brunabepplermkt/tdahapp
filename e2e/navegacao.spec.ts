import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const ROUTES = [
  "/",
  "/semana",
  "/mes",
  "/inbox",
  "/decisoes",
  "/projetos",
  "/projetos/prj_zeloa",
  "/financas",
  "/mais",
  "/atividade",
  "/algum-dia",
  "/foco",
  "/revisao",
];

for (const route of ROUTES) {
  test(`abre ${route} sem erros`, async ({ page }) => {
    const errors = await open(page, route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
