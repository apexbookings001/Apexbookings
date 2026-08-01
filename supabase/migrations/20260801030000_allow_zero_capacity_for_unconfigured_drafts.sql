-- A duplicated event is intentionally unconfigured until its administrator
-- assigns package allocations. Preserve that explicit state as capacity = 0
-- instead of coercing it to NULL.
alter table public.events
  drop constraint if exists events_capacity_check;

alter table public.events
  add constraint events_capacity_nonnegative
  check (capacity is null or capacity >= 0) not valid;

notify pgrst, 'reload schema';
