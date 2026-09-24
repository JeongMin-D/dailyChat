-- Supabase may explicitly grant function execution to API roles. Restrict both
-- RPC functions to the server-only service role and fix the immutable lookup path.

alter function local_day(timestamptz, text, integer)
  set search_path = '';

revoke all on function local_day(timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function local_day(timestamptz, text, integer)
  to service_role;

revoke all on function claim_telegram_update(bigint)
  from public, anon, authenticated;
grant execute on function claim_telegram_update(bigint)
  to service_role;
