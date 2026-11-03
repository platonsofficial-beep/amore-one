-- =====================================================================
-- MANUAL EXECUTION ONLY
-- Rollback for notify_operations_events.sql. Run only after Platon approves.
-- Removes the new triggers/functions and restores the previous
-- notify_on_task_assigned body (assigned tasks only). No data is changed:
-- notifications already sent stay in the notifications table.
-- Idempotent.
-- =====================================================================

begin;

drop trigger if exists operations_announcements_notify_created on public.operations_announcements;
drop trigger if exists operations_checklist_run_steps_notify_started on public.operations_checklist_run_steps;
drop function if exists public.notify_on_announcement_created();
drop function if exists public.notify_on_checklist_run_started();

-- Previous body, exactly as live before this change (read 2026-11-03).
create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare u uuid;
begin
  if new.assigned_to is null or new.status = 'completed' or new.checklist_item_id is not null then return null; end if;
  if tg_op = 'UPDATE' and old.assigned_to is not distinct from new.assigned_to then return null; end if;
  for u in select wm.auth_user_id from public.workspace_members wm
           where wm.workspace_id = new.workspace_id and wm.employee_id = new.assigned_to and wm.auth_user_id is not null
  loop
    if u is distinct from auth.uid() then
      perform public.notify_enqueue(new.workspace_id, u, 'task_assigned', 'New task for you',
        new.title || case when new.due_time is not null then ' · due ' || to_char(new.due_time, 'HH24:MI') else '' end, '/',
        jsonb_build_object('view','tasks','task_id', new.id),
        'ta:' || new.id || ':' || u);
    end if;
  end loop;
  return null;
end $function$;

drop trigger if exists operations_tasks_notify_assigned on public.operations_tasks;
create trigger operations_tasks_notify_assigned
  after insert or update of assigned_to on public.operations_tasks
  for each row execute function public.notify_on_task_assigned();

drop function if exists public.notify_operations_recipients(uuid, text, boolean);

commit;
