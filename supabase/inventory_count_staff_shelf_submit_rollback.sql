-- Run with explicit owner approval
-- =============================================================================
-- Rollback staff shelf count submit (SQL NOT APPLIED)
-- =============================================================================
-- Drops submit_staff_shelf_count only.
-- Does not delete sessions already submitted, and does not change
-- post_inventory_count_finish. A manager can still post or cancel a
-- session that was created before this rollback.
-- =============================================================================

begin;

revoke all on function public.submit_staff_shelf_count(uuid, uuid, jsonb) from public;
revoke all on function public.submit_staff_shelf_count(uuid, uuid, jsonb) from anon;
revoke all on function public.submit_staff_shelf_count(uuid, uuid, jsonb) from authenticated;

drop function if exists public.submit_staff_shelf_count(uuid, uuid, jsonb);

commit;
