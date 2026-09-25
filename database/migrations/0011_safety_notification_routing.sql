-- Route nightly notifications by restricted safety level.
-- Urgent runs never expose diary title or blocks to the delivery worker.

alter table public.notification_outbox
  drop constraint notification_outbox_notification_type_check,
  add constraint notification_outbox_notification_type_check
    check (notification_type in ('daily_diary', 'safety_guidance'));

update public.notification_outbox n
set notification_type = 'safety_guidance',
    idempotency_key = 'telegram:safety_guidance:' || n.diary_id::text,
    updated_at = now()
from public.diaries d
join public.safety_assessments s on s.job_run_id = d.job_run_id
where n.diary_id = d.id
  and s.level = 'urgent'
  and n.status <> 'sent';

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
  safety_level text;
  routed_type text;
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

  select s.level
  into safety_level
  from public.safety_assessments s
  where s.job_run_id = p_job_run_id;

  safety_level := coalesce(safety_level, 'none');
  routed_type := case
    when safety_level = 'urgent' then 'safety_guidance'
    else 'daily_diary'
  end;

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
    routed_type,
    chat_id,
    'telegram:' || routed_type || ':' || p_diary_id::text
  )
  on conflict (diary_id, channel, notification_type) do nothing
  returning * into outbox_row;

  if not found then
    select *
    into outbox_row
    from public.notification_outbox
    where diary_id = p_diary_id
      and channel = 'telegram'
      and notification_type = routed_type;
  end if;

  if outbox_row.job_run_id <> p_job_run_id then
    raise exception 'existing notification does not match job run';
  end if;

  return jsonb_build_object(
    'notificationId', outbox_row.id,
    'jobRunId', outbox_row.job_run_id,
    'diaryId', outbox_row.diary_id,
    'notificationType', outbox_row.notification_type,
    'safetyLevel', safety_level,
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
    update public.notification_outbox n
    set status = 'sending',
        attempt = attempt + 1,
        claimed_at = now(),
        last_error_code = null,
        updated_at = now()
    where n.id = p_notification_id
      and n.available_at <= now()
      and (
        n.status in ('pending', 'retryable_failed')
        or (
          n.status = 'sending'
          and n.updated_at < now() - interval '5 minutes'
        )
      )
      and (
        (
          n.notification_type = 'safety_guidance'
          and exists (
            select 1
            from public.safety_assessments urgent_safety
            where urgent_safety.job_run_id = n.job_run_id
              and urgent_safety.level = 'urgent'
          )
        )
        or (
          n.notification_type = 'daily_diary'
          and not exists (
            select 1
            from public.safety_assessments urgent_safety
            where urgent_safety.job_run_id = n.job_run_id
              and urgent_safety.level = 'urgent'
          )
        )
      )
    returning *
  )
  select jsonb_build_object(
    'notificationId', c.id,
    'jobRunId', c.job_run_id,
    'diaryId', c.diary_id,
    'notificationType', c.notification_type,
    'safetyLevel', coalesce(s.level, 'none'),
    'recipientChatId', c.recipient_chat_id::text,
    'attempt', c.attempt,
    'day', d.day,
    'version', d.version,
    'title', case
      when c.notification_type = 'daily_diary' then d.title
      else null
    end,
    'blocks', case
      when c.notification_type = 'daily_diary' then coalesce(
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
      else '[]'::jsonb
    end
  )
  into payload
  from claimed c
  join public.diaries d on d.id = c.diary_id
  left join public.safety_assessments s on s.job_run_id = c.job_run_id;

  return payload;
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

comment on function public.enqueue_diary_notification(uuid, uuid) is
  'Routes none/concern to diary delivery and urgent to fixed safety guidance.';
comment on function public.claim_diary_notification(uuid) is
  'Claims a safely routed notification; urgent payloads never include diary text.';
