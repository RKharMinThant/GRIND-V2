-- Multi-select muscle / focus areas (comma-separated list)
alter table public.logs
  add column if not exists focus_areas text;
