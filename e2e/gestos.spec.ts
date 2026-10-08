import { expect, test, type Locator } from "@playwright/test";
import { main, open, toast } from "./helpers";

async function swipe(row: Locator, dx: number) {
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  const ev = { pointerType: "touch", pointerId: 7, isPrimary: true, bubbles: true };
  await row.dispatchEvent("pointerdown", { ...ev, clientX: x0, clientY: y });
  for (let i = 1; i <= 6; i++)
    await row.dispatchEvent("pointermove", { ...ev, clientX: x0 + (dx * i) / 6, clientY: y });
  await row.dispatchEvent("pointerup", { ...ev, clientX: x0 + dx, clientY: y });
}

test("deslizar para a direita conclui", async ({ page }) => {
  await open(page);
  const depois = main(page).locator("section", { has: page.getByRole("heading", { name: "Depois" }) });
  const row = depois.getByRole("button").first();
  const title = (await row.locator("p").first().innerText()).trim();
  await swipe(row, 140);
  await expect(toast(page)).toContainText("Um a menos");
  await expect(depois).not.toContainText(title);
  // o gesto não abre a folha de detalhes
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("deslizar para a esquerda adia para amanhã", async ({ page }) => {
  await open(page);
  const agora = main(page).locator("section", { has: page.getByRole("heading", { name: "Agora" }) });
  const row = agora.getByRole("button").first();
  const title = (await row.locator("p").first().innerText()).trim();
  await swipe(row, -140);
  await expect(toast(page)).toContainText("Volta amanhã");
  await expect(agora).not.toContainText(title);
});

test("deslize curto não faz nada", async ({ page }) => {
  await open(page);
  const agora = main(page).locator("section", { has: page.getByRole("heading", { name: "Agora" }) });
  const row = agora.getByRole("button").first();
  const title = (await row.locator("p").first().innerText()).trim();
  await swipe(row, 40);
  await expect(agora).toContainText(title);
  await expect(toast(page)).toHaveCount(0);
});
