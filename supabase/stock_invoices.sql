-- Stock invoice files on supplier orders. NOT APPLIED.
-- Platon approves this file before anyone runs it. Do not apply it to the live project.
-- Requires public.can_manage_workspace_stock from stock_rls_policies.sql
-- and public.stock_orders from stock_orders_schema.sql.
--
-- One invoice row per order, with many pages (files) and many lines.
-- The bucket is private. Paths are {workspace_id}/{order_id}/{file}.
-- Only members who can manage stock for that venue can read or write.

create table if not exists public.stock_order_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.stock_orders(id) on delete cascade,
  supplier_name text not null default '',
  invoice_number text not null default '',
  invoice_date date,
  subtotal numeric,
  vat numeric,
  total numeric,
  scanned boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stock_order_invoices_order_unique
  on public.stock_order_invoices (order_id);

create index if not exists stock_order_invoices_workspace_idx
  on public.stock_order_invoices (workspace_id);

create table if not exists public.stock_order_invoice_files (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.stock_order_invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  content_type text not null default '',
  file_name text not null default '',
  page_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_order_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.stock_order_invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  quantity numeric,
  unit_price numeric,
  sort_order int not null default 0
);

alter table public.stock_order_invoices enable row level security;
alter table public.stock_order_invoice_files enable row level security;
alter table public.stock_order_invoice_lines enable row level security;

revoke all on public.stock_order_invoices from public, anon;
revoke all on public.stock_order_invoice_files from public, anon;
revoke all on public.stock_order_invoice_lines from public, anon;

grant select, insert, update, delete on public.stock_order_invoices to authenticated;
grant select, insert, update, delete on public.stock_order_invoice_files to authenticated;
grant select, insert, update, delete on public.stock_order_invoice_lines to authenticated;

drop policy if exists stock_order_invoices_stock_managers on public.stock_order_invoices;
create policy stock_order_invoices_stock_managers
  on public.stock_order_invoices
  for all
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_order_invoice_files_stock_managers on public.stock_order_invoice_files;
create policy stock_order_invoice_files_stock_managers
  on public.stock_order_invoice_files
  for all
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists stock_order_invoice_lines_stock_managers on public.stock_order_invoice_lines;
create policy stock_order_invoice_lines_stock_managers
  on public.stock_order_invoice_lines
  for all
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

insert into storage.buckets (id, name, public)
values ('stock-invoices', 'stock-invoices', false)
on conflict (id) do update set public = false;

drop policy if exists stock_invoices_storage_select on storage.objects;
create policy stock_invoices_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'stock-invoices'
    and public.can_manage_workspace_stock(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists stock_invoices_storage_insert on storage.objects;
create policy stock_invoices_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'stock-invoices'
    and public.can_manage_workspace_stock(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists stock_invoices_storage_update on storage.objects;
create policy stock_invoices_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'stock-invoices'
    and public.can_manage_workspace_stock(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'stock-invoices'
    and public.can_manage_workspace_stock(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists stock_invoices_storage_delete on storage.objects;
create policy stock_invoices_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'stock-invoices'
    and public.can_manage_workspace_stock(((storage.foldername(name))[1])::uuid)
  );
