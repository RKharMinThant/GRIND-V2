-- The user's most recent device time zone, for the MCP server (push_subscriptions has no policies,
-- so a user-scoped client cannot read it directly). Modelled on health_connection_status().
create or replace function public.my_time_zone()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select s.time_zone
    from public.push_subscriptions s
   where s.user_id = auth.uid()
   order by s.last_used_at desc nulls last, s.created_at desc
   limit 1
$$;

revoke all on function public.my_time_zone() from public;
grant execute on function public.my_time_zone() to authenticated;
