-- C06: keep immutable message timestamps and local days aligned with settings.

create or replace function enforce_message_local_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_day date;
begin
  select public.local_day(new.sent_at, settings.timezone, settings.day_boundary_hour)
    into expected_day
  from public.settings as settings
  where settings.id = 1;

  if expected_day is null then
    raise exception 'settings row 1 is required before saving messages'
      using errcode = '23514';
  end if;

  if new.day <> expected_day then
    raise exception 'message day does not match the configured local-day boundary'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function enforce_message_local_day()
  from public, anon, authenticated, service_role;

create trigger messages_enforce_local_day
before insert or update of sent_at, day on messages
for each row execute function enforce_message_local_day();

comment on function enforce_message_local_day() is
  'Rejects message rows whose day differs from local_day(sent_at, settings).';
