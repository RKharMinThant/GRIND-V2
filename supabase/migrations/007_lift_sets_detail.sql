-- Per-set reps/weight on the Progress lift board
alter table public.tracked_lifts
  add column if not exists sets_detail jsonb not null default '[]'::jsonb;

alter table public.tracked_lifts
  add column if not exists prev_sets_detail jsonb;

-- Backfill from legacy sets × reps @ weight when sets_detail is empty.
-- Aggregates must live in a CTE/FROM subquery — not directly in UPDATE SET.
with expanded as (
  select
    tl.id,
    jsonb_agg(
      jsonb_build_object('reps', tl.reps, 'weight', tl.weight)
      order by g
    ) as detail
  from public.tracked_lifts tl
  cross join lateral generate_series(1, greatest(tl.sets, 1)) as g
  where coalesce(jsonb_array_length(tl.sets_detail), 0) = 0
  group by tl.id, tl.reps, tl.weight
)
update public.tracked_lifts t
set sets_detail = e.detail
from expanded e
where t.id = e.id;

-- Previous snapshot from legacy prev_* columns when present
with expanded_prev as (
  select
    tl.id,
    jsonb_agg(
      jsonb_build_object('reps', tl.prev_reps, 'weight', tl.prev_weight)
      order by g
    ) as detail
  from public.tracked_lifts tl
  cross join lateral generate_series(1, greatest(coalesce(tl.prev_sets, 1), 1)) as g
  where tl.prev_sets is not null
    and tl.prev_reps is not null
    and tl.prev_weight is not null
    and tl.prev_sets_detail is null
  group by tl.id, tl.prev_reps, tl.prev_weight
)
update public.tracked_lifts t
set prev_sets_detail = e.detail
from expanded_prev e
where t.id = e.id;
