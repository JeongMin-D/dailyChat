-- MindCompanion foundation
-- P0 첫 migration: 단일 사용자 설정, 원문 메시지, 작업 실행 원장

create extension if not exists pgcrypto;

create table settings (
  id integer primary key default 1 check (id = 1),
  owner_email text not null,
  telegram_user_id bigint,
  telegram_chat_id bigint,
  timezone text not null default 'Asia/Seoul',
  day_boundary_hour integer not null default 4
    check (day_boundary_hour between 0 and 23),
  diary_final_time time not null default '04:05',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function local_day(
  ts timestamptz,
  tz text default 'Asia/Seoul',
  boundary_hour integer default 4
) returns date
language sql
stable
parallel safe
set search_path = ''
as $$
  select ((ts at time zone tz) - make_interval(hours => boundary_hour))::date
$$;

create table messages (
  id uuid primary key default gen_random_uuid(),
  telegram_update_id bigint,
  telegram_message_id bigint,
  telegram_chat_id bigint,
  reply_to_update_id bigint,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (length(content) > 0),
  sent_at timestamptz not null,
  day date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (telegram_chat_id, telegram_message_id, role)
);

create unique index messages_telegram_update_id_unique
  on messages (telegram_update_id)
  where telegram_update_id is not null and role = 'user';

create unique index messages_reply_to_update_id_unique
  on messages (reply_to_update_id)
  where reply_to_update_id is not null and role = 'assistant';

create index messages_day_sent_at_idx on messages (day, sent_at);

create table telegram_updates (
  update_id bigint primary key,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'retryable_failed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function claim_telegram_update(p_update_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  insert into telegram_updates (update_id)
  values (p_update_id)
  on conflict (update_id) do update
    set status = 'processing',
        attempts = telegram_updates.attempts + 1,
        last_error_code = null,
        updated_at = now()
    where telegram_updates.status = 'retryable_failed'
       or (
         telegram_updates.status = 'processing'
         and telegram_updates.updated_at < now() - interval '5 minutes'
       );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function claim_telegram_update(bigint) from public, anon, authenticated;
grant execute on function claim_telegram_update(bigint) to service_role;

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  day date,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'retryable_failed', 'failed')),
  pipeline_version text not null,
  input_hash text,
  attempt integer not null default 0 check (attempt >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (job_type, day, pipeline_version, input_hash)
);

alter table settings enable row level security;
alter table messages enable row level security;
alter table telegram_updates enable row level security;
alter table job_runs enable row level security;

-- The Bot/Worker accesses these objects through the server-only service role.
-- Explicit grants are required on projects where automatic Data API exposure is disabled.
revoke all on table settings, messages, telegram_updates, job_runs
  from anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select, insert, update, delete
  on table settings, messages, telegram_updates, job_runs
  to service_role;

revoke all on function local_day(timestamptz, text, integer) from public, anon, authenticated;
grant execute on function local_day(timestamptz, text, integer) to service_role;

comment on table messages is
  'Immutable evidence messages. Application calculates day using settings before insert.';
comment on table telegram_updates is
  'Telegram update processing state used for retries and concurrency control.';
comment on table job_runs is
  'Idempotent execution ledger for nightly and delivery jobs.';
