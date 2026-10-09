"use client";

import { useSync } from "@/lib/sync/controller";
import { Button, Group, Section } from "@/components/ui/primitives";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

/**
 * Conta e nuvem. Sem Supabase configurado, mostra só “modo local” — o app
 * continua exatamente como era. Nada é enviado sem o botão explícito.
 */
export function CloudSection() {
  const s = useSync();

  if (s.status === "unconfigured" || s.status === "loading") {
    return (
      <Section title="Conta e nuvem">
        <Group>
          <div className="flex items-center justify-between gap-3 px-4 py-3" data-testid="cloud-status">
            <span className="text-[14px] text-ink">Sincronização</span>
            <span className="shrink-0 text-[12px] text-muted">{s.status === "loading" ? "…" : "Desligada"}</span>
          </div>
        </Group>
      </Section>
    );
  }

  return (
    <Section title="Conta e nuvem">
      <Group>
        <div className="px-4 py-3" data-testid="cloud-status">
          <p className="text-[15px] text-ink">{s.email ?? "Sem conta conectada"}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {s.status === "syncing" && "Sincronizando…"}
            {s.status === "offline" && "Offline — salvo aqui, sobe quando a internet voltar"}
            {s.status === "error" && "Falhou — seus dados locais estão intactos"}
            {s.status === "ready" && (s.migrated ? `Sincronizado · ${when(s.lastSyncAt)}` : "Conectando…")}
          </p>
          {s.lastError && <p className="mt-1 text-[12px] text-danger">{s.lastError}</p>}
        </div>
      </Group>

      {s.migrated && s.heldDeletions > 0 && (
        <div className="mt-3 rounded-[16px] bg-surface p-4 shadow-soft">
          <p className="text-[14px] text-ink">{s.heldDeletions} remoções aguardando confirmação</p>
          <p className="mt-1 text-[12px] text-muted">
            Você apagou muita coisa de uma vez aqui. A nuvem continua intacta até você confirmar.
          </p>
          <Button className="mt-3" size="sm" variant="danger" onClick={() => void s.syncNow({ allowMassDelete: true })}>
            Confirmar remoção na nuvem
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {s.migrated && (
          <Button size="sm" onClick={() => void s.syncNow()}>
            Sincronizar agora
          </Button>
        )}
        <Button size="sm" onClick={() => void s.signOut()}>
          Sair da conta
        </Button>
      </div>
    </Section>
  );
}
