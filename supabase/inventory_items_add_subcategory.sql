-- Add subcategory support to inventory_items for Category → Subcategory → Item workflow.
-- Safe to rerun on existing databases.

alter table public.inventory_items
  add column if not exists subcategory text not null default '';

create index if not exists inventory_items_subcategory_idx
  on public.inventory_items (subcategory);
