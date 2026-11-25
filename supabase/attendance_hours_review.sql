-- Hours review. NOT APPLIED. The owner runs this in the Supabase SQL editor.
-- Idempotent. Existing scheduled entries are approved once. Unscheduled stay pending.

alter table public.attendance_entries
  add column if not exists review_status text not null default 'pending',
  add column if not exists is_unscheduled boolean not null default false,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_entries_review_status_check'
      and conrelid = 'public.attendance_entries'::regclass
  ) then
    alter table public.attendance_entries
      add constraint attendance_entries_review_status_check
      check (review_status in ('pending', 'approved', 'declined'));
  end if;
end $$;

create table if not exists public.attendance_hours_review_backfill (
  id boolean primary key default true check (id),
  applied_at timestamptz not null default now()
);

alter table public.attendance_hours_review_backfill enable row level security;
revoke all on public.attendance_hours_review_backfill from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.attendance_hours_review_backfill) then
    update public.attendance_entries
    set
      is_unscheduled = (shift_id is null),
      review_status = case when shift_id is null then 'pending' else 'approved' end,
      reviewed_at = case when shift_id is null then null else coalesce(reviewed_at, now()) end
    where true;
    insert into public.attendance_hours_review_backfill (id) values (true);
  end if;
end $$;

-- Set once on insert. Later edits to shift_id do not flip the flag.
create or replace function public.attendance_entries_mark_unscheduled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_unscheduled := new.shift_id is null;
  return new;
end;
$$;

drop trigger if exists attendance_entries_mark_unscheduled on public.attendance_entries;
create trigger attendance_entries_mark_unscheduled
  before insert on public.attendance_entries
  for each row execute function public.attendance_entries_mark_unscheduled();

create or replace function public.can_review_attendance(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    left join public.workspace_member_permissions p
      on p.workspace_id = wm.workspace_id
     and p.member_id = wm.id
     and p.module = 'attendance'
    where wm.workspace_id = p_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role <> 'host'
      and (wm.role = 'owner' or coalesce(p.level, 0) >= 2)
  );
$$;

revoke all on function public.can_review_attendance(uuid) from public, anon;
grant execute on function public.can_review_attendance(uuid) to authenticated;

create or replace function public.attendance_review_entry(p_entry uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace uuid;
  v_member uuid;
  v_clock_out timestamptz;
  v_status text;
  v_actor uuid;
  v_actor_role text;
  v_note text;
  v_next text;
begin
  select e.id, e.workspace_id, e.member_id, e.clock_out_at, e.review_status
    into v_id, v_workspace, v_member, v_clock_out, v_status
  from public.attendance_entries e
  where e.id = p_entry
  for update;

  if v_id is null then
    raise exception 'entry_not_found';
  end if;
  if not public.can_review_attendance(v_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_clock_out is null then
    raise exception 'still_clocked_in';
  end if;
  if v_status is distinct from 'pending' then
    raise exception 'already_decided';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'note_required';
  end if;

  select wm.id, wm.role into v_actor, v_actor_role
  from public.workspace_members wm
  where wm.workspace_id = v_workspace and wm.auth_user_id = auth.uid()
  limit 1;

  if v_actor is not null and v_actor = v_member and coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'cannot_decide_own';
  end if;

  v_next := case when p_approve then 'approved' else 'declined' end;
  update public.attendance_entries
  set review_status = v_next,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = v_note
  where id = v_id;

  insert into public.attendance_audit (workspace_id, entry_id, changed_by, field, old_value, new_value, note)
  values (v_workspace, v_id, auth.uid(), 'review_status', v_status, v_next, v_note);
end;
$$;

revoke all on function public.attendance_review_entry(uuid, boolean, text) from public, anon;
grant execute on function public.attendance_review_entry(uuid, boolean, text) to authenticated;

create or replace function public.attendance_review_bulk_approve(
  p_workspace_id uuid,
  p_entry_ids uuid[],
  p_include_unscheduled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member uuid;
  v_clock_out timestamptz;
  v_status text;
  v_unscheduled boolean;
  v_actor uuid;
  v_actor_role text;
  v_approved int := 0;
  v_skipped int := 0;
begin
  if not public.can_review_attendance(p_workspace_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select wm.id, wm.role into v_actor, v_actor_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id and wm.auth_user_id = auth.uid()
  limit 1;

  if p_entry_ids is null then
    return jsonb_build_object('approved', 0, 'skipped', 0);
  end if;

  foreach v_id in array p_entry_ids loop
    select e.member_id, e.clock_out_at, e.review_status, e.is_unscheduled
      into v_member, v_clock_out, v_status, v_unscheduled
    from public.attendance_entries e
    where e.id = v_id and e.workspace_id = p_workspace_id
    for update;

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_clock_out is null or v_status is distinct from 'pending' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if coalesce(v_unscheduled, false) and not coalesce(p_include_unscheduled, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_actor is not null and v_actor = v_member and coalesce(v_actor_role, '') <> 'owner' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.attendance_entries
    set review_status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = v_id;

    insert into public.attendance_audit (workspace_id, entry_id, changed_by, field, old_value, new_value, note)
    values (p_workspace_id, v_id, auth.uid(), 'review_status', 'pending', 'approved', null);

    v_approved := v_approved + 1;
    v_member := null;
    v_clock_out := null;
    v_status := null;
    v_unscheduled := null;
  end loop;

  return jsonb_build_object('approved', v_approved, 'skipped', v_skipped);
end;
$$;

revoke all on function public.attendance_review_bulk_approve(uuid, uuid[], boolean) from public, anon;
grant execute on function public.attendance_review_bulk_approve(uuid, uuid[], boolean) to authenticated;

create or replace function public.attendance_review_reopen(p_entry uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace uuid;
  v_member uuid;
  v_status text;
  v_actor uuid;
  v_actor_role text;
  v_note text;
begin
  select e.id, e.workspace_id, e.member_id, e.review_status
    into v_id, v_workspace, v_member, v_status
  from public.attendance_entries e
  where e.id = p_entry
  for update;

  if v_id is null then
    raise exception 'entry_not_found';
  end if;
  if not public.can_review_attendance(v_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_status is null or v_status = 'pending' then
    raise exception 'not_decided';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'note_required';
  end if;

  select wm.id, wm.role into v_actor, v_actor_role
  from public.workspace_members wm
  where wm.workspace_id = v_workspace and wm.auth_user_id = auth.uid()
  limit 1;

  if v_actor is not null and v_actor = v_member and coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'cannot_decide_own';
  end if;

  update public.attendance_entries
  set review_status = 'pending',
      reviewed_by = null,
      reviewed_at = null,
      review_note = null
  where id = v_id;

  insert into public.attendance_audit (workspace_id, entry_id, changed_by, field, old_value, new_value, note)
  values (v_workspace, v_id, auth.uid(), 'review_status', v_status, 'pending', v_note);
end;
$$;

revoke all on function public.attendance_review_reopen(uuid, text) from public, anon;
grant execute on function public.attendance_review_reopen(uuid, text) to authenticated;

create or replace function public.attendance_notify_unscheduled_clock_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace uuid;
  v_member uuid;
  v_unscheduled boolean;
  v_in timestamptz;
  v_out timestamptz;
  v_name text;
  v_actor uuid;
  v_tz text;
  v_in_label text;
  v_out_label text;
  v_user uuid;
begin
  v_id := new.id;
  v_workspace := new.workspace_id;
  v_member := new.member_id;
  v_unscheduled := coalesce(new.is_unscheduled, new.shift_id is null);
  v_in := new.clock_in_at;
  v_out := new.clock_out_at;

  if tg_op <> 'UPDATE' then
    return null;
  end if;
  if old.clock_out_at is not null or v_out is null or not v_unscheduled then
    return null;
  end if;

  select coalesce(nullif(wm.display_name, ''), 'A team member'), wm.auth_user_id
    into v_name, v_actor
  from public.workspace_members wm
  where wm.id = v_member;

  select coalesce(
    (select s.timezone from public.workspace_attendance_settings s where s.workspace_id = v_workspace),
    (select wp.timezone from public.workspace_profiles wp where wp.workspace_id = v_workspace limit 1),
    'Europe/Nicosia'
  ) into v_tz;

  v_in_label := to_char(v_in at time zone v_tz, 'HH24:MI');
  v_out_label := to_char(v_out at time zone v_tz, 'HH24:MI');

  for v_user in
    select mgr from public.notify_attendance_manager_users(v_workspace) as mgr
  loop
    if v_user is distinct from v_actor then
      perform public.notify_enqueue(
        v_workspace,
        v_user,
        'hours_review_unscheduled',
        'Hours to review',
        coalesce(v_name, 'A team member') || ' worked ' || v_in_label || '–' || v_out_label
          || ' without a scheduled shift. Tap to accept or decline.',
        '/',
        jsonb_build_object('view', 'attendance', 'tab', 'hours', 'entry_id', v_id),
        'hours-unscheduled:' || v_id::text || ':' || v_user::text
      );
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists attendance_notify_unscheduled_clock_out on public.attendance_entries;
create trigger attendance_notify_unscheduled_clock_out
  after update of clock_out_at on public.attendance_entries
  for each row execute function public.attendance_notify_unscheduled_clock_out();

create or replace function public.attendance_review_digest_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_open int;
  v_last timestamptz;
  v_pending int;
  v_unsched int;
  v_day date;
  v_label text;
  v_user uuid;
begin
  for v_ws in select w.id from public.workspaces w loop
    select count(*)::int into v_open
    from public.attendance_entries e
    where e.workspace_id = v_ws and e.clock_out_at is null;
    if coalesce(v_open, 0) > 0 then
      continue;
    end if;

    select max(e.clock_out_at) into v_last
    from public.attendance_entries e
    where e.workspace_id = v_ws
      and e.clock_out_at is not null
      and e.clock_out_at >= now() - interval '4 days';
    if v_last is null or v_last > now() - interval '20 minutes' then
      continue;
    end if;

    select count(*)::int,
           count(*) filter (where e.is_unscheduled)::int,
           max(e.work_date)
      into v_pending, v_unsched, v_day
    from public.attendance_entries e
    where e.workspace_id = v_ws
      and e.review_status = 'pending'
      and e.clock_out_at is not null
      and e.work_date >= (current_date - 4);
    if coalesce(v_pending, 0) = 0 or v_day is null then
      continue;
    end if;

    v_label := to_char(v_day, 'DD Mon');
    for v_user in
      select mgr from public.notify_attendance_manager_users(v_ws) as mgr
    loop
      perform public.notify_enqueue(
        v_ws,
        v_user,
        'hours_review_digest',
        'Hours to review',
        v_pending::text || ' entries for ' || v_label || ' (' || coalesce(v_unsched, 0)::text || ' unscheduled)',
        '/',
        jsonb_build_object('view', 'attendance', 'tab', 'hours'),
        'hours-digest:' || v_ws::text || ':' || v_user::text || ':' || to_char(current_date, 'YYYY-MM-DD')
      );
    end loop;
  end loop;
end;
$$;

revoke all on function public.attendance_review_digest_tick() from public, anon, authenticated;
revoke all on function public.attendance_notify_unscheduled_clock_out() from public, anon, authenticated;

do $cron$
declare
  v_job bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into v_job from cron.job where jobname = 'attendance_hours_review_digest' limit 1;
    if v_job is not null then
      perform cron.unschedule(v_job);
    end if;
    perform cron.schedule(
      'attendance_hours_review_digest',
      '*/10 * * * *',
      'select public.attendance_review_digest_tick()'
    );
  end if;
end
$cron$;
