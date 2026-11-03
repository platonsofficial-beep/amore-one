-- =====================================================================
-- MANUAL EXECUTION ONLY
-- Do not run automatically. Run only after Platon approves this file.
-- Project: ONE (Supabase mndttehmvkgenylxvjzj)
--
-- Notifications for Operations events (bell + push via notify_enqueue):
--   1. New announcement  -> its audience
--   2. New task          -> assignee (existing); if unassigned: bar/service/kitchen
--                           staff, any other category -> everyone
--   3. Checklist started for today -> step assignees, else template department staff
-- Rules: never the creator (auth.uid()); skip disabled / deleted / no-login
-- members and inactive employees; dedupe_key prevents duplicates.
-- Creates/replaces functions and triggers only. No data is changed or deleted.
-- Idempotent: safe to run more than once. Rollback: notify_operations_events_rollback.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helper: active members (auth user ids) for an audience.
--   p_audience: 'all' | 'managers' | 'bar' | 'service' | 'kitchen'
--   p_include_managers: add owner / general_manager / manager to dept audiences
-- Department matching mirrors src/lib/operationsAnnouncementUtils.js
-- ---------------------------------------------------------------------
create or replace function public.notify_operations_recipients(
  p_workspace_id uuid,
  p_audience text,
  p_include_managers boolean default true
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct wm.auth_user_id
  from public.workspace_members wm
  left join public.employees e on e.id = wm.employee_id
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id is not null
    and wm.disabled_at is null
    and wm.account_deleted_at is null
    and coalesce(e.active, true)
    and (
      lower(coalesce(p_audience, 'all')) = 'all'
      or (wm.role in ('owner', 'general_manager', 'manager')
          and (lower(p_audience) = 'managers' or p_include_managers))
      or (lower(p_audience) = 'bar'
          and lower(coalesce(e.department, '')) like '%bar%')
      or (lower(p_audience) = 'service'
          and (lower(coalesce(e.department, '')) like '%service%'
               or lower(coalesce(e.department, '')) like '%waiter%'
               or lower(coalesce(e.department, '')) like '%host%'))
      or (lower(p_audience) = 'kitchen'
          and (lower(coalesce(e.department, '')) like '%kitchen%'
               or lower(coalesce(e.department, '')) like '%chef%'
               or lower(coalesce(e.department, '')) like '%cook%'))
    );
$$;

revoke all on function public.notify_operations_recipients(uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. New announcement (published now; scheduled-later is out of v1)
-- ---------------------------------------------------------------------
create or replace function public.notify_on_announcement_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare u uuid;
begin
  if new.workspace_id is null or new.active is false then return null; end if;
  if new.starts_at is not null and new.starts_at > now() then return null; end if;
  if new.ends_at is not null and new.ends_at <= now() then return null; end if;

  for u in select * from public.notify_operations_recipients(new.workspace_id, coalesce(new.audience, 'all'), true)
  loop
    if u is distinct from auth.uid() and u is distinct from new.created_by then
      perform public.notify_enqueue(new.workspace_id, u, 'announcement',
        case when new.priority = 'urgent' then 'Urgent announcement' else 'New announcement' end,
        coalesce(nullif(btrim(new.title), ''), 'Announcement'), '/',
        jsonb_build_object('view', 'announcement', 'announcement_id', new.id),
        'an:' || new.id || ':' || u);
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists operations_announcements_notify_created on public.operations_announcements;
create trigger operations_announcements_notify_created
  after insert on public.operations_announcements
  for each row execute function public.notify_on_announcement_created();

-- ---------------------------------------------------------------------
-- 2. Tasks: replaces notify_on_task_assigned (same trigger, same behaviour
--    for assigned tasks, now skipping disabled/deleted members), plus a
--    department fan-out for new unassigned bar/service/kitchen tasks
--    and an everyone fan-out for other unassigned categories.
-- ---------------------------------------------------------------------
create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid;
  v_body text;
  v_dept text;
begin
  if new.status = 'completed' or new.checklist_item_id is not null then return null; end if;

  v_body := new.title || case when new.due_time is not null then ' · due ' || to_char(new.due_time, 'HH24:MI') else '' end;

  if new.assigned_to is not null then
    if tg_op = 'UPDATE' and old.assigned_to is not distinct from new.assigned_to then return null; end if;
    for u in select wm.auth_user_id from public.workspace_members wm
             where wm.workspace_id = new.workspace_id and wm.employee_id = new.assigned_to
               and wm.auth_user_id is not null
               and wm.disabled_at is null and wm.account_deleted_at is null
    loop
      if u is distinct from auth.uid() then
        perform public.notify_enqueue(new.workspace_id, u, 'task_assigned', 'New task for you',
          v_body, '/', jsonb_build_object('view', 'tasks', 'task_id', new.id),
          'ta:' || new.id || ':' || u);
      end if;
    end loop;
    return null;
  end if;

  -- Unassigned: only on INSERT. Department categories (bar/service/kitchen)
  -- go to that department's staff; any other category goes to everyone.
  if tg_op <> 'INSERT' then return null; end if;
  v_dept := lower(coalesce(new.category, ''));

  for u in
    select * from public.notify_operations_recipients(new.workspace_id, v_dept, false)
    where v_dept in ('bar', 'service', 'kitchen')
    union
    select * from public.notify_operations_recipients(new.workspace_id, 'all', true)
    where v_dept not in ('bar', 'service', 'kitchen')
  loop
    if u is distinct from auth.uid() and u is distinct from new.created_by then
      perform public.notify_enqueue(new.workspace_id, u, 'task_new',
        case when v_dept in ('bar', 'service', 'kitchen') then 'New task for ' || initcap(v_dept) else 'New task' end,
        v_body, '/',
        jsonb_build_object('view', 'tasks', 'task_id', new.id),
        'tn:' || new.id || ':' || u);
    end if;
  end loop;
  return null;
end $$;

-- Trigger operations_tasks_notify_assigned already exists (INSERT/UPDATE); re-created for idempotency.
drop trigger if exists operations_tasks_notify_assigned on public.operations_tasks;
create trigger operations_tasks_notify_assigned
  after insert or update of assigned_to on public.operations_tasks
  for each row execute function public.notify_on_task_assigned();

-- ---------------------------------------------------------------------
-- 3. Checklist started for today.
--    The app inserts the run first and its steps in a second request, so
--    this fires once per steps INSERT statement (transition table), when
--    the step count and assignees are known. Runs that belong to a task
--    (operations_task_id) are skipped: the task notification covers them.
-- ---------------------------------------------------------------------
create or replace function public.notify_on_checklist_run_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u uuid;
  v_steps int;
  v_today date := (now() at time zone 'Europe/Nicosia')::date;
begin
  for r in
    select run.id, run.workspace_id, run.title, run.template_id, t.name as template_name, t.department, t.created_by
    from (select distinct run_id from new_steps) ns
    join public.operations_checklist_runs run on run.id = ns.run_id
    left join public.operations_checklist_templates t on t.id = run.template_id
    where run.operations_task_id is null
      and run.status = 'pending'
      and run.due_date = v_today
  loop
    select count(*) into v_steps from public.operations_checklist_run_steps where run_id = r.id;

    for u in
      select distinct wm.auth_user_id
      from public.operations_checklist_run_steps s
      join public.workspace_members wm on wm.workspace_id = r.workspace_id and wm.employee_id = s.assigned_to
      where s.run_id = r.id and wm.auth_user_id is not null
        and wm.disabled_at is null and wm.account_deleted_at is null
    union
      select x from public.notify_operations_recipients(r.workspace_id, lower(coalesce(r.department, 'service')), false) x
      where not exists (select 1 from public.operations_checklist_run_steps s2
                        where s2.run_id = r.id and s2.assigned_to is not null)
    loop
      if u is distinct from auth.uid() then
        perform public.notify_enqueue(r.workspace_id, u, 'checklist_started',
          'Checklist: ' || coalesce(nullif(btrim(r.template_name), ''), nullif(btrim(r.title), ''), 'Checklist'),
          'For today · ' || v_steps || case when v_steps = 1 then ' step' else ' steps' end, '/',
          jsonb_build_object('view', 'checklist', 'run_id', r.id, 'template_id', r.template_id),
          'cr:' || r.id || ':' || u);
      end if;
    end loop;
  end loop;
  return null;
end $$;

drop trigger if exists operations_checklist_run_steps_notify_started on public.operations_checklist_run_steps;
create trigger operations_checklist_run_steps_notify_started
  after insert on public.operations_checklist_run_steps
  referencing new table as new_steps
  for each statement execute function public.notify_on_checklist_run_started();

revoke all on function public.notify_on_announcement_created() from public, anon, authenticated;
revoke all on function public.notify_on_checklist_run_started() from public, anon, authenticated;

commit;
