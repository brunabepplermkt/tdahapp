# Arquitetura e decisões

Curto e direto. O critério de tudo: **o app tem que diminuir a carga mental**, não virar mais um sistema para manter.

## Visão geral

```
src/
  lib/
    domain/        tipos, datas, dinheiro, operações puras, seletores (Hoje/Semana/Mês)
    intelligence/  interpretador de capturas, planejador, regras proativas, ferramentas READ/WRITE
    store/         Zustand + repositório (localStorage hoje, Supabase depois)
    demo/          dados fictícios relativos à data de hoje
  components/      UI (shell, itens, captura, plano, finanças, primitivas)
  app/             rotas: / (Hoje), /semana, /mes, /inbox, /decisoes, /projetos, /financas, /mais...
supabase/migrations/0001_init.sql   schema pronto (não aplicado)
```

Fluxo: **UI → store → operações puras / executor de ferramentas → novo AppData → repositório**.
A UI nunca muda dados “na mão”; tudo passa por `domain/operations.ts` (direto ou via `intelligence/tools.ts`).

## Decisões

### 1. Um único `Item` para quase tudo
Tarefa, compromisso, conta, recebimento, despesa, compra, ideia, lembrete, rotina e meta são o mesmo registro
com `kind`. Dinheiro é um bloco opcional (`money`) dentro do item.
*Por quê:* Hoje, Semana, Mês e Finanças leem os mesmos dados — sem sincronizar módulos, sem duplicação.
Uma conta com vencimento aparece no Mês, depois na Semana, depois no Hoje, sozinha.

### 2. Telas derivadas por data e estado
`placementDate = scheduledDate ?? dueDate`. **Prazo** (`dueDate`, quando *tem que*) é separado de **dia planejado**
(`scheduledDate`, quando *pretendo*). Adiar muda só o dia planejado — o prazo real nunca é escondido.
Tudo está em `domain/selectors.ts` (puro, testado).

### 3. Hoje mostra pouco, de propósito
`relevanceToday()` dá uma pontuação explicável (prazo vencido/hoje/amanhã, planejado para hoje, foco manual,
importância, prazo de projeto). Só entra em “prioridades” o que passa de um limiar, no máximo **3**.
Cada prioridade carrega o “por quê” em linguagem humana. Itens quebrados em passos aparecem pelo **próximo passo**.
Contas ficam em “Dinheiro”, compromissos em “Agenda”; o resto (planejados extras, “ficou pra trás”) fica recolhido.
Um único item esquecido por dia é relembrado com leveza.

### 4. Adiar sem culpa, com sinal
Adiar conta `postponeCount` e registra histórico. Com 3+ adiamentos o assistente sugere quebrar em passos
— porque normalmente o problema é tamanho, não preguiça.

### 5. Recorrência = uma linha por ocorrência
Concluir um item recorrente cria a próxima ocorrência (mesmo `seriesId`). Histórico de pagamentos fica preservado.
O Mês projeta ocorrências futuras virtualmente (sem gravar) para o saldo previsto.

### 6. Camada de inteligência desacoplada
- `CaptureInterpreter` (interface). Implementação atual: **heurística local em pt-BR** (datas relativas, valores,
  recorrência, tipo, área, projeto por nome/apelido, pessoas, divisão em várias tarefas). Explica o que entendeu.
  Não há IA real configurada — e o app diz isso.
- `planner.ts`: “Organizar semana/mês” gera **proposta** (movimentos + avisos + o que ficou de fora). Nada é gravado
  até você aplicar; você pode desmarcar movimentos.
- `rules.ts`: o “observador” local. Propõe ações (contas vencendo, item adiado 3×, projeto sem próxima ação,
  compromissos em conflito) **como agente** — e por isso elas viram decisões.

### 7. Ferramentas READ vs WRITE, com confirmação
`intelligence/tools.ts`:
- **READ**: `get_today`, `get_week`, `get_month`, `search_items`, `list_projects`, `get_project`,
  `finance_summary`, `list_inbox`, `list_decisions`.
- **WRITE internas**: `create_item`, `update_item`, `schedule_item`, `postpone_item`, `complete_item`, `mark_paid`,
  `add_steps`, `accept_capture`, `add_note`.
- **Externas** (`send_message`, `create_calendar_event`, `pay_bill`, `read_calendar`): declaradas e **desabilitadas**.

`executeTool()`: quando o ator é `agent` e a ferramenta exige confirmação (todas as WRITE relevantes) ou é externa,
a chamada **vira uma Decisão** em vez de executar. Aprovar roda as ações via o mesmo executor. Tudo é registrado em
`activity` (tela Atividade). `toolManifest()` entrega a descrição pronta para um LLM.

**Hermes (futuro):** entra como mais um ator `agent` consumindo `toolManifest()` + `executeTool()`.
Não precisa de nada novo na UI: o que ele quiser mudar aparece em Decisões.

### 8. Persistência: local agora, Supabase pronto
`DataRepository` com `LocalRepository` (localStorage). Motivo: sem credenciais nesta sessão, e o app funciona
offline/instantâneo. O schema Postgres com RLS por usuário está em `supabase/migrations/0001_init.sql`
(itens com colunas de dinheiro/recorrência, histórico em `item_events`, decisões com `actions jsonb`, auditoria).

### 9. Stack
Next.js 16 (App Router, Cache Components ligado pelo template), React 19, TypeScript, Tailwind v4, Zustand,
date-fns, Vitest. Páginas são Client Components (dados vivem no cliente); o shell é pré-renderizado.
PWA: `manifest.ts`, ícones, `public/sw.js` (cache de assets + fallback offline das navegações; só em produção).

### 10. Design
Fonte do sistema (SF Pro no iPhone), tons quase neutros, **cor só com significado** (vencido, dinheiro saindo/entrando,
ação principal, pontinho de área). Grupos estilo iOS, toque ≥ 44px, barra inferior + botão `+` sempre visível,
folhas (bottom sheets) em vez de telas novas. Modo escuro automático. Linguagem humana, sem culpa.

## Segurança
- Sem secrets no código; `.env.example` só documenta variáveis futuras.
- Nenhuma integração externa ativa. Ferramentas externas existem só como contrato, desabilitadas.
- “Já paguei” registra um pagamento; o app nunca movimenta dinheiro.
- Cabeçalhos básicos (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) em `next.config.ts`.
