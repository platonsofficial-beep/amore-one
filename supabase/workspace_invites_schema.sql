-- Staff invite tokens linking existing employee records to auth users.
-- Prerequisite: public.workspaces, public.employees, public.workspace_members.
-- Run workspace_invites_rls_policies.sql after this file.

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  email text not null default '',
  role text not null default 'staff',
  token text not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  constraint workspace_invites_token_unique unique (token),
  constraint workspace_invites_role_check check (
    role in ('owner', 'general_manager', 'manager', 'host', 'staff')
  )
);

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites (workspace_id);

create index if not exists workspace_invites_employee_idx
  on public.workspace_invites (employee_id);

create index if not exists workspace_invites_token_idx
  on public.workspace_invites (token);

-- One active (pending) invite per employee per workspace; history kept via accepted/revoked rows.
create unique index if not exists workspace_invites_one_active_per_employee_idx
  on public.workspace_invites (workspace_id, employee_id)
  where accepted_at is null and revoked_at is null;

create or replace function public.get_workspace_invite_preview(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.workspace_invites%rowtype;
  v_workspace_name text;
  v_employee_name text;
  v_is_expired boolean;
begin
  select *
  into v_invite
  from public.workspace_invites wi
  where wi.token = trim(p_token)
  limit 1;

  if v_invite.id is null then
    return json_build_object(
      'found', false,
      'workspace_name', null,
      'employee_name', null,
      'email', null,
      'is_expired', false,
      'is_revoked', false,
      'is_accepted', false
    );
  end if;

  select w.name
  into v_workspace_name
  from public.workspaces w
  where w.id = v_invite.workspace_id;

  select coalesce(e.full_name, '')
  into v_employee_name
  from public.employees e
  where e.id = v_invite.employee_id;

  v_is_expired := v_invite.expires_at < now();

  return json_build_object(
    'found', true,
    'workspace_name', v_workspace_name,
    'employee_name', nullif(trim(v_employee_name), ''),
    'email', nullif(trim(v_invite.email), ''),
    'is_expired', v_is_expired,
    'is_revoked', v_invite.revoked_at is not null,
    'is_accepted', v_invite.accepted_at is not null
  );
end;
$$;

revoke all on function public.get_workspace_invite_preview(text) from public;
grant execute on function public.get_workspace_invite_preview(text) to anon, authenticated;

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
      split_part(coalesce(u.email::text, ''), '@', 1),
      'Workspace member'
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

create or replace function public.accept_pending_workspace_invite_for_authenticated_user()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_invite public.workspace_invites%rowtype;
  v_member public.workspace_members%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required to accept an invite.';
  end if;

  select *
  into v_member
  from public.workspace_members wm
  where wm.auth_user_id = v_uid
  order by wm.created_at desc
  limit 1;

  if v_member.id is not null then
    return row_to_json(v_member);
  end if;

  select lower(trim(coalesce(u.email::text, '')))
  into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email = '' then
    return null;
  end if;

  select *
  into v_invite
  from public.workspace_invites wi
  where lower(trim(wi.email)) = v_email
    and wi.accepted_at is null
    and wi.revoked_at is null
    and wi.expires_at > now()
  order by wi.created_at desc
  limit 1;

  if v_invite.id is null then
    return null;
  end if;

  return public.accept_workspace_invite(v_invite.token);
end;
$$;

revoke all on function public.accept_pending_workspace_invite_for_authenticated_user() from public;
grant execute on function public.accept_pending_workspace_invite_for_authenticated_user() to authenticated;
