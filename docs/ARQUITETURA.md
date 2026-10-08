# Arquitetura e decisões

Curto e direto. O critério de tudo: **o app tem que diminuir a carga mental**, não virar mais um sistema para manter.

## Visão geral

```
src/
  lib/
    domain/        tipos, datas, dinheiro, operações puras, seletores (Hoje/Semana/Mês)
    intelligence/  interpretador de capturas (local + estruturado), planejador, regras proativas
    tools/         ferramentas READ/WRITE, política por origem, idempotência, auditoria, gateway p/ agentes
    sync/          motor local ⇄ Supabase, ids, adaptador, backend falso, controlador de conta
    store/         Zustand + repositório (localStorage; a nuvem é uma cópia sincronizada)
    demo/          dados fictícios relativos à data de hoje
  components/      UI (shell, itens, captura, plano, finanças, primitivas)
  app/             rotas: / (Hoje), /semana, /mes, /inbox, /decisoes, /projetos, /financas, /mais...
supabase/migrations/0001_init.sql, 0002_sync_audit_agents.sql   schema pronto (não aplicado)
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

### 7. Camada de ferramentas (`src/lib/tools/`) — READ vs WRITE, origem, auditoria
Uma ferramenta é **contrato + validação (zod, estrito) + chamada ao domínio** — nenhuma regra de negócio vive nela:
`domain/operations.ts` (escrita) e `domain/selectors.ts` / `domain/search.ts` (leitura) são as MESMAS funções que a UI usa.

- **READ** (`mode: "read"`): `get_today`, `get_week`, `get_month`, `search`, `list_projects`, `get_project`, `get_inbox`,
  `get_decisions`, `get_financial_summary`. Nunca alteram dados nem geram auditoria.
- **WRITE** (`mode: "write"`): `capture_item`, `create_item`, `update_item`, `complete_item`, `snooze_item`,
  `create_financial_entry`, `schedule_item`, `mark_paid`, `add_steps`, `accept_capture`, `add_note`.
  Cada uma declara um `risk` (`low` / `normal` / `high`).
- **Externas** (`send_message`, `create_calendar_event`, `pay_bill`, `read_calendar`): contrato apenas, `enabled: false`.
- Nomes antigos (`postpone_item`, `search_items`, `list_inbox`…) continuam valendo via `LEGACY_ALIASES` — decisões já
  gravadas no aparelho não quebram.

**Pipeline de uma escrita** (`executor.ts`): resolver nome → validar entrada → **autorizar por origem/escopo** →
**idempotência** → (sensível? vira **Decisão**) → executar no domínio → **auditar**.

| Origem | Pode | Escritas |
| --- | --- | --- |
| `user_app` | tudo que está habilitado | direto |
| `automation` | ler | `risk: low` direto; o resto vira Decisão |
| `agent` | ler | `risk: low` direto (ex.: `capture_item` → Inbox); o resto vira Decisão; **exige `idempotencyKey`** |
| `import` | só `capture_item`, `create_item`, `create_financial_entry`; não lê | direto; **exige `idempotencyKey`** |

`Principal.scopes` (concessão) só restringe, nunca amplia. A origem vem da sessão autenticada — um pedido que tente
mandar `origin` no corpo é recusado (schema estrito) e a tentativa é auditada com a origem real.
`capture_item` com `accept: true` por agente também vira Decisão (criar itens direto não é “baixo risco”).

**Auditoria** (`AgentActivity`, antiga “atividade”): origem, operação, entidades afetadas (`create|update|delete`), alteração
mínima campo a campo (antes → depois, calculada por diff genérico — nenhuma ferramenta precisa lembrar de auditar),
horário, id, `idempotencyKey`, hash do pedido e, quando veio de aprovação, `decisionId` + `proposedBy`.
Recusas e propostas também ficam na trilha. No remoto é a tabela `audit_log`, **append-only** (sem update/delete na RLS).

**Idempotência:** mesma chave + mesmo pedido ⇒ `replayed: true`, nada executa de novo; mesma chave + pedido diferente ⇒
`idempotency_conflict`. Repetir um pedido que virou Decisão não duplica a Decisão; depois de aprovado, o repeteco recebe
`ok/replayed`. No Postgres há índice único `(user_id, idempotency_key)` para resultados `ok`/`proposed`.

**Gateway** (`gateway.ts`): a fronteira para agentes — `call(nome, entrada, { idempotencyKey })` carrega o estado (fonte
única), executa, salva e devolve JSON puro. Serializa chamadas, só responde `ok` depois de persistir e usa o
interpretador assíncrono registrado (ou o local) em `capture_item`. **Não há endpoint HTTP, WhatsApp nem Hermes ligados.**

### 8. Persistência: local primeiro, Supabase pronto e desligado
- `DataRepository` / `LocalRepository` (localStorage) seguem sendo a fonte do app. Salvar é imediato e **nunca depende de rede**.
- `src/lib/sync/` (offline-first): `rows.ts` (AppData ⇄ linhas, ids UUID determinísticos de `(usuário, id local)` + `local_id`),
  `engine.ts` (3 vias local × remoto × base, upsert idempotente, retomável, remoções em massa retidas até confirmar),
  `rebase.ts` (edições feitas durante o sync nunca são sobrescritas), `remote.ts` (contrato), `supabase.ts` (adaptador com
  a sessão do usuário — sem service role), `fake-remote.ts` (backend em memória com RLS, FKs e falhas de rede para teste),
  `controller.ts` (conta por link no e-mail, “Enviar dados deste aparelho”, sync em segundo plano, volta ao app, `online`).
- Sem `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` o controlador fica em `unconfigured` e **nada muda** (nenhuma chamada de rede).
  Chave `service_role` colada por engano no cliente é detectada e recusada (`config.ts`).
- **Migração local → remoto:** só depois de entrar e clicar em “Enviar dados deste aparelho”; faz backup antes, nunca apaga
  nada (nem local nem remoto), repetir é seguro (mesmas linhas por id estável), e uma falha no meio mantém o progresso.
- Conflitos: edição só de um lado vence; dos dois, vence o `updated_at` mais recente (empate: local). Apagar propaga apenas o
  que já tinha sido sincronizado. Sem tombstones: se um aparelho apaga e outro edita, a edição ressuscita o item.
- Schema: `0001_init.sql` + `0002_sync_audit_agents.sql` (ver `supabase/`). Testado em **Postgres real** (PGlite): as
  migrations aplicam em sequência, toda tabela tem RLS, isolamento entre usuários, `audit_log` imutável, e as linhas que o
  app gera gravam e voltam idênticas.

### 8b. Inteligência estruturada (`src/lib/intelligence/`)
`structured.ts` define o schema estrito (`itens → título, tipo, área, prioridade, datas/horas, projeto, pessoas, contexto,
dinheiro, recorrência`) e `validateStructured()` converte a saída crua de QUALQUER provider em `Interpretation`: campos extras,
datas inexistentes, valores negativos/fracionados são recusados; projeto desconhecido nunca é criado; dinheiro sempre vira
conta/despesa/recebimento. `pipeline.ts` (`createStructuredInterpreter`) tenta o provider com timeout, valida e **cai no
parser local** em qualquer falha (resposta inválida, fora do ar, lento). O parser local entende “sexta preciso pagar a VPS e
terminar o checkout do Beds24” (2 itens, ambos na sexta, projeto pelo apelido “Beds24”). **Nenhum provider/modelo real está
configurado**; `buildExtractionPrompt` trata a captura como dado, não instrução.

### 8c. Hermes (futuro) — como conectar sem criar um segundo sistema
```
WhatsApp/Home Channel ↔ Hermes ↔ gateway (createToolGateway) ↔ tools ↔ domínio ↔ mesma fonte de dados do app
```
1. Rota de servidor autenticada (sessão do próprio usuário, RLS ligada — **nunca service role**) monta
   `createToolGateway({ principal: { origin: "agent", scopes }, store })`, onde `store` lê/grava via Supabase com o JWT do usuário.
2. Hermes recebe `toolManifest()` (JSON Schema + política por origem) e chama `gateway.call(...)` com `idempotencyKey` = id da
   mensagem do canal. “o que tenho hoje?” → `get_today`; “sexta preciso pagar a VPS” → `capture_item` (cai na Inbox).
3. Tudo que muda dados além de capturar vira **Decisão** no app e só roda ao aprovar; fica na trilha com `proposedBy: agent`.
4. Hermes não tem banco, memória ou estado próprios: ler e escrever só pelo gateway.
Pendente para esse dia: o endpoint HTTP, a concessão (`agent_grants` já existe no schema), mapeamento canal → usuário e
rate limit.

### 9. Stack
Next.js 16 (App Router, Cache Components ligado pelo template), React 19, TypeScript, Tailwind v4, Zustand,
date-fns, Vitest. Páginas são Client Components (dados vivem no cliente); o shell é pré-renderizado.
PWA: `manifest.ts`, ícones, `public/sw.js` (cache de assets + fallback offline das navegações; só em produção).

### 10. Design (v3 — calmo, branco, pouco texto)
Princípio: **“o que merece minha atenção agora?”** — uma coisa principal por tela, pouco texto, progresso visível.
- **Tokens** em `src/app/globals.css`: fundo **branco puro**, cards em lavanda-gelo (`--surface`), tinta quase preta, **coral** como
  único acento (botão principal, aba ativa, destaque do título), lilás só em ícones. Vencido = vermelho-tijolo sempre com palavra.
  Contrastes de texto ≥ 4.5:1 (claro e escuro).
- **Tipografia:** Outfit (OFL, via `next/font`) em peso leve para títulos/números; corpo na fonte do sistema. Classes `t-display`,
  `t-title`, `t-heading`, `t-label`.
- **Estrutura:** listas secundárias são “flat” (linhas finas sobre o fundo, `Group flat`); cartões só para o que merece destaque
  (o “Agora”, Decisões, calendário, dinheiro). A `aura` (mancha suave) aparece só no hero do “Agora” e no Modo Foco.
- **Mobile:** barra inferior flutuante (aba ativa em coral), botão `+` que some quando o convite “Joga aqui…” do Hoje está à vista,
  toque ≥ 44px, `prefers-reduced-motion` respeitado.
- **Texto:** sem introduções/dicas; no máximo 2 metadados por item; frases viram número, ícone ou uma palavra.

## Segurança
- Sem service role no cliente (teste automático vigia `src/`); RLS em todas as tabelas; escritas passam por validação + política + auditoria.
- Sem secrets no código; `.env.example` só documenta variáveis futuras.
- Nenhuma integração externa ativa. Ferramentas externas existem só como contrato, desabilitadas.
- “Já paguei” registra um pagamento; o app nunca movimenta dinheiro.
- Cabeçalhos básicos (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) em `next.config.ts`.
