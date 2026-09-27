-- M3 E03 confirms low-confidence or sensitive memory candidates through Telegram.

alter table public.memory_candidates
  add column decided_at timestamptz,
  add column decision_source text
    check (decision_source in ('automatic', 'telegram'));

update public.memory_candidates
set status = 'confirmed',
    decided_at = now(),
    decision_source = 'automatic',
    updated_at = now()
where status = 'pending'
  and category <> 'health'
  and confidence >= 0.8;

alter table public.memory_candidates
  add constraint memory_candidates_decision_state_check
    check (
      (status = 'pending' and decided_at is null and decision_source is null)
      or
      (status in ('confirmed', 'rejected') and decided_at is not null and decision_source is not null)
    );

create table public.memory_confirmation_outbox (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.job_runs(id) on delete restrict,
  memory_candidate_id uuid not null unique
    references public.memory_candidates(id) on delete restrict,
  recipient_chat_id bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'retryable_failed', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  provider_message_id text check (
    provider_message_id is null or length(provider_message_id) between 1 and 100
  ),
  last_error_code text check (
    last_error_code is null or length(last_error_code) between 1 and 100
  ),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sending' or claimed_at is not null),
  check (status <> 'sent' or sent_at is not null)
);

create index memory_confirmation_outbox_claimable_idx
  on public.memory_confirmation_outbox (available_at, created_at)
  where status in ('pending', 'retryable_failed', 'sending');
create index memory_confirmation_outbox_job_run_id_idx
  on public.memory_confirmation_outbox (job_run_id);

alter table public.memory_confirmation_outbox enable row level security;
revoke all on table public.memory_confirmation_outbox
  from anon, authenticated, service_role;
grant select, insert, update, delete on table public.memory_confirmation_outbox
  to service_role;

create or replace function public.persist_nightly_extraction_versioned(
  p_job_run_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_row public.job_runs%rowtype;
  diary_row public.diaries%rowtype;
  next_version integer;
  save_result jsonb;
  candidate jsonb;
  candidate_id uuid;
  source_id uuid;
  invalid_source_id uuid;
  candidate_confidence numeric;
  candidate_category text;
  memory_candidate_count integer := 0;
begin
  select * into run_row
  from public.job_runs
  where id = p_job_run_id
  for update;

  if not found or run_row.job_type <> 'nightly' then
    raise exception 'nightly job run not found';
  end if;

  if run_row.status = 'succeeded' then
    select * into diary_row from public.diaries where job_run_id = p_job_run_id;
    if not found then raise exception 'succeeded nightly job is missing its diary'; end if;
    return jsonb_build_object(
      'action', 'noop', 'jobRunId', p_job_run_id,
      'diaryId', diary_row.id, 'diaryVersion', diary_row.version
    );
  end if;

  if run_row.status <> 'running' then raise exception 'nightly job run must be running'; end if;
  if jsonb_typeof(p_result -> 'memoryCandidates') <> 'array' then
    raise exception 'memoryCandidates must be an array';
  end if;

  select candidate_source.id into invalid_source_id
  from (
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid as id
    from jsonb_array_elements(p_result -> 'memoryCandidates')
  ) candidate_source
  left join public.messages
    on messages.id = candidate_source.id
   and messages.role = 'user'
   and messages.day = run_row.day
  where messages.id is null
  limit 1;
  if invalid_source_id is not null then
    raise exception 'memory candidate source message is outside the job snapshot day';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dailychat:diary:' || run_row.day::text, 0)
  );
  select coalesce(max(version), 0) + 1 into next_version
  from public.diaries where day = run_row.day;
  save_result := public.persist_nightly_extraction(p_job_run_id, p_result, next_version);

  for candidate in select value from jsonb_array_elements(p_result -> 'memoryCandidates')
  loop
    if jsonb_array_length(candidate -> 'sourceMessageIds') < 1 then
      raise exception 'memory candidate requires a source message';
    end if;
    if candidate ->> 'validFrom' <> run_row.day::text
       or jsonb_typeof(candidate -> 'validTo') <> 'null' then
      raise exception 'new memory candidate validity must match the job day';
    end if;

    candidate_confidence := (candidate ->> 'confidence')::numeric;
    candidate_category := candidate ->> 'category';
    insert into public.memory_candidates (
      job_run_id, day, category, fact, confidence, status,
      valid_from, valid_to, decided_at, decision_source
    ) values (
      p_job_run_id, run_row.day, candidate_category, candidate ->> 'fact',
      candidate_confidence,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then 'confirmed' else 'pending' end,
      (candidate ->> 'validFrom')::date, (candidate ->> 'validTo')::date,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then now() else null end,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then 'automatic' else null end
    ) returning id into candidate_id;

    for source_id in select jsonb_array_elements_text(candidate -> 'sourceMessageIds')::uuid
    loop
      insert into public.memory_candidate_message_sources (memory_candidate_id, message_id)
      values (candidate_id, source_id);
    end loop;
    memory_candidate_count := memory_candidate_count + 1;
  end loop;

  return jsonb_build_object(
    'action', 'saved', 'memoryCandidateCount', memory_candidate_count
  ) || save_result;
end;
$$;

create or replace function public.enqueue_memory_confirmations(p_job_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chat_id bigint;
  result jsonb;
begin
  if not exists (
    select 1 from public.job_runs
    where id = p_job_run_id and job_type = 'nightly' and status = 'succeeded'
  ) then
    raise exception 'succeeded nightly job not found';
  end if;
  select telegram_chat_id into chat_id from public.settings where id = 1;
  if chat_id is null then raise exception 'Telegram chat is not configured'; end if;

  insert into public.memory_confirmation_outbox (
    job_run_id, memory_candidate_id, recipient_chat_id
  )
  select p_job_run_id, c.id, chat_id
  from public.memory_candidates c
  where c.job_run_id = p_job_run_id and c.status = 'pending'
  on conflict (memory_candidate_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
    'notificationId', o.id,
    'memoryCandidateId', o.memory_candidate_id,
    'status', o.status
  ) order by o.created_at), '[]'::jsonb)
  into result
  from public.memory_confirmation_outbox o
  where o.job_run_id = p_job_run_id;
  return result;
end;
$$;

create or replace function public.claim_memory_confirmation(p_notification_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payload jsonb;
begin
  with claimed as (
    update public.memory_confirmation_outbox
    set status = 'sending', attempt = attempt + 1, claimed_at = now(),
        last_error_code = null, updated_at = now()
    where id = p_notification_id
      and available_at <= now()
      and exists (
        select 1 from public.memory_candidates candidate
        where candidate.id = memory_confirmation_outbox.memory_candidate_id
          and candidate.status = 'pending'
      )
      and (
        status in ('pending', 'retryable_failed')
        or (status = 'sending' and updated_at < now() - interval '5 minutes')
      )
    returning *
  )
  select jsonb_build_object(
    'notificationId', c.id,
    'memoryCandidateId', c.memory_candidate_id,
    'recipientChatId', c.recipient_chat_id::text,
    'attempt', c.attempt,
    'category', m.category,
    'fact', m.fact
  ) into payload
  from claimed c
  join public.memory_candidates m on m.id = c.memory_candidate_id
  where m.status = 'pending';
  return payload;
end;
$$;

create or replace function public.complete_memory_confirmation(
  p_notification_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  if p_provider_message_id is null or length(p_provider_message_id) not between 1 and 100 then
    raise exception 'provider message ID is invalid';
  end if;
  update public.memory_confirmation_outbox
  set status = 'sent', provider_message_id = p_provider_message_id,
      sent_at = now(), updated_at = now()
  where id = p_notification_id and status = 'sending';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_memory_confirmation(
  p_notification_id uuid,
  p_error_code text,
  p_retryable boolean,
  p_retry_after_seconds integer default 0
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,100}$' then
    raise exception 'notification error code is invalid';
  end if;
  if p_retryable is null then raise exception 'retryable flag is required'; end if;
  if p_retry_after_seconds is null or p_retry_after_seconds not between 0 and 86400 then
    raise exception 'retry delay must be between 0 and 86400 seconds';
  end if;
  update public.memory_confirmation_outbox
  set status = case when p_retryable then 'retryable_failed' else 'failed' end,
      last_error_code = p_error_code,
      available_at = case when p_retryable
        then now() + make_interval(secs => p_retry_after_seconds) else available_at end,
      claimed_at = null, updated_at = now()
  where id = p_notification_id and status = 'sending';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.decide_memory_candidate(
  p_memory_candidate_id uuid,
  p_decision text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.memory_candidates%rowtype;
  target_status text;
begin
  if not exists (
    select 1 from public.settings
    where id = 1
      and telegram_user_id = p_telegram_user_id
      and telegram_chat_id = p_telegram_chat_id
  ) then
    raise exception 'Telegram identity is not authorized';
  end if;
  if p_decision not in ('confirm', 'reject') then
    raise exception 'memory decision is invalid';
  end if;
  target_status := case when p_decision = 'confirm' then 'confirmed' else 'rejected' end;

  select * into candidate
  from public.memory_candidates
  where id = p_memory_candidate_id
  for update;
  if not found then raise exception 'memory candidate not found'; end if;

  if candidate.status = 'pending' then
    update public.memory_candidates
    set status = target_status, decided_at = now(),
        decision_source = 'telegram', updated_at = now()
    where id = p_memory_candidate_id;
    return jsonb_build_object('action', 'updated', 'status', target_status);
  end if;
  if candidate.status = target_status then
    return jsonb_build_object('action', 'noop', 'status', target_status);
  end if;
  return jsonb_build_object('action', 'conflict', 'status', candidate.status);
end;
$$;

revoke all on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.enqueue_memory_confirmations(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_memory_confirmation(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_memory_confirmation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_memory_confirmation(uuid, text, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.decide_memory_candidate(uuid, text, bigint, bigint)
  from public, anon, authenticated;

grant execute on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  to service_role;
grant execute on function public.enqueue_memory_confirmations(uuid) to service_role;
grant execute on function public.claim_memory_confirmation(uuid) to service_role;
grant execute on function public.complete_memory_confirmation(uuid, text) to service_role;
grant execute on function public.fail_memory_confirmation(uuid, text, boolean, integer)
  to service_role;
grant execute on function public.decide_memory_candidate(uuid, text, bigint, bigint)
  to service_role;

comment on table public.memory_confirmation_outbox is
  'Reference-only Telegram delivery state for user-confirmed memory candidates.';
comment on function public.decide_memory_candidate(uuid, text, bigint, bigint) is
  'Idempotently confirms or rejects a pending candidate for the configured Telegram owner.';
