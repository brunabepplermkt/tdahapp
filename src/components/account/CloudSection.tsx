"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/store";
import { useSync } from "@/lib/sync/controller";
import { Button, Group, inputClass, Section } from "@/components/ui/primitives";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Conta e nuvem. Sem Supabase configurado, mostra só “modo local” — o app
 * continua exatamente como era. Nada é enviado sem o botão explícito.
 */
export function CloudSection() {
  const s = useSync();
  const data = useStore((st) => st.data);
  const [email, setEmail] = useState("");

  if (s.status === "unconfigured" || s.status === "loading") {
    return (
      <Section title="Conta e nuvem" hint="Modo local: tudo fica só neste aparelho.">
        <Group>
          <div className="flex items-center justify-between gap-3 px-4 py-3" data-testid="cloud-status">
            <span className="text-[14px] text-ink">Sincronização</span>
            <span className="shrink-0 text-[12px] text-muted">
              {s.status === "loading" ? "Verificando…" : "Desligada (sem Supabase configurado)"}
            </span>
          </div>
        </Group>
      </Section>
    );
  }

  const count = data.items.length + data.projects.length + data.captures.length + data.notes.length + data.decisions.length;

  return (
    <Section title="Conta e nuvem" hint="Seus dados continuam salvos neste aparelho primeiro; a nuvem é uma cópia sincronizada.">
      <Group>
        <div className="px-4 py-3" data-testid="cloud-status">
          <p className="text-[14px] text-ink">
            {s.status === "signed_out" && "Sem conta conectada"}
            {s.status === "link_sent" && `Link enviado para ${s.email}. Abra o e-mail neste aparelho.`}
            {s.status === "syncing" && "Sincronizando…"}
            {s.status === "offline" && "Sem conexão — suas alterações estão salvas aqui e seguem quando voltar."}
            {s.status === "error" && "Algo falhou — seus dados locais estão intactos."}
            {s.status === "ready" && (s.migrated ? "Sincronizado" : `Conectado como ${s.email ?? "você"}`)}
          </p>
          {s.lastError && <p className="mt-1 text-[12px] text-danger">{s.lastError}</p>}
          {s.migrated && <p className="mt-1 text-[12px] text-muted">Última sincronização: {when(s.lastSyncAt)}</p>}
        </div>
      </Group>

      {(s.status === "signed_out" || s.status === "link_sent" || (s.status === "error" && !s.email)) && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes("@")) void s.signIn(email);
          }}
        >
          <input
            className={inputClass}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="E-mail para receber o link de acesso"
          />
          <Button type="submit" size="sm" variant="primary">
            Enviar link
          </Button>
        </form>
      )}

      {s.email && !s.migrated && s.status !== "syncing" && (
        <div className="mt-3 rounded-[16px] bg-surface p-4 shadow-soft">
          <p className="text-[14px] text-ink">
            Enviar os {count} registros deste aparelho para a nuvem?
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Guardo um backup antes. Nada é apagado aqui nem lá, e repetir é seguro (não duplica).
          </p>
          <Button className="mt-3" size="sm" variant="primary" onClick={() => void s.migrate()}>
            Enviar dados deste aparelho
          </Button>
        </div>
      )}

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

      {s.email && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.migrated && (
            <Button size="sm" onClick={() => void s.syncNow()}>
              Sincronizar agora
            </Button>
          )}
          <Button size="sm" onClick={() => void s.signOut()}>
            Sair (dados locais ficam)
          </Button>
        </div>
      )}
    </Section>
  );
}
