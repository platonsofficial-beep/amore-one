-- Add active flag for supplier soft deactivation.
-- Run in the Supabase SQL editor after public.suppliers exists.

alter table public.suppliers
  add column if not exists active boolean not null default true;

create index if not exists suppliers_active_idx
  on public.suppliers (active);
