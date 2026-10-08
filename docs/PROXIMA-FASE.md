# Próxima fase

Em ordem sugerida. Itens marcados com 🔑 precisam de decisão/credencial sua.

## 1. Dados na nuvem  _(código pronto no Bloco 3 — falta ligar)_
- ✅ Schema + RLS (0001/0002), repositório/motor de sync, conta por link, migração idempotente, testes em Postgres real.
- 🔑 Criar projeto Supabase, aplicar as migrations (`supabase db push`), configurar Auth (link mágico + URL de redirect)
  e preencher `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`. Testar o adaptador `sync/supabase.ts` contra o projeto real
  (hoje só testado por contrato + fake + Postgres em memória).
- Tombstones para apagar entre aparelhos sem ambiguidade; Realtime em vez de puxar ao voltar ao app.

## 2. Inteligência real
- ✅ Schema estruturado + validação + pipeline com fallback local.
- 🔑 Provider LLM atrás de uma Route Handler no servidor (chave só no servidor) implementando `StructuredProvider`.
- Usar o LLM também em: quebrar tarefas, explicar prioridades, revisar a semana.
- **Hermes** via `createToolGateway` (ver ARQUITETURA §8c): endpoint autenticado, concessões (`agent_grants`), mapeamento
  canal → usuário, rate limit. Tudo que escreve (além de capturar) passa por Decisões.

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
