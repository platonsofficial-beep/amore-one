-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase B (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Parents get a nullable workspace_id. Children do not.
--   shift_templates, tasks, task_templates
--     nullable uuid FK to public.workspaces(id) ON DELETE CASCADE.
--     NOT NULL is not set. A second workspace, or zero workspaces, leaves
--     the column null and this script reports that with a notice.
--   schedule_capacity follows shift_template_id.
--   task_checklist_items follows task_id.
--   task_template_checklist_items follows template_id.
-- A workspace_id on those children can drift from the parent. EXISTS policies
-- stay correct when the parent moves or is backfilled, and the app does not
-- have to stamp the column onto every checklist or capacity row.
--
-- Backfill: when public.workspaces has exactly one row, every null
-- workspace_id on the three parents is set to that id. Otherwise the column
-- stays null and a notice tells the owner to assign rows. Members cannot see
-- a null workspace_id (is_workspace_member(null) is false).
--
-- Who can do what after this file, matching the app today:
--   Members select rows in their workspace.
--   Managers (can_manage_workspace_stock: owner, general_manager, manager)
--     insert, update, and delete shift templates, schedule capacity, tasks,
--     task templates, and both checklist tables.
--   Staff can still complete a task and tick its checklist when the task is
--     unassigned or assigned to their workspace_members.employee_id.
--     A trigger blocks every other column, including title and assignee.
--     Staff cannot create, delete, or edit templates.
--
-- Legacy inventory_items, bar_refills, bar_refill_items have no workspace_id.
--   All "Allow public …" and *_dev_* allow-all policies are dropped.
--   Select: authenticated users with has_any_workspace_membership().
--   Writes: can_manage_any_workspace_schedule() (owner, general_manager,
--   manager of any workspace). That helper already exists for schedule
--   publications. completeBarRefill still writes these three tables, and the
--   legacy inventory screen is manager-only, so managers keep that path.
--   There is no separate anon client. Staff do not open that screen.
--
-- Does NOT:
--   - Set workspace_id NOT NULL
--   - Add workspace_id to the three child tables or the legacy tables
--   - Change shifts, reservations, or schedule_publications (phase A)
--   - Replace is_workspace_member, can_manage_workspace_stock,
--     has_any_workspace_membership, or can_manage_any_workspace_schedule
--
-- Verify: supabase/close_public_policies_phase_b_verify.sql
-- Rollback: supabase/close_public_policies_phase_b_rollback.sql
-- =============================================================================

begin;

do $close_public_policies_phase_b_preflight$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'phase b: public.workspaces is missing';
  end if;

  if to_regprocedure('public.is_workspace_member(uuid)') is null
     or to_regprocedure('public.can_manage_workspace_stock(uuid)') is null
     or to_regprocedure('public.has_any_workspace_membership()') is null
     or to_regprocedure('public.can_manage_any_workspace_schedule()') is null then
    raise exception
      'phase b: is_workspace_member, can_manage_workspace_stock, has_any_workspace_membership, or can_manage_any_workspace_schedule is missing';
  end if;
end
$close_public_policies_phase_b_preflight$;

alter table public.shift_templates
  add column if not exists workspace_id uuid;

alter table public.tasks
  add column if not exists workspace_id uuid;

alter table public.task_templates
  add column if not exists workspace_id uuid;

do $close_public_policies_phase_b_fk$
declare
  v_table text;
  v_constraint text;
  v_delete_type "char";
begin
  foreach v_table in array array['shift_templates', 'tasks', 'task_templates']
  loop
    v_constraint := v_table || '_workspace_id_fkey';
    select c.confdeltype
      into v_delete_type
    from pg_constraint c
    where c.conrelid = ('public.' || v_table)::regclass
      and c.conname = v_constraint;

    if v_delete_type is null then
      execute format(
        'alter table public.%I add constraint %I foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        v_table,
        v_constraint
      );
      raise notice 'phase b: added %', v_constraint;
    elsif v_delete_type is distinct from 'c' then
      raise exception 'phase b: % exists and is not ON DELETE CASCADE', v_constraint;
    else
      raise notice 'phase b: % already ON DELETE CASCADE', v_constraint;
    end if;
  end loop;
end
$close_public_policies_phase_b_fk$;

create index if not exists shift_templates_workspace_id_idx
  on public.shift_templates (workspace_id);

create index if not exists tasks_workspace_id_idx
  on public.tasks (workspace_id);

create index if not exists task_templates_workspace_id_idx
  on public.task_templates (workspace_id);

do $close_public_policies_phase_b_backfill$
declare
  v_count integer;
  v_workspace uuid;
begin
  select count(*)::integer into v_count from public.workspaces;

  if v_count = 1 then
    select id into v_workspace from public.workspaces limit 1;
    update public.shift_templates
      set workspace_id = v_workspace
      where workspace_id is null;
    update public.tasks
      set workspace_id = v_workspace
      where workspace_id is null;
    update public.task_templates
      set workspace_id = v_workspace
      where workspace_id is null;
    raise notice
      'phase b backfill: workspace count is 1. Assigned % to null workspace_id rows on shift_templates, tasks, and task_templates.',
      v_workspace;
  else
    raise notice
      'phase b backfill: workspace count is %. Leaving workspace_id null. Assign those rows before members can see them.',
      v_count;
  end if;
end
$close_public_policies_phase_b_backfill$;

create or replace function public.can_complete_workspace_task(
  p_workspace_id uuid,
  p_assigned_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_member(p_workspace_id)
    and (
      p_assigned_employee_id is null
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.auth_user_id = auth.uid()
          and wm.employee_id is not null
          and wm.employee_id = p_assigned_employee_id
      )
    );
$$;

revoke all on function public.can_complete_workspace_task(uuid, uuid) from public;
revoke all on function public.can_complete_workspace_task(uuid, uuid) from anon;
grant execute on function public.can_complete_workspace_task(uuid, uuid) to authenticated;

create or replace function public.tasks_guard_staff_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.can_manage_workspace_stock(coalesce(new.workspace_id, old.workspace_id)) then
    if old.workspace_id is not null
       and new.workspace_id is distinct from old.workspace_id then
      raise exception 'tasks_workspace_move_forbidden' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.title is distinct from old.title
     or new.department is distinct from old.department
     or new.department_custom is distinct from old.department_custom
     or new.assigned_employee_id is distinct from old.assigned_employee_id
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.due_time is distinct from old.due_time
     or new.recurrence is distinct from old.recurrence
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
  then
    raise exception 'tasks_staff_update_forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_guard_staff_update on public.tasks;
create trigger tasks_guard_staff_update
  before update on public.tasks
  for each row
  execute function public.tasks_guard_staff_update();

create or replace function public.task_checklist_items_guard_staff_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select t.workspace_id
    into v_workspace_id
  from public.tasks t
  where t.id = old.task_id;

  if public.can_manage_workspace_stock(v_workspace_id) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.task_id is distinct from old.task_id
     or new.title is distinct from old.title
     or new.sort_order is distinct from old.sort_order
     or new.created_at is distinct from old.created_at
  then
    raise exception 'task_checklist_staff_update_forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists task_checklist_items_guard_staff_update on public.task_checklist_items;
create trigger task_checklist_items_guard_staff_update
  before update on public.task_checklist_items
  for each row
  execute function public.task_checklist_items_guard_staff_update();

revoke all on function public.tasks_guard_staff_update() from public, anon;
revoke all on function public.task_checklist_items_guard_staff_update() from public, anon;
grant execute on function public.tasks_guard_staff_update() to authenticated;
grant execute on function public.task_checklist_items_guard_staff_update() to authenticated;

do $close_public_policies_phase_b_drop$
declare
  v_row record;
begin
  for v_row in
    select *
    from (values
      ('shift_templates', 'Allow public delete shift_templates'),
      ('shift_templates', 'Allow public insert shift_templates'),
      ('shift_templates', 'Allow public read shift_templates'),
      ('shift_templates', 'Allow public update shift_templates'),
      ('schedule_capacity', 'Allow public delete schedule_capacity'),
      ('schedule_capacity', 'Allow public insert schedule_capacity'),
      ('schedule_capacity', 'Allow public read schedule_capacity'),
      ('schedule_capacity', 'Allow public update schedule_capacity'),
      ('tasks', 'Allow all tasks access'),
      ('task_templates', 'task_templates_dev_delete_all'),
      ('task_templates', 'task_templates_dev_insert_all'),
      ('task_templates', 'task_templates_dev_select_all'),
      ('task_templates', 'task_templates_dev_update_all'),
      ('task_template_checklist_items', 'task_template_checklist_items_dev_delete_all'),
      ('task_template_checklist_items', 'task_template_checklist_items_dev_insert_all'),
      ('task_template_checklist_items', 'task_template_checklist_items_dev_select_all'),
      ('task_template_checklist_items', 'task_template_checklist_items_dev_update_all'),
      ('task_checklist_items', 'task_checklist_items_dev_delete_all'),
      ('task_checklist_items', 'task_checklist_items_dev_insert_all'),
      ('task_checklist_items', 'task_checklist_items_dev_select_all'),
      ('task_checklist_items', 'task_checklist_items_dev_update_all'),
      ('inventory_items', 'Allow public delete inventory_items'),
      ('inventory_items', 'Allow public insert inventory_items'),
      ('inventory_items', 'Allow public read inventory_items'),
      ('inventory_items', 'Allow public update inventory_items'),
      ('inventory_items', 'inventory_items_dev_delete_all'),
      ('inventory_items', 'inventory_items_dev_insert_all'),
      ('inventory_items', 'inventory_items_dev_select_all'),
      ('inventory_items', 'inventory_items_dev_update_all'),
      ('bar_refills', 'bar_refills_dev_delete_all'),
      ('bar_refills', 'bar_refills_dev_insert_all'),
      ('bar_refills', 'bar_refills_dev_select_all'),
      ('bar_refills', 'bar_refills_dev_update_all'),
      ('bar_refill_items', 'bar_refill_items_dev_delete_all'),
      ('bar_refill_items', 'bar_refill_items_dev_insert_all'),
      ('bar_refill_items', 'bar_refill_items_dev_select_all'),
      ('bar_refill_items', 'bar_refill_items_dev_update_all'),
      ('shift_templates', 'shift_templates_select_members'),
      ('shift_templates', 'shift_templates_insert_managers'),
      ('shift_templates', 'shift_templates_update_managers'),
      ('shift_templates', 'shift_templates_delete_managers'),
      ('schedule_capacity', 'schedule_capacity_select_members'),
      ('schedule_capacity', 'schedule_capacity_insert_managers'),
      ('schedule_capacity', 'schedule_capacity_update_managers'),
      ('schedule_capacity', 'schedule_capacity_delete_managers'),
      ('tasks', 'tasks_select_members'),
      ('tasks', 'tasks_insert_managers'),
      ('tasks', 'tasks_update_workspace'),
      ('tasks', 'tasks_delete_managers'),
      ('task_templates', 'task_templates_select_members'),
      ('task_templates', 'task_templates_insert_managers'),
      ('task_templates', 'task_templates_update_managers'),
      ('task_templates', 'task_templates_delete_managers'),
      ('task_template_checklist_items', 'task_template_checklist_items_select_members'),
      ('task_template_checklist_items', 'task_template_checklist_items_insert_managers'),
      ('task_template_checklist_items', 'task_template_checklist_items_update_managers'),
      ('task_template_checklist_items', 'task_template_checklist_items_delete_managers'),
      ('task_checklist_items', 'task_checklist_items_select_members'),
      ('task_checklist_items', 'task_checklist_items_insert_managers'),
      ('task_checklist_items', 'task_checklist_items_update_workspace'),
      ('task_checklist_items', 'task_checklist_items_delete_managers'),
      ('inventory_items', 'inventory_items_select_members'),
      ('inventory_items', 'inventory_items_insert_managers'),
      ('inventory_items', 'inventory_items_update_managers'),
      ('inventory_items', 'inventory_items_delete_managers'),
      ('bar_refills', 'bar_refills_select_members'),
      ('bar_refills', 'bar_refills_insert_managers'),
      ('bar_refills', 'bar_refills_update_managers'),
      ('bar_refills', 'bar_refills_delete_managers'),
      ('bar_refill_items', 'bar_refill_items_select_members'),
      ('bar_refill_items', 'bar_refill_items_insert_managers'),
      ('bar_refill_items', 'bar_refill_items_update_managers'),
      ('bar_refill_items', 'bar_refill_items_delete_managers')
    ) as listed(table_name, policy_name)
  loop
    if to_regclass('public.' || v_row.table_name) is null then
      raise exception 'phase b: public.% is missing', v_row.table_name;
    end if;

    if exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_row.table_name)::regclass
        and pol.polname = v_row.policy_name
    ) then
      execute format('drop policy %I on public.%I', v_row.policy_name, v_row.table_name);
      raise notice 'phase b: dropped policy "%" on %', v_row.policy_name, v_row.table_name;
    end if;
  end loop;
end
$close_public_policies_phase_b_drop$;

grant select, insert, update, delete on table public.shift_templates to authenticated;
grant select, insert, update, delete on table public.schedule_capacity to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.task_templates to authenticated;
grant select, insert, update, delete on table public.task_template_checklist_items to authenticated;
grant select, insert, update, delete on table public.task_checklist_items to authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;
grant select, insert, update, delete on table public.bar_refills to authenticated;
grant select, insert, update, delete on table public.bar_refill_items to authenticated;

revoke all on table public.shift_templates from anon, public;
revoke all on table public.schedule_capacity from anon, public;
revoke all on table public.tasks from anon, public;
revoke all on table public.task_templates from anon, public;
revoke all on table public.task_template_checklist_items from anon, public;
revoke all on table public.task_checklist_items from anon, public;
revoke all on table public.inventory_items from anon, public;
revoke all on table public.bar_refills from anon, public;
revoke all on table public.bar_refill_items from anon, public;

alter table public.shift_templates enable row level security;
alter table public.schedule_capacity enable row level security;
alter table public.tasks enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_template_checklist_items enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.inventory_items enable row level security;
alter table public.bar_refills enable row level security;
alter table public.bar_refill_items enable row level security;

create policy shift_templates_select_members
  on public.shift_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy shift_templates_insert_managers
  on public.shift_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy shift_templates_update_managers
  on public.shift_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

create policy shift_templates_delete_managers
  on public.shift_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

create policy schedule_capacity_select_members
  on public.schedule_capacity
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shift_templates st
      where st.id = schedule_capacity.shift_template_id
        and public.is_workspace_member(st.workspace_id)
    )
  );

create policy schedule_capacity_insert_managers
  on public.schedule_capacity
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.shift_templates st
      where st.id = schedule_capacity.shift_template_id
        and public.can_manage_workspace_stock(st.workspace_id)
    )
  );

create policy schedule_capacity_update_managers
  on public.schedule_capacity
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.shift_templates st
      where st.id = schedule_capacity.shift_template_id
        and public.can_manage_workspace_stock(st.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.shift_templates st
      where st.id = schedule_capacity.shift_template_id
        and public.can_manage_workspace_stock(st.workspace_id)
    )
  );

create policy schedule_capacity_delete_managers
  on public.schedule_capacity
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.shift_templates st
      where st.id = schedule_capacity.shift_template_id
        and public.can_manage_workspace_stock(st.workspace_id)
    )
  );

create policy tasks_select_members
  on public.tasks
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy tasks_insert_managers
  on public.tasks
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy tasks_update_workspace
  on public.tasks
  for update
  to authenticated
  using (
    public.can_manage_workspace_stock(workspace_id)
    or public.can_complete_workspace_task(workspace_id, assigned_employee_id)
  )
  with check (
    public.can_manage_workspace_stock(workspace_id)
    or public.can_complete_workspace_task(workspace_id, assigned_employee_id)
  );

create policy tasks_delete_managers
  on public.tasks
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

create policy task_templates_select_members
  on public.task_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy task_templates_insert_managers
  on public.task_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy task_templates_update_managers
  on public.task_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

create policy task_templates_delete_managers
  on public.task_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

create policy task_template_checklist_items_select_members
  on public.task_template_checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.task_templates template_row
      where template_row.id = task_template_checklist_items.template_id
        and public.is_workspace_member(template_row.workspace_id)
    )
  );

create policy task_template_checklist_items_insert_managers
  on public.task_template_checklist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.task_templates template_row
      where template_row.id = task_template_checklist_items.template_id
        and public.can_manage_workspace_stock(template_row.workspace_id)
    )
  );

create policy task_template_checklist_items_update_managers
  on public.task_template_checklist_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.task_templates template_row
      where template_row.id = task_template_checklist_items.template_id
        and public.can_manage_workspace_stock(template_row.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.task_templates template_row
      where template_row.id = task_template_checklist_items.template_id
        and public.can_manage_workspace_stock(template_row.workspace_id)
    )
  );

create policy task_template_checklist_items_delete_managers
  on public.task_template_checklist_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.task_templates template_row
      where template_row.id = task_template_checklist_items.template_id
        and public.can_manage_workspace_stock(template_row.workspace_id)
    )
  );

create policy task_checklist_items_select_members
  on public.task_checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks task_row
      where task_row.id = task_checklist_items.task_id
        and public.is_workspace_member(task_row.workspace_id)
    )
  );

create policy task_checklist_items_insert_managers
  on public.task_checklist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tasks task_row
      where task_row.id = task_checklist_items.task_id
        and public.can_manage_workspace_stock(task_row.workspace_id)
    )
  );

create policy task_checklist_items_update_workspace
  on public.task_checklist_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tasks task_row
      where task_row.id = task_checklist_items.task_id
        and (
          public.can_manage_workspace_stock(task_row.workspace_id)
          or public.can_complete_workspace_task(task_row.workspace_id, task_row.assigned_employee_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.tasks task_row
      where task_row.id = task_checklist_items.task_id
        and (
          public.can_manage_workspace_stock(task_row.workspace_id)
          or public.can_complete_workspace_task(task_row.workspace_id, task_row.assigned_employee_id)
        )
    )
  );

create policy task_checklist_items_delete_managers
  on public.task_checklist_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tasks task_row
      where task_row.id = task_checklist_items.task_id
        and public.can_manage_workspace_stock(task_row.workspace_id)
    )
  );

create policy inventory_items_select_members
  on public.inventory_items
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy inventory_items_insert_managers
  on public.inventory_items
  for insert
  to authenticated
  with check (public.can_manage_any_workspace_schedule());

create policy inventory_items_update_managers
  on public.inventory_items
  for update
  to authenticated
  using (public.can_manage_any_workspace_schedule())
  with check (public.can_manage_any_workspace_schedule());

create policy inventory_items_delete_managers
  on public.inventory_items
  for delete
  to authenticated
  using (public.can_manage_any_workspace_schedule());

create policy bar_refills_select_members
  on public.bar_refills
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy bar_refills_insert_managers
  on public.bar_refills
  for insert
  to authenticated
  with check (public.can_manage_any_workspace_schedule());

create policy bar_refills_update_managers
  on public.bar_refills
  for update
  to authenticated
  using (public.can_manage_any_workspace_schedule())
  with check (public.can_manage_any_workspace_schedule());

create policy bar_refills_delete_managers
  on public.bar_refills
  for delete
  to authenticated
  using (public.can_manage_any_workspace_schedule());

create policy bar_refill_items_select_members
  on public.bar_refill_items
  for select
  to authenticated
  using (public.has_any_workspace_membership());

create policy bar_refill_items_insert_managers
  on public.bar_refill_items
  for insert
  to authenticated
  with check (public.can_manage_any_workspace_schedule());

create policy bar_refill_items_update_managers
  on public.bar_refill_items
  for update
  to authenticated
  using (public.can_manage_any_workspace_schedule())
  with check (public.can_manage_any_workspace_schedule());

create policy bar_refill_items_delete_managers
  on public.bar_refill_items
  for delete
  to authenticated
  using (public.can_manage_any_workspace_schedule());

do $close_public_policies_phase_b_sequences$
declare
  v_table text;
  v_sequence text;
begin
  foreach v_table in array array[
    'tasks',
    'task_templates',
    'task_template_checklist_items',
    'task_checklist_items'
  ]
  loop
    v_sequence := pg_get_serial_sequence('public.' || v_table, 'id');
    if v_sequence is not null then
      execute format('grant usage, select on sequence %s to authenticated', v_sequence);
    end if;
  end loop;
end
$close_public_policies_phase_b_sequences$;

commit;
