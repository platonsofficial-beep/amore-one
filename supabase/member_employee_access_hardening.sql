-- Apply after workspace/member/invite/employee schemas and their RLS policies,
-- stock_rls_policies.sql, and employees_identity_schema.sql.
-- Deploy with the matching client release. See docs/access_hardening_rollout.md.
begin;

create or replace function public.can_manage_workspace_people_private(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = p_workspace_id and auth_user_id = auth.uid()
      and role in ('owner', 'general_manager'));
$$;
revoke all on function public.can_manage_workspace_people_private(uuid) from public, anon;
grant execute on function public.can_manage_workspace_people_private(uuid) to authenticated;

-- INVOKER is intentional: direct API writes run as authenticated, whereas
-- validated SECURITY DEFINER invitation/identity RPCs run as their trusted owner.
create or replace function public.guard_workspace_member_update()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'membership_identity_immutable' using errcode = '42501';
  end if;
  if public.is_workspace_owner(old.workspace_id) then
    null; -- Existing owner RLS still controls which rows may be updated.
  elsif old.auth_user_id = auth.uid() then
    if (to_jsonb(new) - array['display_name', 'last_seen_at', 'employee_id'])
       is distinct from (to_jsonb(old) - array['display_name', 'last_seen_at', 'employee_id']) then
      raise exception 'membership_self_update_forbidden' using errcode = '42501';
    end if;
    if new.employee_id is distinct from old.employee_id
      and not public.can_manage_workspace_people_private(old.workspace_id) then
      raise exception 'membership_employee_link_forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'membership_update_forbidden' using errcode = '42501';
  end if;
  if new.employee_id is not null and not exists (
    select 1 from public.employees e where e.id = new.employee_id
      and e.workspace_id = new.workspace_id
  ) then
    raise exception 'membership_employee_workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_member_update() from public, anon, authenticated;
drop trigger if exists guard_workspace_member_update on public.workspace_members;
create trigger guard_workspace_member_update before update on public.workspace_members
  for each row execute function public.guard_workspace_member_update();

-- A staff member must not delete their membership then reclaim an empty
-- workspace through the first-owner bootstrap path.
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated using (public.is_workspace_owner(workspace_id));

-- Protect the alternate role-assignment path too: managers can invite staff
-- and hosts; Owner/GM can also invite managers. Ownership is not an invite role.
create or replace function public.guard_workspace_invite_write()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at')
      or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
      raise exception 'invite_update_forbidden' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.role not in ('staff', 'host', 'manager')
    or (new.role = 'manager' and not public.can_manage_workspace_people_private(new.workspace_id))
    or new.accepted_at is not null or new.accepted_by is not null
    or new.revoked_at is not null then
    raise exception 'invite_role_or_state_forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees e
    where e.id = new.employee_id and e.workspace_id = new.workspace_id) then
    raise exception 'invite_employee_workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_invite_write() from public, anon, authenticated;
drop trigger if exists guard_workspace_invite_write on public.workspace_invites;
create trigger guard_workspace_invite_write before insert or update on public.workspace_invites
  for each row execute function public.guard_workspace_invite_write();

-- RLS filters rows, not columns. Remove table-wide SELECT, including any
-- pre-existing column grants for private fields. Keep ordinary roster reads.
revoke select on public.employees from public, anon, authenticated;
revoke select (salary, emergency_contact, notes) on public.employees from public, anon, authenticated;
grant select (id, workspace_id, full_name, position, primary_position,
  additional_positions, phone, email, hire_date, weekly_hours, shift,
  status, department, identity_color, created_at, updated_at)
  on public.employees to authenticated;

create or replace function public.get_employee_private_fields(
  p_workspace_id uuid, p_employee_ids uuid[]
)
returns table (id uuid, salary numeric, emergency_contact text, notes text)
language plpgsql stable security definer set search_path = public
as $$
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
$$;
revoke all on function public.get_employee_private_fields(uuid, uuid[]) from public, anon;
grant execute on function public.get_employee_private_fields(uuid, uuid[]) to authenticated;

create or replace function public.guard_employee_write()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id then
      raise exception 'employee_identity_immutable' using errcode = '42501';
    end if;
    if not public.can_manage_workspace_stock(old.workspace_id) then
      -- RLS additionally requires this employee to be linked to the caller.
      if (to_jsonb(new) - array['phone', 'identity_color', 'updated_at'])
         is distinct from (to_jsonb(old) - array['phone', 'identity_color', 'updated_at']) then
        raise exception 'employee_self_update_forbidden' using errcode = '42501';
      end if;
    end if;
    if new.salary is distinct from old.salary
      and not public.can_manage_workspace_people_private(old.workspace_id) then
      raise exception 'employee_salary_write_forbidden' using errcode = '42501';
    end if;
  elsif new.salary is not null and not public.can_manage_workspace_people_private(new.workspace_id) then
    raise exception 'employee_salary_write_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_employee_write() from public, anon, authenticated;
drop trigger if exists guard_employee_write on public.employees;
create trigger guard_employee_write before insert or update on public.employees
  for each row execute function public.guard_employee_write();

notify pgrst, 'reload schema';
commit;
