-- Leve — schema inicial (Postgres / Supabase)
--
-- Espelha src/lib/domain/types.ts. Um único tipo de registro (items) alimenta
-- Hoje, Semana, Mês e Finanças; as telas são derivadas por data/estado.
-- Todas as tabelas têm user_id + RLS: cada pessoa só enxerga o que é seu.
--
-- NÃO APLICADO em nenhum projeto ainda. Ver docs/ARQUITETURA.md.

create extension if not exists "pgcrypto";

-- tipos -----------------------------------------------------------------------
create type area as enum ('personal', 'work', 'finance');
create type item_kind as enum ('task','event','bill','expense','income','shopping','idea','reminder','routine','goal');
create type item_status as enum ('open','done','someday','archived');
create type priority as enum ('high','normal','low');
create type recurrence_freq as enum ('daily','weekly','monthly','yearly');
create type money_direction as enum ('in','out');
create type project_status as enum ('active','paused','done');
create type capture_status as enum ('inbox','processed','snoozed','archived');
create type decision_kind as enum ('reply','approve','pay','choose_date','agent_suggestion');
create type decision_status as enum ('pending','approved','snoozed','ignored');
create type actor as enum ('user','agent','system');

-- util ------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- projetos --------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  area area not null default 'work',
  status project_status not null default 'active',
  current_state text,
  deadline date,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- capturas (inbox) ------------------------------------------------------------
create table captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null,
  status capture_status not null default 'inbox',
  snoozed_until date,
  interpretation jsonb,            -- { source, intent, drafts[], confidence, notes[] }
  created_at timestamptz not null default now()
);

-- itens: tarefa, compromisso, conta, recebimento, compra, ideia, meta... -------
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  notes text,
  kind item_kind not null default 'task',
  area area not null default 'personal',
  status item_status not null default 'open',
  priority priority not null default 'normal',
  focus_date date,                 -- “foco de hoje” escolhido manualmente

  due_date date,                   -- prazo real
  scheduled_date date,             -- dia planejado (placement = coalesce(scheduled, due))
  start_time time,
  end_time time,

  project_id uuid references projects on delete set null,
  parent_id uuid references items on delete cascade,   -- passos de um item maior
  people text[] not null default '{}',
  estimate_min int,

  -- dinheiro (opcional) — mantido no item para Hoje/Semana/Mês não duplicarem dados
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  money_direction money_direction,
  money_category text,
  settled boolean not null default false,
  settled_at timestamptz,

  -- recorrência: cada ocorrência é uma linha; series_id liga a série
  recurrence_freq recurrence_freq,
  recurrence_interval int not null default 1,
  series_id uuid,

  postpone_count int not null default 0,
  capture_id uuid references captures on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint money_consistent check ((amount_cents is null) = (money_direction is null))
);

create index items_user_placement on items (user_id, coalesce(scheduled_date, due_date)) where status = 'open';
create index items_user_project on items (user_id, project_id);
create index items_parent on items (parent_id);
create index items_series on items (series_id);

-- histórico de um item (adiamentos, conclusões...) -----------------------------
create table item_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid not null references items on delete cascade,
  type text not null,              -- created | postponed | scheduled | completed | ...
  from_date date,
  to_date date,
  note text,
  at timestamptz not null default now()
);
create index item_events_item on item_events (item_id, at desc);

-- notas / contexto ------------------------------------------------------------
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null,
  project_id uuid references projects on delete cascade,
  item_id uuid references items on delete cascade,
  created_at timestamptz not null default now()
);

-- fila de decisões ------------------------------------------------------------
create table decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind decision_kind not null,
  title text not null,
  context text,
  item_id uuid references items on delete cascade,
  project_id uuid references projects on delete cascade,
  actions jsonb not null default '[]',   -- [{ tool, input }] executadas só após aprovação
  status decision_status not null default 'pending',
  snoozed_until date,
  dedupe_key text,
  created_by actor not null default 'user',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, dedupe_key)
);

-- atividade (auditoria de agente) ---------------------------------------------
create table agent_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  actor actor not null,
  tool text not null,
  summary text not null,
  status text not null,            -- ok | error | proposed | rejected
  input jsonb,
  at timestamptz not null default now()
);

-- triggers --------------------------------------------------------------------
create trigger projects_updated before update on projects for each row execute function set_updated_at();
create trigger items_updated before update on items for each row execute function set_updated_at();

-- RLS: dono vê e altera só o que é seu ------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects','captures','items','item_events','notes','decisions','agent_activity'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end $$;
