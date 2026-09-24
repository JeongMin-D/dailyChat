-- Operational state for the nightly pipeline and its Telegram delivery outbox.
-- The outbox stores references only; user-authored text remains in diary tables.

alter table job_runs
  add column available_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add constraint job_runs_job_type_length_check
    check (length(job_type) between 1 and 64),
  add constraint job_runs_pipeline_version_length_check
    check (length(pipeline_version) between 1 and 64),
  add constraint job_runs_running_started_at_check
    check (status <> 'running' or started_at is not null),
  add constraint job_runs_terminal_finished_at_check
    check (status not in ('succeeded', 'failed') or finished_at is not null);

create index job_runs_claimable_idx
  on job_runs (available_at, created_at)
  where status in ('queued', 'retryable_failed', 'running');

create or replace function claim_job_run(p_job_run_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update job_runs
  set status = 'running',
      attempt = attempt + 1,
      started_at = now(),
      finished_at = null,
      error_code = null,
      updated_at = now()
  where id = p_job_run_id
    and available_at <= now()
    and (
      status in ('queued', 'retryable_failed')
      or (
        status = 'running'
        and updated_at < now() - interval '5 minutes'
      )
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function claim_job_run(uuid) from public, anon, authenticated;
grant execute on function claim_job_run(uuid) to service_role;

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  diary_id uuid not null references diaries(id) on delete restrict,
  channel text not null check (channel in ('telegram')),
  notification_type text not null default 'daily_diary'
    check (notification_type in ('daily_diary')),
  recipient_chat_id bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'retryable_failed', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  idempotency_key text not null unique
    check (length(idempotency_key) between 1 and 200),
  provider_message_id text,
  last_error_code text,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sending' or claimed_at is not null),
  check (status <> 'sent' or sent_at is not null),
  unique (diary_id, channel, notification_type)
);

create index notification_outbox_claimable_idx
  on notification_outbox (available_at, created_at)
  where status in ('pending', 'retryable_failed', 'sending');
create index notification_outbox_job_run_id_idx
  on notification_outbox (job_run_id);

create or replace function claim_notification(p_notification_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update notification_outbox
  set status = 'sending',
      attempt = attempt + 1,
      claimed_at = now(),
      last_error_code = null,
      updated_at = now()
  where id = p_notification_id
    and available_at <= now()
    and (
      status in ('pending', 'retryable_failed')
      or (
        status = 'sending'
        and updated_at < now() - interval '5 minutes'
      )
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function claim_notification(uuid) from public, anon, authenticated;
grant execute on function claim_notification(uuid) to service_role;

alter table notification_outbox enable row level security;

revoke all on table notification_outbox
  from anon, authenticated, service_role;
grant select, insert, update, delete on table notification_outbox
  to service_role;

comment on function claim_job_run(uuid) is
  'Atomically claims a due or stale job run for one Worker attempt.';
comment on table notification_outbox is
  'Reference-only Telegram delivery queue separated from diary generation.';
comment on function claim_notification(uuid) is
  'Atomically claims a due or stale notification for one delivery attempt.';
