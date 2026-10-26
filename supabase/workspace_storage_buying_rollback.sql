-- Rollback workspace_storages.is_buying.
-- Drops the buying flag and its index only.
-- Does not drop storages, is_supply, balances, pars, or orders.
-- Storages that were marked buying lose that mark.

begin;

drop index if exists public.workspace_storages_workspace_buying_idx;

alter table public.workspace_storages
  drop column if exists is_buying;

commit;
