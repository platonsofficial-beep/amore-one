-- Employee identity color assignment RPC.
-- Prerequisite: employees_identity_schema.sql applied.
-- Run in the Supabase SQL editor after employees_identity_schema.sql.
--
-- Assigns or clears personal identity palette IDs through a focused SECURITY DEFINER path.
-- Authorization:
--   - Managers (owner, general_manager, manager) in the workspace
--   - Linked staff updating their own employee record only

create or replace function public.assign_employee_identity_color(
  p_workspace_id uuid,
  p_employee_id uuid,
  p_color_id text
)
returns table (
  employee_id uuid,
  workspace_id uuid,
  identity_color text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_is_authorized boolean := false;
  v_allowed_color_ids constant text[] := array[
    'champagne', 'rose-gold', 'amber', 'coral', 'terracotta', 'rust',
    'sage', 'moss', 'forest', 'emerald', 'teal', 'cyan', 'ocean',
    'slate-blue', 'indigo', 'violet', 'plum', 'magenta', 'ruby', 'crimson',
    'copper', 'bronze', 'sand', 'stone', 'pearl', 'silver', 'pewter',
    'graphite', 'midnight', 'obsidian', 'honey', 'apricot', 'berry', 'wine',
    'orchid', 'lavender', 'periwinkle', 'sapphire', 'glacier', 'jade', 'mint',
    'olive', 'fern', 'chestnut', 'cocoa', 'ash', 'ember', 'dusk'
  ];
begin
  if auth.uid() is null then
    raise exception 'employee_identity_forbidden';
  end if;

  if p_workspace_id is null or p_employee_id is null then
    raise exception 'employee_identity_employee_not_found';
  end if;

  select *
  into v_employee
  from public.employees e
  where e.id = p_employee_id
    and e.workspace_id = p_workspace_id;

  if not found then
    raise exception 'employee_identity_employee_not_found';
  end if;

  v_is_authorized := public.can_manage_workspace_stock(p_workspace_id)
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.auth_user_id = auth.uid()
        and wm.employee_id = p_employee_id
    );

  if not v_is_authorized then
    raise exception 'employee_identity_forbidden';
  end if;

  if p_color_id is not null then
    if btrim(p_color_id) = '' then
      raise exception 'employee_identity_invalid_color';
    end if;

    if p_color_id <> btrim(p_color_id) then
      raise exception 'employee_identity_invalid_color';
    end if;

    if p_color_id <> lower(p_color_id) then
      raise exception 'employee_identity_invalid_color';
    end if;

    if p_color_id = 'neutral' then
      raise exception 'employee_identity_invalid_color';
    end if;

    if not (p_color_id = any (v_allowed_color_ids)) then
      raise exception 'employee_identity_invalid_color';
    end if;
  end if;

  if v_employee.identity_color is not distinct from p_color_id then
    return query
    select v_employee.id, v_employee.workspace_id, v_employee.identity_color;
    return;
  end if;

  begin
    return query
    update public.employees e
    set identity_color = p_color_id
    where e.id = p_employee_id
      and e.workspace_id = p_workspace_id
    returning e.id, e.workspace_id, e.identity_color;
  exception
    when unique_violation then
      raise exception 'employee_identity_color_taken';
    when check_violation then
      raise exception 'employee_identity_invalid_color';
  end;
end;
$$;

revoke all on function public.assign_employee_identity_color(uuid, uuid, text) from public;
grant execute on function public.assign_employee_identity_color(uuid, uuid, text) to authenticated;
