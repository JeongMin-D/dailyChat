-- Remove Supabase project default table privileges and grant only what the
-- server-side Bot/Worker needs through the Data API.

revoke all on table settings, messages, telegram_updates, job_runs
  from anon, authenticated, service_role;

grant usage on schema public to service_role;

grant select, insert, update, delete
  on table settings, messages, telegram_updates, job_runs
  to service_role;

revoke all on function local_day(timestamptz, text, integer) from public, anon, authenticated;
grant execute on function local_day(timestamptz, text, integer) to service_role;

revoke all on function claim_telegram_update(bigint) from public, anon, authenticated;
grant execute on function claim_telegram_update(bigint) to service_role;
