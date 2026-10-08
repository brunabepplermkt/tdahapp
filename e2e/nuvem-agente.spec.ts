import { expect, test } from "@playwright/test";
import { capture, main, open, toast } from "./helpers";

test("sem Supabase configurado o app segue em modo local, sem rede externa", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) external.push(r.url());
  });
  await open(page, "/mais");
  const status = page.getByTestId("cloud-status");
  await expect(status).toContainText("Desligada");
  await expect(main(page)).toContainText("Conta e nuvem");
  await expect(page.getByRole("button", { name: /Enviar dados/ })).toHaveCount(0);
  expect(external).toEqual([]);
});

test("captura do exemplo vira conta + tarefa de projeto, com datas, e fica na Atividade com origem", async ({ page }) => {
  await open(page);
  await capture(page, "sexta preciso pagar a VPS e terminar o checkout do Beds24", "organize");
  await expect(toast(page)).toContainText("Organizado");
  await page.goto("/atividade");
  await expect(main(page)).toContainText("capture_item");
  await expect(main(page)).toContainText("origem: app");
  await expect(main(page)).toContainText("Capturar: “sexta preciso pagar a VPS");
  await page.goto("/semana");
  await expect(main(page)).toContainText("Pagar a VPS");
  await expect(main(page)).toContainText("Terminar o checkout do Beds24");
});

test("Mais lista as ferramentas e deixa claro o que pede confirmação de um agente", async ({ page }) => {
  await open(page, "/mais");
  await main(page).getByText("Ferramentas disponíveis para um agente").click();
  for (const name of ["get_today", "capture_item", "create_financial_entry", "snooze_item"]) {
    await expect(main(page).locator("p.font-mono", { hasText: name }).first()).toBeVisible();
  }
  await expect(main(page)).toContainText("pede confirmação");
});

test("dados de antes da atualização continuam abrindo (decisão com ferramenta de nome antigo)", async ({ page }) => {
  await open(page, "/decisoes");
  const before = await main(page).locator("article").count();
  // injeta uma decisão no formato antigo (postpone_item / actor sem origem)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("tdahapp:data:v1")!);
    const item = raw.items.find((i: { status: string; money?: unknown }) => i.status === "open" && !i.money);
    raw.decisions.push({
      id: "dec_legado", kind: "agent_suggestion", title: "Adiar legado", itemId: item.id, projectId: null,
      actions: [{ tool: "postpone_item", input: { itemId: item.id, to: null } }], status: "pending",
      createdBy: "agent", createdAt: new Date().toISOString(),
    });
    localStorage.setItem("tdahapp:data:v1", JSON.stringify(raw));
  });
  await page.reload();
  const card = main(page).locator("article", { hasText: "Adiar legado" });
  await expect(card).toBeVisible();
  await expect(main(page).locator("article")).toHaveCount(before + 1);
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(main(page).locator("article", { hasText: "Adiar legado" })).toHaveCount(0);
});
