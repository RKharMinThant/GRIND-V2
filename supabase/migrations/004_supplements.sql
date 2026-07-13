-- Daily protein (g) and creatine (g) on session logs
alter table public.logs
  add column if not exists protein_g numeric,
  add column if not exists creatine_g numeric;
