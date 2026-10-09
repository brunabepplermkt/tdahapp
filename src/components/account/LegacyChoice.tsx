"use client";

import { repository } from "@/lib/store/repository";
import { useStore } from "@/lib/store/store";
import { Button } from "@/components/ui/primitives";

/**
 * Antes de existirem contas, os dados ficavam só neste aparelho. Na primeira
 * conta que entra aqui, perguntamos uma vez o que fazer com eles.
 */
export function LegacyChoice() {
  const resolve = useStore((s) => s.resolveLegacy);
  const count = repository.loadLegacy()?.items.length ?? 0;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <p className="t-heading mb-6 text-[40px] text-ink">Leve</p>
      <div className="rounded-[28px] bg-surface p-6 shadow-soft">
        <p className="t-heading mb-2 text-[22px] text-ink">Achei dados neste aparelho</p>
        <p className="mb-6 text-[15px] text-ink-2">
          {count} {count === 1 ? "item salvo" : "itens salvos"} de antes de você ter conta. Trazer para esta conta?
        </p>
        <div className="flex flex-col gap-2.5">
          <Button variant="primary" size="lg" block onClick={() => resolve(true)}>
            Trazer para minha conta
          </Button>
          <Button size="lg" block onClick={() => resolve(false)}>
            Começar limpo
          </Button>
        </div>
      </div>
    </main>
  );
}
