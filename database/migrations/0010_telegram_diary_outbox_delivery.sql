-- Register and deliver reference-only Telegram diary notifications.
-- Diary text is resolved only while a due notification is claimed.

alter table public.notification_outbox
  add constraint notification_outbox_provider_message_id_length_check
    check (
      provider_message_id is null
      or length(provider_message_id) between 1 and 100
    ),
  add constraint notification_outbox_last_error_code_length_check
    check (
      last_error_code is null
      or length(last_error_code) between 1 and 100
    );

create or replace function public.enqueue_diary_notification(
  p_job_run_id uuid,
  p_diary_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chat_id bigint;
  outbox_row public.notification_outbox%rowtype;
begin
  if not exists (
    select 1
    from public.diaries d
    join public.job_runs j on j.id = d.job_run_id
    where d.id = p_diary_id
      and d.job_run_id = p_job_run_id
      and j.status = 'succeeded'
  ) then
    raise exception 'succeeded diary does not match job run';
  end if;

  select telegram_chat_id
  into chat_id
  from public.settings
  where id = 1;

  if chat_id is null then
    raise exception 'Telegram chat is not configured';
  end if;

  insert into public.notification_outbox (
    job_run_id,
    diary_id,
    channel,
    notification_type,
    recipient_chat_id,
    idempotency_key
  ) values (
    p_job_run_id,
    p_diary_id,
    'telegram',
    'daily_diary',
    chat_id,
    'telegram:daily_diary:' || p_diary_id::text
  )
  on conflict (diary_id, channel, notification_type) do nothing
  returning * into outbox_row;

  if not found then
    select *
    into outbox_row
    from public.notification_outbox
    where diary_id = p_diary_id
      and channel = 'telegram'
      and notification_type = 'daily_diary';
  end if;

  if outbox_row.job_run_id <> p_job_run_id then
    raise exception 'existing notification does not match job run';
  end if;

  return jsonb_build_object(
    'notificationId', outbox_row.id,
    'jobRunId', outbox_row.job_run_id,
    'diaryId', outbox_row.diary_id,
    'status', outbox_row.status
  );
end;
$$;

create or replace function public.claim_diary_notification(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payload jsonb;
begin
  with claimed as (
    update public.notification_outbox
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
      )
    returning *
  )
  select jsonb_build_object(
    'notificationId', c.id,
    'jobRunId', c.job_run_id,
    'diaryId', c.diary_id,
    'recipientChatId', c.recipient_chat_id::text,
    'attempt', c.attempt,
    'day', d.day,
    'version', d.version,
    'title', d.title,
    'blocks', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('position', b.position, 'text', b.text)
          order by b.position
        )
        from public.diary_blocks b
        where b.diary_id = c.diary_id
      ),
      '[]'::jsonb
    )
  )
  into payload
  from claimed c
  join public.diaries d on d.id = c.diary_id;

  return payload;
end;
$$;

create or replace function public.complete_diary_notification(
  p_notification_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_provider_message_id is null
     or length(p_provider_message_id) not between 1 and 100 then
    raise exception 'provider message ID is invalid';
  end if;

  update public.notification_outbox
  set status = 'sent',
      provider_message_id = p_provider_message_id,
      last_error_code = null,
      sent_at = now(),
      updated_at = now()
  where id = p_notification_id
    and status = 'sending';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_diary_notification(
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
declare
  affected integer;
begin
  if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,100}$' then
    raise exception 'notification error code is invalid';
  end if;
  if p_retryable is null then
    raise exception 'retryable flag is required';
  end if;
  if p_retry_after_seconds is null
     or p_retry_after_seconds not between 0 and 86400 then
    raise exception 'retry delay must be between 0 and 86400 seconds';
  end if;

  update public.notification_outbox
  set status = case when p_retryable then 'retryable_failed' else 'failed' end,
      last_error_code = p_error_code,
      available_at = case
        when p_retryable then now() + make_interval(secs => p_retry_after_seconds)
        else available_at
      end,
      claimed_at = null,
      updated_at = now()
  where id = p_notification_id
    and status = 'sending';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.enqueue_diary_notification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_diary_notification(uuid, uuid)
  to service_role;

revoke all on function public.claim_diary_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_diary_notification(uuid)
  to service_role;

revoke all on function public.complete_diary_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_diary_notification(uuid, text)
  to service_role;

revoke all on function public.fail_diary_notification(uuid, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.fail_diary_notification(uuid, text, boolean, integer)
  to service_role;

comment on function public.enqueue_diary_notification(uuid, uuid) is
  'Idempotently registers one Telegram notification for a succeeded diary.';
comment on function public.claim_diary_notification(uuid) is
  'Claims one due diary notification and resolves its transient Telegram payload.';
comment on function public.complete_diary_notification(uuid, text) is
  'Marks a sending diary notification sent with its Telegram message ID.';
comment on function public.fail_diary_notification(uuid, text, boolean, integer) is
  'Records a stable failure code and optionally schedules a bounded retry.';
