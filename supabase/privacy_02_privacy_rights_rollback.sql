-- Rollback for 02. Drops new functions/table/columns (column values written since apply are lost).
drop function if exists public.run_privacy_retention(boolean);
drop function if exists public.purge_workspace(uuid);
drop function if exists public.delete_my_account(text);
drop function if exists public.reopen_workspace_venue(uuid);
drop function if exists public.close_workspace_venue(uuid, text);
drop function if exists public.export_workspace_data(uuid);
drop function if exists public.export_my_data();
drop function if exists public.privacy_rows_json(text, text, uuid[]);
drop table if exists public.privacy_retention_settings;
alter table public.workspace_members drop column if exists account_deleted_at;
alter table public.workspaces drop column if exists closed_at, drop column if exists closed_by, drop column if exists purge_after;
-- original get_employee_private_fields:
CREATE OR REPLACE FUNCTION public.get_employee_private_fields(p_workspace_id uuid, p_employee_ids uuid[])
 RETURNS TABLE(id uuid, salary numeric, emergency_contact text, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'employee_details_forbidden' using errcode = '42501';
  end if;
  return query select e.id,
    case when public.can_manage_workspace_people_private(p_workspace_id) then e.salary else null::numeric end,
    case when public.can_manage_workspace_stock(p_workspace_id) then e.emergency_contact else null::text end,
    case when public.can_manage_workspace_stock(p_workspace_id) then e.notes else null::text end
  from public.employees e
  where e.workspace_id = p_workspace_id and e.id = any(p_employee_ids);
end;
$function$
;
