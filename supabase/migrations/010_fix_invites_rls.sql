-- GRIND — Fix invite RLS: replace auth.users subquery with auth.jwt()
-- Run this in Supabase SQL Editor to fix the "permission denied for table users" error.
--
-- Root cause: auth.users is not accessible to the authenticated/anon role.
-- Fix: read the email directly from the JWT token instead.

drop policy if exists "invites_admin_all" on public.invites;

create policy "invites_admin_all"
  on public.invites for all
  using (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
  )
  with check (
    auth.jwt() ->> 'email' = 'rkharmthant@gmail.com'
  );
