import { expect, test } from "@playwright/test";
import { main, open, toast } from "./helpers";

test("despejo mental separa por tipo, permite corrigir e guarda tudo", async ({ page }) => {
  const errors = await open(page, "/despejo");
  await page
    .getByPlaceholder(/Uma coisa por linha/)
    .fill("ligar pro dentista\nestou preocupada com o prazo\ncomprar café\nideia: app de receitas");
  await page.getByRole("button", { name: "Separar pra mim" }).click();
  await expect(main(page).getByRole("heading", { name: "Preocupações" })).toBeVisible();
  await expect(main(page)).toContainText("preocupada com o prazo");
  await page.getByRole("button", { name: "Guardar tudo" }).click();
  await expect(toast(page)).toContainText("tiradas da cabeça");
  await page.goto("/algum-dia");
  await expect(main(page)).toContainText("preocupada com o prazo");
  expect(errors).toEqual([]);
});

test("rotina: marcar passos, progresso, editar e voltar no Hoje", async ({ page }) => {
  const errors = await open(page, "/rotina?p=morning");
  const first = main(page).getByRole("checkbox").first();
  await first.click();
  await expect(main(page)).toContainText(/1\/\d/);
  await page.reload();
  await expect(main(page)).toContainText(/1\/\d/); // persistiu
  await main(page).getByRole("button", { name: "Editar rotina" }).click();
  await main(page).getByPlaceholder("Novo passo (curto!)").fill("Alongar");
  await page.keyboard.press("Enter");
  await main(page).getByRole("button", { name: "Pronto" }).click();
  await expect(main(page)).toContainText("Alongar");
  expect(errors).toEqual([]);
});

test("lembretes: configurar e testar sem permissão cai num aviso dentro do app", async ({ page }) => {
  const errors = await open(page, "/lembretes");
  await page.getByRole("switch", { name: "Lembretes ligados" }).click();
  await expect(page.getByRole("switch", { name: "Lembretes ligados" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Horário: Rotina da manhã").fill("07:30");
  await page.reload();
  await expect(page.getByLabel("Horário: Rotina da manhã")).toHaveValue("07:30");
  await page.getByRole("button", { name: "Testar um aviso" }).click();
  await expect(toast(page)).toContainText("Leve");
  expect(errors).toEqual([]);
});

test("micropassos: sugerir mostra tempo e o primeiro passo é minúsculo", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Joga aqui/ }).click();
  await page.getByPlaceholder(/do jeito que vier/).fill("terminar o relatório hoje urgente");
  await page.getByRole("button", { name: "Já organizar" }).click();
  await page.keyboard.press("Escape");
  await main(page).getByText("Terminar o relatório").first().click();
  await page.getByRole("button", { name: /Sugerir/ }).click();
  await expect(page.getByText(/Micropassos · ~\d+ min/)).toBeVisible();
  await page.getByRole("button", { name: "Só o primeiro" }).click();
  await expect(page.getByRole("dialog").getByText(/Só abrir/)).toBeVisible();
});

test("ditado: fala vira texto na captura e no despejo (reconhecimento simulado)", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRec {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      start() {
        setTimeout(() => {
          const mk = (t: string, isFinal: boolean) => ({ isFinal, 0: { transcript: t } });
          this.onresult?.({ resultIndex: 0, results: [mk("ligar pro dentista nova linha pagar a luz", true)] });
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRec, webkitSpeechRecognition: FakeRec });
  });
  await open(page);
  await page.getByRole("button", { name: /Joga aqui/ }).click();
  await page.getByRole("button", { name: "Ditar", exact: true }).click();
  await expect(page.getByPlaceholder(/do jeito que vier/)).toHaveValue("ligar pro dentista\npagar a luz");
  await page.keyboard.press("Escape");

  await page.goto("/despejo");
  await page.getByRole("button", { name: "Ditar", exact: true }).click();
  await expect(page.getByPlaceholder(/Uma coisa por linha/)).toHaveValue("ligar pro dentista\npagar a luz");
});

test("ditado sem suporte do navegador explica o que fazer", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined });
  });
  await open(page, "/despejo");
  await page.getByRole("button", { name: "Ditar", exact: true }).click();
  await expect(page.getByTestId("dictation-status")).toContainText(/microfone do teclado/);
});
