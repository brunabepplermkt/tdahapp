# Leve

Um app pessoal para tirar as coisas da cabeça e ver, com clareza, **o que merece atenção agora**.
Feito para cabeça com TDAH: captura sem fricção, poucas decisões por tela, adiar sem culpa.

> Sem configuração o app é 100% local (sem login). Com Supabase configurado ele vira multi-conta: ver [docs/CONTAS.md](docs/CONTAS.md). Dados de exemplo são fictícios. Nenhuma conta, banco, agenda ou mensageiro está conectado.
> Supabase, IA e agente (Hermes) têm código pronto e **desligado**: sem variáveis de ambiente o app é 100% local.

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
```

Na primeira abertura o app cria dados de demonstração (relativos à data de hoje).
Em **Mais → Seus dados** dá para recriar a demo, exportar um backup JSON ou começar do zero.
Antes de qualquer ação que apaga ou substitui dados, o app guarda um backup automático (restaurável ali mesmo).

| Comando | O quê |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build && npm start` | build de produção (PWA + service worker ativos) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | testes unitários (Vitest) — parser, seletores, planejador, ferramentas, sync, gateway, schema/RLS em Postgres em memória |
| `npm run e2e` | testes ponta a ponta (Playwright, iPhone + desktop) — rode `npm run build` antes |

No iPhone: abra no Safari → Compartilhar → **Adicionar à Tela de Início**.

## O que tem

- **Hoje** — “Agora” (uma coisa), até 2 depois, agenda, dinheiro dos próximos dias, prazos que passaram,
  um item esquecido para relembrar. O resto fica recolhido.
- **Semana** — dias com compromissos, tarefas, contas e prazos; “sem dia ainda”; projetos parados;
  **Organizar minha semana** (proposta para revisar e aplicar).
- **Mês** — calendário, dinheiro do mês, metas, o que está chegando, prazos; **Organizar meu mês**.
- **Captura rápida** (botão `+` ou tecla `N`) — escreva do jeito que vier; o app mostra como entendeu.
- **Inbox** — aceitar, editar, adiar, arquivar capturas.
- **Decisões** — Aprovar / Editar / Adiar / Ignorar. Sugestões do assistente local caem aqui.
- **Projetos** — onde estou, próxima ação, pendências, prazo, notas.
- **Finanças** — contas, despesas, recebimentos, recorrência; a pagar / pago / a receber / recebido / saldo previsto.
- **Modo foco** — só o “Agora” na tela, timer de 15/25/45 min, Feito / Pular / Amanhã.
- **Revisão semanal guiada** — 5 passos curtos: Inbox, atrasados, projetos, esquecidos, próxima semana.
- **Micropassos** — em qualquer tarefa, “Sugerir” quebra em passos de poucos minutos; o primeiro é sempre de ≤ 2 min
  (“só abrir”). Dá para usar todos ou só o primeiro.
- **Despejo** (`/despejo`) — escreva tudo solto, uma coisa por linha; o app separa em Fazer / Compromissos / Dinheiro /
  Comprar / Ideias / Preocupações, você corrige e guarda. Preocupações ficam em “Algum dia”, sem cobrança.
- **Rotina** (`/rotina`) — checklists de manhã, tarde e noite, editáveis, com progresso por dia. A do período atual
  aparece no Hoje.
- **Lembretes** (`/lembretes`) — configuráveis: quais, em que horário, silêncio, máximo por dia, antecedência de
  compromissos. Usam notificações do navegador/PWA (ou um aviso dentro do app, sem permissão). **Não há servidor de
  push**: com o app totalmente fechado nada chega. Preferências ficam só no aparelho (`leve:prefs:v1`), fora da sincronização.
- **Ditado** — botão de microfone na captura e no despejo (pt-BR). Dá para falar “nova linha”, “vírgula”, “ponto final”.
  Se o navegador não ditar, use o microfone do teclado do iPhone.
- **Contas** — login por e-mail e senha, cada pessoa com os seus dados (modo conta, ver `docs/CONTAS.md`).
- **Busca global** (lupa no Hoje ou tecla `/`) — itens, projetos, notas e capturas, sem se preocupar com acentos.
- **Gestos** — deslizar para a direita conclui, para a esquerda adia para amanhã.

Documentação: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · [docs/PROXIMA-FASE.md](docs/PROXIMA-FASE.md) · [docs/PUBLICAR.md](docs/PUBLICAR.md)
