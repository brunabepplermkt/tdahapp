-- Leve — 0002: sincronização sem perda, trilha de auditoria e concessões de agente
--
-- NÃO APLICADO em nenhum projeto ainda. Depende de 0001.
--
-- 1) items/captures passam a guardar o que o app local já tem (histórico e ids dos itens
--    criados), para a ida e volta local ⇄ remoto não perder nada.
-- 2) agent_activity vira audit_log: trilha APPEND-ONLY (origem, operação, entidade, alteração,
--    idempotência). Sem política de update/delete → ninguém reescreve o passado pelo cliente.
-- 3) agent_grants: o que cada agente/automação pode fazer. Hermes usará um token do próprio
--    usuário com escopo limitado — nunca a service role.

-- 1) sincronização sem perda -------------------------------------------------
alter table items add column history jsonb not null default '[]';
alter table captures add column item_ids uuid[] not null default '{}';

-- 2) auditoria ------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  origin text not null default 'user_app'
    check (origin in ('user_app', 'automation', 'agent', 'import')),
  actor actor not null,
  tool text not null,                 -- operação (nome da ferramenta)
  summary text not null,
  status text not null check (status in ('ok', 'error', 'proposed', 'rejected')),
  input jsonb,
  entity_type text,                   -- item | capture | project | decision | note
  entity_id text,
  change jsonb,                       -- { before?, after? } mínimo necessário
  idempotency_key text,
  request_hash text,
  decision_id text,                   -- quando executada após aprovação de uma decisão
  proposed_by text,                   -- origem que propôs (ex.: agent)
  at timestamptz not null default now()
);

-- copia o que existia (se existia) e remove a tabela antiga
insert into audit_log (user_id, origin, actor, tool, summary, status, input, at)
select user_id,
       case actor when 'agent' then 'agent' when 'system' then 'automation' else 'user_app' end,
       actor, tool, summary, status, input, at
from agent_activity;
drop table agent_activity;

-- a mesma chave de idempotência só pode ter UM resultado aceito/proposto por usuário
create unique index audit_log_idem on audit_log (user_id, idempotency_key)
  where idempotency_key is not null and status in ('ok', 'proposed');
create index audit_log_user_at on audit_log (user_id, at desc);

alter table audit_log enable row level security;
create policy audit_log_select on audit_log for select using (user_id = (select auth.uid()));
create policy audit_log_insert on audit_log for insert with check (user_id = (select auth.uid()));
-- (sem update/delete de propósito: auditoria não se edita)

-- 3) concessões de agente --------------------------------------------------------
create table agent_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  origin text not null check (origin in ('agent', 'automation')),
  allowed_tools text[] not null default '{}',     -- vazio = nada
  require_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
alter table agent_grants enable row level security;
create policy agent_grants_owner on agent_grants for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
