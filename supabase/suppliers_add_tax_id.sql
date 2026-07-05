-- Add VAT / Tax ID (AFM) to supplier records.
-- Run in the Supabase SQL editor after public.suppliers exists.

alter table public.suppliers
add column if not exists tax_id text not null default '';
