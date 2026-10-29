-- Multi-venue: create additional venues (workspaces) from inside ONE.
-- Approved by Platon 2026-10-29 (t325u). Idempotent.

-- 1) Workspace-scoped helpers (overloads; the no-arg versions stay for
--    inventory_items / bar_refill_items policies that still use them).
create or replace function public.has_any_workspace_membership(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = target_workspace_id and wm.auth_user_id = auth.uid());
$$;

create or replace function public.can_manage_workspace_profile(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = target_workspace_id and wm.auth_user_id = auth.uid()
                   and wm.role in ('owner', 'general_manager'));
$$;

revoke all on function public.has_any_workspace_membership(uuid) from public, anon;
revoke all on function public.can_manage_workspace_profile(uuid) from public, anon;
grant execute on function public.has_any_workspace_membership(uuid) to authenticated;
grant execute on function public.can_manage_workspace_profile(uuid) to authenticated;

-- 2) workspace_profiles: one row per workspace, RLS scoped by workspace_id.
create unique index if not exists workspace_profiles_workspace_id_unique
  on public.workspace_profiles (workspace_id) where workspace_id is not null;

drop policy if exists workspace_profiles_select_members on public.workspace_profiles;
create policy workspace_profiles_select_members on public.workspace_profiles
  for select to authenticated
  using (public.has_any_workspace_membership(workspace_id));

drop policy if exists workspace_profiles_insert_managers on public.workspace_profiles;
create policy workspace_profiles_insert_managers on public.workspace_profiles
  for insert to authenticated
  with check (public.can_manage_workspace_profile(workspace_id));

drop policy if exists workspace_profiles_update_managers on public.workspace_profiles;
create policy workspace_profiles_update_managers on public.workspace_profiles
  for update to authenticated
  using (public.can_manage_workspace_profile(workspace_id))
  with check (public.can_manage_workspace_profile(workspace_id));

drop policy if exists workspace_profiles_delete_managers on public.workspace_profiles;
create policy workspace_profiles_delete_managers on public.workspace_profiles
  for delete to authenticated
  using (public.can_manage_workspace_profile(workspace_id));

-- 3) workspaces: members can read their venues; no direct client writes.
drop policy if exists workspaces_select_members on public.workspaces;
create policy workspaces_select_members on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;

-- 4) RPC: create venue + owner membership + profile + default departments/storages.
create or replace function public.create_workspace_venue(
  p_name text,
  p_timezone text default 'Europe/Nicosia',
  p_currency text default 'EUR',
  p_city text default '',
  p_country_code text default 'CY',
  p_country_name text default 'Cyprus'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Nicosia');
  v_slug text;
  v_display text;
  v_email text;
  v_bar uuid;
  v_kitchen uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_venue_name' using errcode = '22023'; end if;
  if not exists (select 1 from workspace_members
                 where auth_user_id = v_uid and role in ('owner', 'general_manager')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'venue'; end if;
  v_slug := left(v_slug, 60) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into workspaces (name, slug) values (v_name, v_slug) returning id into v_ws;

  select display_name, email into v_display, v_email
    from workspace_members where auth_user_id = v_uid
    order by (role = 'owner') desc, created_at asc limit 1;

  -- workspace_members_apply_permission_preset trigger seeds owner permissions.
  insert into workspace_members (workspace_id, auth_user_id, display_name, email, role)
  values (v_ws, v_uid, coalesce(v_display, ''), coalesce(v_email, ''), 'owner');

  insert into workspace_profiles (workspace_key, workspace_id, business_name, timezone, currency,
                                  city, country_code, country_name)
  values (v_ws::text, v_ws, v_name, v_tz, coalesce(nullif(btrim(p_currency), ''), 'EUR'),
          coalesce(btrim(p_city), ''), coalesce(btrim(p_country_code), ''), coalesce(btrim(p_country_name), ''));

  insert into workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Bar', 0, true, v_uid, v_uid) returning id into v_bar;
  insert into workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Kitchen', 1, true, v_uid, v_uid) returning id into v_kitchen;

  insert into workspace_storages (workspace_id, location_key, name, sort_order, active,
                                  department_id, is_supply, is_buying, created_by, updated_by)
  select v_ws, s.k, s.k, s.o, true,
         case s.d when 'bar' then v_bar when 'kitchen' then v_kitchen end,
         s.k = 'Main Storage', false, v_uid, v_uid
  from (values ('Main Storage',0,'bar'), ('Bar',1,'bar'), ('Coffee Station',2,'bar'),
               ('Freezer',3,'kitchen'), ('Fridge',4,'kitchen'), ('Kitchen',5,'kitchen'),
               ('Wine Storage',6,'bar'), ('Water Storage',7,'bar'), ('Other',8,null)) s(k, o, d);

  return v_ws;
end;
$$;

revoke all on function public.create_workspace_venue(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_workspace_venue(text, text, text, text, text, text) to authenticated;
