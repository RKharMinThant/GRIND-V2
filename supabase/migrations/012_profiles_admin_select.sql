-- GRIND — Allow Admin to select all user profiles
-- Run in Supabase SQL Editor: Dashboard → SQL → New query

create policy "profiles_admin_select_all"
  on public.profiles for select
  using (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
  );
