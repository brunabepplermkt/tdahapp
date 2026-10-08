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

-- O app local usa ids de texto (ex.: itm_…). A migração local → remoto grava o id remoto como
-- UUID DETERMINÍSTICO derivado de (usuário, id local) — repetir a migração faz upsert nas mesmas
-- linhas — e guarda o id original em local_id para a volta ser sem perda.
alter table items alter column series_id type text using series_id::text;
alter table projects  add column local_id text;
alter table captures  add column local_id text;
alter table items     add column local_id text;
alter table notes     add column local_id text;
alter table decisions add column local_id text;
create unique index projects_local_id  on projects  (user_id, local_id) where local_id is not null;
create unique index captures_local_id  on captures  (user_id, local_id) where local_id is not null;
create unique index items_local_id     on items     (user_id, local_id) where local_id is not null;
create unique index notes_local_id     on notes     (user_id, local_id) where local_id is not null;
create unique index decisions_local_id on decisions (user_id, local_id) where local_id is not null;

-- O trigger de 0001 sobrescrevia updated_at com a hora do servidor em TODO update, o que faria
-- cada envio parecer uma edição nova e distorceria o desempate "último a escrever vence".
-- Agora: se o cliente já informou um updated_at novo, ele é respeitado; edição direta em SQL
-- (conteúdo mudou mas updated_at não) continua carimbada pelo servidor; reenviar a mesma linha não muda nada.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  if new.updated_at is not distinct from old.updated_at
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at = now();
  end if;
  return new;
end $$;

-- 2) auditoria ------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  local_id text,
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
create unique index audit_log_local_id on audit_log (user_id, local_id) where local_id is not null;
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
