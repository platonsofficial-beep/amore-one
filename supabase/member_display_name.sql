-- Person display name. NOT applied.
--
-- create_signup_venue was storing the venue name in workspace_members.display_name.
-- When the owner had not typed a name, that venue name was the email local-part,
-- so Today greeted them as "Good morning, Platonsofficial."
--
-- accept_workspace_invite fell back to the email local-part, then "Workspace member".
--
-- After this file:
--   * The member's display_name is auth.users.raw_user_meta_data full_name, then name.
--   * If neither is set, display_name is '' (the app asks for a name). It is never
--     the venue name and never the email local-part.
--   * The venue row is unchanged. p_name is still the venue name.
--
-- Apply on the database when you are ready. This file does not run by itself.

create or replace function public.create_signup_venue(
  p_name text,
  p_plan text default 'start',
  p_timezone text default 'Europe/Nicosia',
  p_currency text default 'EUR'
) returns uuid
language plpgsql
security definer
set search_path = public
as $signup$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Nicosia');
  v_slug text;
  v_email text;
  v_person text;
  v_bar uuid;
  v_kitchen uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspace_members where auth_user_id = v_uid) then
    raise exception 'membership_exists' using errcode = '23505';
  end if;
  if p_plan not in ('start', 'pro') then
    raise exception 'trial_plan_not_allowed' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'invalid_venue_name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  select
    coalesce(u.email::text, ''),
    coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'name'), ''),
      ''
    )
  into v_email, v_person
  from auth.users u
  where u.id = v_uid;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' or v_slug = 'amore-nicosia' then
    v_slug := 'venue';
  end if;
  v_slug := left(v_slug, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.workspaces (name, slug) values (v_name, v_slug) returning id into v_ws;
  insert into public.workspace_members (workspace_id, auth_user_id, display_name, email, role)
  values (v_ws, v_uid, v_person, coalesce(v_email, ''), 'owner');
  insert into public.workspace_profiles (
    workspace_key, workspace_id, business_name, timezone, currency, city, country_code, country_name
  ) values (
    v_ws::text, v_ws, v_name, v_tz, coalesce(nullif(btrim(p_currency), ''), 'EUR'), '', 'CY', 'Cyprus'
  );
  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Bar', 0, true, v_uid, v_uid) returning id into v_bar;
  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Kitchen', 1, true, v_uid, v_uid) returning id into v_kitchen;
  insert into public.workspace_storages (
    workspace_id, location_key, name, sort_order, active, department_id, is_supply, is_buying, created_by, updated_by
  )
  select v_ws, s.k, s.k, s.o, true,
         case s.d when 'bar' then v_bar when 'kitchen' then v_kitchen end,
         s.k = 'Main Storage', false, v_uid, v_uid
  from (values
    ('Main Storage', 0, 'bar'),
    ('Bar', 1, 'bar'),
    ('Coffee Station', 2, 'bar'),
    ('Freezer', 3, 'kitchen'),
    ('Fridge', 4, 'kitchen'),
    ('Kitchen', 5, 'kitchen'),
    ('Wine Storage', 6, 'bar'),
    ('Water Storage', 7, 'bar'),
    ('Other', 8, null)
  ) s(k, o, d);

  perform public.start_venue_trial(v_ws, p_plan);
  return v_ws;
end;
$signup$;

revoke all on function public.create_signup_venue(text, text, text, text) from public, anon;
grant execute on function public.create_signup_venue(text, text, text, text) to authenticated;

create or replace function public.accept_workspace_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_invite public.workspace_invites%rowtype;
  v_member public.workspace_members%rowtype;
  v_email text;
  v_display_name text;
  v_role text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required to accept an invite.';
  end if;

  select *
  into v_invite
  from public.workspace_invites
  where token = trim(p_token)
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'Invite has been revoked.';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Invite has expired.';
  end if;

  if v_invite.accepted_at is not null then
    select *
    into v_member
    from public.workspace_members wm
    where wm.workspace_id = v_invite.workspace_id
      and wm.auth_user_id = v_uid
    limit 1;

    if v_member.id is not null then
      return row_to_json(v_member);
    end if;

    raise exception 'Invite has already been accepted.';
  end if;

  select
    coalesce(u.email::text, ''),
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      ''
    )
  into v_email, v_display_name
  from auth.users u
  where u.id = v_uid;

  v_role := case
    when v_invite.role in ('owner', 'general_manager', 'manager', 'host', 'staff') then v_invite.role
    else 'staff'
  end;

  select *
  into v_member
  from public.workspace_members wm
  where wm.workspace_id = v_invite.workspace_id
    and wm.auth_user_id = v_uid
  limit 1
  for update;

  if v_member.id is not null then
    update public.workspace_members
    set
      employee_id = v_invite.employee_id,
      email = coalesce(nullif(trim(v_email), ''), email),
      display_name = coalesce(nullif(trim(v_display_name), ''), display_name),
      role = case
        when role in ('owner', 'general_manager') then role
        else v_role
      end,
      last_seen_at = now()
    where id = v_member.id
    returning * into v_member;
  else
    insert into public.workspace_members (
      workspace_id,
      auth_user_id,
      employee_id,
      display_name,
      email,
      role,
      last_seen_at
    ) values (
      v_invite.workspace_id,
      v_uid,
      v_invite.employee_id,
      v_display_name,
      v_email,
      v_role,
      now()
    )
    returning * into v_member;
  end if;

  update public.workspace_invites
  set
    accepted_at = now(),
    accepted_by = v_uid
  where id = v_invite.id;

  return row_to_json(v_member);
end;
$$;

revoke all on function public.accept_workspace_invite(text) from public;
grant execute on function public.accept_workspace_invite(text) to authenticated;
