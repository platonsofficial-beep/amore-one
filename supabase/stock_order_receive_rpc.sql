-- Requires stock orders + delivery receiving, location balances/backfill,
-- location mutation RPCs and stock_transfer_rpc.sql (ensure-balance helper).
-- Reapply the product-lock-hardened versions of BOTH mutation/transfer scripts first.
begin;

create table if not exists public.stock_order_receipts (
  request_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.stock_orders(id) on delete cascade,
  workspace_storage_id uuid not null references public.workspace_storages(id) on delete restrict,
  lines jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.stock_order_receipts enable row level security;
revoke all on public.stock_order_receipts from public, anon, authenticated;
grant select on public.stock_order_receipts to authenticated;
drop policy if exists stock_order_receipts_read on public.stock_order_receipts;
create policy stock_order_receipts_read on public.stock_order_receipts for select to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

create or replace function public.receive_stock_order(
  p_workspace_id uuid, p_order_id uuid, p_workspace_storage_id uuid,
  p_request_id uuid, p_lines jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order public.stock_orders%rowtype;
  v_receipt public.stock_order_receipts%rowtype;
  v_storage public.workspace_storages%rowtype;
  v_balance public.stock_item_location_balances%rowtype;
  v_line record;
  v_lines jsonb;
  v_result jsonb;
  v_complete boolean;
  v_replayed boolean := false;
begin
  if auth.uid() is null or not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'order_receive_forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or p_order_id is null or p_workspace_storage_id is null then
    raise exception 'order_receive_request_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'order_receive_lines_invalid';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 500 then
    raise exception 'order_receive_lines_invalid';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(id uuid, quantity numeric, expected_received numeric)
    where id is null or quantity is null or expected_received is null
      or quantity::text in ('NaN','Infinity','-Infinity')
      or expected_received::text in ('NaN','Infinity','-Infinity')
      or quantity <= 0 or expected_received < 0
      or quantity <> round(quantity,3) or expected_received <> round(expected_received,3))
    or (select count(distinct x.id) from jsonb_to_recordset(p_lines) as x(id uuid)) <> jsonb_array_length(p_lines) then
    raise exception 'order_receive_lines_invalid';
  end if;
  select jsonb_agg(jsonb_build_object('id', x.id, 'quantity', x.quantity,
    'expected_received', x.expected_received) order by x.id)
  into v_lines from jsonb_to_recordset(p_lines) as x(id uuid, quantity numeric, expected_received numeric);

  -- Serializes receipts for this order, including retries and completion.
  select * into v_order from public.stock_orders
  where id = p_order_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'order_receive_order_not_found'; end if;

  select * into v_receipt from public.stock_order_receipts where request_id = p_request_id;
  if found then
    if v_receipt.workspace_id <> p_workspace_id or v_receipt.order_id <> p_order_id
      or v_receipt.workspace_storage_id <> p_workspace_storage_id or v_receipt.lines <> v_lines then
      raise exception 'order_receive_request_conflict';
    end if;
    v_replayed := true;
  else
    if v_order.status <> 'sent' then raise exception 'order_receive_order_not_sent'; end if;

    perform 1 from public.stock_order_items where order_id = p_order_id order by id for update;
    if (select count(*) from public.stock_order_items oi
      join jsonb_to_recordset(v_lines) as x(id uuid) on x.id = oi.id
      where oi.order_id = p_order_id) <> jsonb_array_length(v_lines) then
      raise exception 'order_receive_line_not_found';
    end if;

    -- Lock every product in deterministic order BEFORE storage/balance locks.
    perform 1 from public.stock_items si
    where si.workspace_id = p_workspace_id and si.id in (
      select oi.stock_item_id from public.stock_order_items oi
      join jsonb_to_recordset(v_lines) as x(id uuid) on x.id = oi.id where oi.order_id = p_order_id
    ) order by si.id for update;

    select * into v_storage from public.workspace_storages
    where id = p_workspace_storage_id and workspace_id = p_workspace_id for update;
    if not found or not v_storage.active then raise exception 'order_receive_storage_unavailable'; end if;

    for v_line in
      select oi.*, x.quantity as receive_now, x.expected_received
      from public.stock_order_items oi
      join jsonb_to_recordset(v_lines) as x(id uuid, quantity numeric, expected_received numeric) on x.id = oi.id
      where oi.order_id = p_order_id order by oi.stock_item_id, oi.id
    loop
      if v_line.received_quantity is distinct from v_line.expected_received then
        raise exception 'order_receive_stale_quantity';
      end if;
      if v_line.receive_now > v_line.quantity - v_line.received_quantity then
        raise exception 'order_receive_exceeds_remaining';
      end if;
      if not exists (select 1 from public.stock_items si where si.id = v_line.stock_item_id
        and si.workspace_id = p_workspace_id and si.active) then
        raise exception 'order_receive_product_unavailable';
      end if;
      -- Do not silently replace legacy aggregate stock with an empty/partial backfill.
      if exists (select 1 from public.stock_items si where si.id = v_line.stock_item_id
        and si.current_quantity is distinct from (
          select coalesce(sum(b.quantity),0) from public.stock_item_location_balances b
          where b.workspace_id = p_workspace_id and b.stock_item_id = si.id)) then
        raise exception 'order_receive_balance_reconciliation_required';
      end if;
      v_balance := public.ensure_stock_item_location_balance(p_workspace_id,
        v_line.stock_item_id, p_workspace_storage_id, v_storage.location_key, auth.uid());
      perform public.mutate_stock_item_location_balance_core(p_workspace_id,
        v_line.stock_item_id, p_workspace_storage_id, 'receive', v_line.receive_now,
        v_balance.quantity_version, 'Supplier delivery', 'order_receive', p_order_id);
      update public.stock_order_items set received_quantity = received_quantity + v_line.receive_now
      where id = v_line.id and order_id = p_order_id;
    end loop;

    select not exists (select 1 from public.stock_order_items
      where order_id = p_order_id and received_quantity < quantity) into v_complete;
    update public.stock_orders set
      status = case when v_complete then 'received' else 'sent' end,
      received_at = case when v_complete then now() else received_at end,
      received_by = case when v_complete then auth.uid() else received_by end,
      partial_received_at = case when not v_complete then now() else partial_received_at end,
      partial_received_by = case when not v_complete then auth.uid() else partial_received_by end
    where id = p_order_id;
    insert into public.stock_order_receipts(request_id, workspace_id, order_id,
      workspace_storage_id, lines, created_by)
    values(p_request_id, p_workspace_id, p_order_id, p_workspace_storage_id, v_lines, auth.uid());
  end if;

  select to_jsonb(o) || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.id) from public.stock_order_items i where i.order_id = o.id
  ), '[]'::jsonb)) into v_result from public.stock_orders o where o.id = p_order_id;
  return jsonb_build_object('order', v_result, 'replayed', v_replayed, 'request_id', p_request_id);
end;
$$;
revoke all on function public.receive_stock_order(uuid,uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.receive_stock_order(uuid,uuid,uuid,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
