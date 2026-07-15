-- GRIND — Add DEFAULT auth.uid() to invites.created_by
-- This means the DB fills created_by automatically if the client omits it.
-- Run in Supabase SQL Editor.

alter table public.invites
  alter column created_by set default auth.uid();
