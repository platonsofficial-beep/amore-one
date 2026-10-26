-- Run with explicit owner approval
-- =============================================================================
-- Rollback staff take from supply (SQL NOT APPLIED)
-- =============================================================================
-- Drops take_from_supply_storage only. Does not drop
-- transfer_stock_between_locations, and does not delete movements,
-- balances, orders, or storages.
-- =============================================================================

begin;

revoke all on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from public, anon, authenticated;

drop function if exists public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
);

commit;
