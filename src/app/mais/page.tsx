"use client";

import { useEffect, useState } from "react";
import { pendingDecisions } from "@/lib/domain/selectors";
import { useApp } from "@/lib/hooks/useApp";
import { listInterpreters, toolManifest } from "@/lib/intelligence";
import { repository, type BackupInfo } from "@/lib/store/repository";
import { useStore } from "@/lib/store/store";
import { Ready } from "@/components/shell/AppShell";
import { IconActivity, IconDecision, IconFolder, IconLeaf, IconWallet, IconWeek } from "@/components/ui/icons";
import { Button, Collapsible, Group, LinkRow, PageHeader, Section } from "@/components/ui/primitives";

export default function MorePage() {
  return (
    <Ready>
      <More />
    </Ready>
  );
}

const INTEGRATIONS = [
  { name: "Supabase (sincronizar entre aparelhos)", status: "Preparado, não configurado" },
  { name: "IA para interpretar capturas", status: "Interface pronta, sem chave" },
  { name: "Google Calendar", status: "Não conectado" },
  { name: "Gmail", status: "Não conectado" },
  { name: "Banco / Open Finance", status: "Não conectado" },
  { name: "WhatsApp", status: "Não conectado" },
  { name: "Agente Hermes", status: "Não conectado" },
];

function More() {
  const { data, today } = useApp();
  const resetDemo = useStore((s) => s.resetDemo);
  const clearAll = useStore((s) => s.clearAll);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const [confirmClear, setConfirmClear] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const refreshBackups = () => setBackupsVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    void repository.listBackups().then((b) => alive && setBackups(b));
    return () => {
      alive = false;
    };
  }, [backupsVersion]);
  const decisions = pendingDecisions(data.decisions, today, data.items).length;
  const someday = data.items.filter((i) => i.status === "someday").length;
  const tools = toolManifest();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leve-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Mais" />

      <Section>
        <Group>
          <LinkRow
            href="/decisoes"
            icon={<IconDecision size={20} />}
            trailing={decisions > 0 && <Count n={decisions} />}
          >
            Decisões
          </LinkRow>
          <LinkRow href="/projetos" icon={<IconFolder size={20} />}>
            Projetos
          </LinkRow>
          <LinkRow href="/financas" icon={<IconWallet size={20} />}>
            Finanças
          </LinkRow>
          <LinkRow href="/algum-dia" icon={<IconLeaf size={20} />} trailing={someday > 0 && <Count n={someday} />}>
            Algum dia
          </LinkRow>
          <LinkRow href="/revisao" icon={<IconWeek size={20} />}>
            Revisão semanal
          </LinkRow>
          <LinkRow href="/atividade" icon={<IconActivity size={20} />}>
            Atividade
          </LinkRow>
        </Group>
      </Section>

      <Section title="Seus dados" hint={`Guardados ${repository.label.toLowerCase()}. Nada sai daqui.`}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={exportJson}>
            Exportar backup (JSON)
          </Button>
          <Button size="sm" onClick={() => void resetDemo().then(refreshBackups)}>
            Recriar dados de exemplo
          </Button>
          {!confirmClear ? (
            <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
              Começar do zero
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                void clearAll().then(refreshBackups);
                setConfirmClear(false);
              }}
            >
              Confirmar: apagar tudo
            </Button>
          )}
        </div>
        {backups.length > 0 && (
          <div className="mt-4">
            <Collapsible title="Backups automáticos" count={backups.length}>
              <p className="mb-2 px-1 text-[13px] text-muted">
                Guardados antes de qualquer ação que apaga ou substitui dados. Ficam os 5 mais recentes.
              </p>
              <Group>
                {backups.map((b) => (
                  <div key={b.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-ink">
                        {new Date(b.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {b.items !== null && <span className="text-muted"> · {b.items} itens</span>}
                      </p>
                      <p className="text-[12px] text-muted">{b.reason}</p>
                    </div>
                    <Button size="sm" onClick={() => void restoreBackup(b.key).then(refreshBackups)}>
                      Restaurar
                    </Button>
                  </div>
                ))}
              </Group>
            </Collapsible>
          </div>
        )}
      </Section>

      <Section title="Integrações" hint="Nada externo está conectado. Cada uma exigirá sua autorização explícita.">
        <Group>
          {INTEGRATIONS.map((i) => (
            <div key={i.name} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[14px] text-ink">{i.name}</span>
              <span className="shrink-0 text-[12px] text-muted">{i.status}</span>
            </div>
          ))}
        </Group>
      </Section>

      <Section title="Inteligência">
        <p className="mb-3 px-1 text-[14px] text-ink-2">
          Interpretação atual: <strong className="font-medium">{listInterpreters()[0].label}</strong>. O assistente
          local só sugere — toda ação que muda seus dados passa pela fila de Decisões.
        </p>
        <Collapsible title="Ferramentas disponíveis para um agente" count={tools.length}>
          <div className="space-y-4">
            {(["read", "write"] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-1.5 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">
                  {kind === "read" ? "Leitura (READ)" : "Escrita (WRITE)"}
                </p>
                <Group>
                  {tools
                    .filter((t) => t.kind === kind)
                    .map((t) => (
                      <div key={t.name} className="px-4 py-2.5">
                        <p className="font-mono text-[13px] text-ink">
                          {t.name}
                          {!t.enabled && <span className="ml-2 font-sans text-[11px] text-danger">desabilitada</span>}
                          {t.requiresConfirmation && t.enabled && (
                            <span className="ml-2 font-sans text-[11px] text-muted">pede confirmação</span>
                          )}
                        </p>
                        <p className="text-[12px] text-muted">{t.description}</p>
                      </div>
                    ))}
                </Group>
              </div>
            ))}
          </div>
        </Collapsible>
      </Section>

      <p className="mt-10 text-center text-[12px] text-faint">Leve · MVP local · dados fictícios de exemplo</p>
    </>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-[13px] text-muted tabular-nums">{n}</span>;
}
