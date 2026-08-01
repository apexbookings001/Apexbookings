-- Draft duplicates deliberately begin with zero operational pricing. A zero
-- price is allowed only while the event remains a draft; application and
-- publish validation require a positive price before customers can book.
alter table public.packages
  drop constraint if exists packages_original_price_positive;

alter table public.packages
  add constraint packages_original_price_nonnegative
  check (original_price >= 0) not valid;

notify pgrst, 'reload schema';
