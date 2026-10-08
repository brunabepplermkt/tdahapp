# Próxima fase

Em ordem sugerida. Itens marcados com 🔑 precisam de decisão/credencial sua.

## 1. Dados na nuvem
- 🔑 Criar projeto Supabase e aplicar `supabase/migrations/0001_init.sql`.
- Implementar `SupabaseRepository` (mesma interface de `src/lib/store/repository.ts`); trocar o save do
  “estado inteiro” por gravações por entidade.
- Supabase Auth (link mágico por e-mail) + tela de login; migrar dados locais na primeira entrada.
- Sincronização entre iPhone e desktop; tratamento de conflito simples (último a escrever vence, por item).

## 2. Inteligência real
- 🔑 Provider LLM para `CaptureInterpreter` via Route Handler no servidor (chave só no servidor), com o heurístico
  como fallback e para preview instantâneo.
- Usar o LLM também em: quebrar tarefas, explicar prioridades, revisar a semana.
- Agente (Hermes ou outro) consumindo `toolManifest()` + `executeTool()`; tudo que escreve passa por Decisões.
- Lembrar contexto: ligar capturas a notas/pessoas/projetos já existentes.

## 3. Integrações (cada uma com autorização explícita)
- 🔑 Google Calendar (leitura primeiro: compromissos no Hoje/Semana; escrita só via Decisões).
- 🔑 Gmail (transformar e-mails em capturas/decisões “responder”).
- 🔑 Notificações push (PWA) para contas vencendo e o “Agora” da manhã.
- Banco / Open Finance só bem depois — leitura, nunca movimentação automática.

## 4. Produto / UX
- ✅ Gestos, modo foco, revisão semanal guiada, busca global, edição de projetos com apelidos.
- Arrastar itens entre dias na Semana.
- Rotinas com checklist diário leve.
- Desfazer mais granular e lixeira.

## 5. Técnico
- ✅ E2E (Playwright, iPhone + desktop), CI no GitHub Actions, migração versionada + backups automáticos.
- Ícones maskable dedicados e splash screens iOS.
- Telemetria local opcional (sem envio) para calibrar a pontuação do Hoje.

## Limitações conhecidas do MVP
- Dados só neste navegador (limpar dados do Safari apaga tudo — use Exportar backup).
- Interpretador heurístico erra em frases ambíguas; tudo fica revisável na Inbox.
- Datas no fuso do aparelho; sem suporte a fusos múltiplos.
- Recorrência simples (diária/semanal/mensal/anual), sem “toda 2ª terça”.
