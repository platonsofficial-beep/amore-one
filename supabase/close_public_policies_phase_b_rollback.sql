-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase B rollback (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Run only to undo supabase/close_public_policies_phase_b.sql.
-- Idempotent. One transaction.
--
-- Drops the policies, triggers, functions, indexes, foreign keys, and
-- workspace_id columns this phase added. Then recreates the production
-- policies exactly as they were in the snapshot: names, roles (including
-- public, and anon, authenticated), commands, and true expressions.
--
-- Does not touch shifts, reservations, or schedule_publications (phase A).
-- Does not drop is_workspace_member, can_manage_workspace_stock,
-- has_any_workspace_membership, or can_manage_any_workspace_schedule.
--
-- The snapshot did not include GRANT rows. Phase B revoked anon and public
-- on these nine tables, so this rollback grants select, insert, update, and
-- delete back to public, anon, and authenticated. That is what the restored
-- policies need in order to work again. Identity sequence usage is granted
-- to the same roles when a sequence exists.
--
-- Backfill values disappear with the workspace_id column. Row data in the
-- other columns is left as it is. Running phase B again backfills when
-- public.workspaces still has exactly one row.
-- =============================================================================

begin;

do $close_public_policies_phase_b_rollback_tables$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shift_templates',
    'schedule_capacity',
    'tasks',
    'task_templates',
    'task_template_checklist_items',
    'task_checklist_items',
    'inventory_items',
    'bar_refills',
    'bar_refill_items'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'phase b rollback: public.% is missing', v_table;
    end if;
  end loop;
end
$close_public_policies_phase_b_rollback_tables$;

drop policy if exists shift_templates_select_members on public.shift_templates;
drop policy if exists shift_templates_insert_managers on public.shift_templates;
drop policy if exists shift_templates_update_managers on public.shift_templates;
drop policy if exists shift_templates_delete_managers on public.shift_templates;

drop policy if exists schedule_capacity_select_members on public.schedule_capacity;
drop policy if exists schedule_capacity_insert_managers on public.schedule_capacity;
drop policy if exists schedule_capacity_update_managers on public.schedule_capacity;
drop policy if exists schedule_capacity_delete_managers on public.schedule_capacity;

drop policy if exists tasks_select_members on public.tasks;
drop policy if exists tasks_insert_managers on public.tasks;
drop policy if exists tasks_update_workspace on public.tasks;
drop policy if exists tasks_delete_managers on public.tasks;

drop policy if exists task_templates_select_members on public.task_templates;
drop policy if exists task_templates_insert_managers on public.task_templates;
drop policy if exists task_templates_update_managers on public.task_templates;
drop policy if exists task_templates_delete_managers on public.task_templates;

drop policy if exists task_template_checklist_items_select_members on public.task_template_checklist_items;
drop policy if exists task_template_checklist_items_insert_managers on public.task_template_checklist_items;
drop policy if exists task_template_checklist_items_update_managers on public.task_template_checklist_items;
drop policy if exists task_template_checklist_items_delete_managers on public.task_template_checklist_items;

drop policy if exists task_checklist_items_select_members on public.task_checklist_items;
drop policy if exists task_checklist_items_insert_managers on public.task_checklist_items;
drop policy if exists task_checklist_items_update_workspace on public.task_checklist_items;
drop policy if exists task_checklist_items_delete_managers on public.task_checklist_items;

drop policy if exists inventory_items_select_members on public.inventory_items;
drop policy if exists inventory_items_insert_managers on public.inventory_items;
drop policy if exists inventory_items_update_managers on public.inventory_items;
drop policy if exists inventory_items_delete_managers on public.inventory_items;

drop policy if exists bar_refills_select_members on public.bar_refills;
drop policy if exists bar_refills_insert_managers on public.bar_refills;
drop policy if exists bar_refills_update_managers on public.bar_refills;
drop policy if exists bar_refills_delete_managers on public.bar_refills;

drop policy if exists bar_refill_items_select_members on public.bar_refill_items;
drop policy if exists bar_refill_items_insert_managers on public.bar_refill_items;
drop policy if exists bar_refill_items_update_managers on public.bar_refill_items;
drop policy if exists bar_refill_items_delete_managers on public.bar_refill_items;

drop trigger if exists tasks_guard_staff_update on public.tasks;
drop trigger if exists task_checklist_items_guard_staff_update on public.task_checklist_items;

drop function if exists public.can_complete_workspace_task(uuid, uuid);
drop function if exists public.tasks_guard_staff_update();
drop function if exists public.task_checklist_items_guard_staff_update();

drop index if exists public.shift_templates_workspace_id_idx;
drop index if exists public.tasks_workspace_id_idx;
drop index if exists public.task_templates_workspace_id_idx;

alter table public.shift_templates drop constraint if exists shift_templates_workspace_id_fkey;
alter table public.tasks drop constraint if exists tasks_workspace_id_fkey;
alter table public.task_templates drop constraint if exists task_templates_workspace_id_fkey;

alter table public.shift_templates drop column if exists workspace_id;
alter table public.tasks drop column if exists workspace_id;
alter table public.task_templates drop column if exists workspace_id;

drop policy if exists "Allow public delete shift_templates" on public.shift_templates;
create policy "Allow public delete shift_templates"
  on public.shift_templates
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert shift_templates" on public.shift_templates;
create policy "Allow public insert shift_templates"
  on public.shift_templates
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read shift_templates" on public.shift_templates;
create policy "Allow public read shift_templates"
  on public.shift_templates
  for select
  to public
  using (true);

drop policy if exists "Allow public update shift_templates" on public.shift_templates;
create policy "Allow public update shift_templates"
  on public.shift_templates
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "Allow public delete schedule_capacity" on public.schedule_capacity;
create policy "Allow public delete schedule_capacity"
  on public.schedule_capacity
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert schedule_capacity" on public.schedule_capacity;
create policy "Allow public insert schedule_capacity"
  on public.schedule_capacity
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read schedule_capacity" on public.schedule_capacity;
create policy "Allow public read schedule_capacity"
  on public.schedule_capacity
  for select
  to public
  using (true);

drop policy if exists "Allow public update schedule_capacity" on public.schedule_capacity;
create policy "Allow public update schedule_capacity"
  on public.schedule_capacity
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "Allow all tasks access" on public.tasks;
create policy "Allow all tasks access"
  on public.tasks
  for all
  to public
  using (true)
  with check (true);

drop policy if exists task_templates_dev_delete_all on public.task_templates;
create policy task_templates_dev_delete_all
  on public.task_templates
  for delete
  to anon, authenticated
  using (true);

drop policy if exists task_templates_dev_insert_all on public.task_templates;
create policy task_templates_dev_insert_all
  on public.task_templates
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists task_templates_dev_select_all on public.task_templates;
create policy task_templates_dev_select_all
  on public.task_templates
  for select
  to anon, authenticated
  using (true);

drop policy if exists task_templates_dev_update_all on public.task_templates;
create policy task_templates_dev_update_all
  on public.task_templates
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists task_template_checklist_items_dev_delete_all on public.task_template_checklist_items;
create policy task_template_checklist_items_dev_delete_all
  on public.task_template_checklist_items
  for delete
  to anon, authenticated
  using (true);

drop policy if exists task_template_checklist_items_dev_insert_all on public.task_template_checklist_items;
create policy task_template_checklist_items_dev_insert_all
  on public.task_template_checklist_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists task_template_checklist_items_dev_select_all on public.task_template_checklist_items;
create policy task_template_checklist_items_dev_select_all
  on public.task_template_checklist_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists task_template_checklist_items_dev_update_all on public.task_template_checklist_items;
create policy task_template_checklist_items_dev_update_all
  on public.task_template_checklist_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists task_checklist_items_dev_delete_all on public.task_checklist_items;
create policy task_checklist_items_dev_delete_all
  on public.task_checklist_items
  for delete
  to anon, authenticated
  using (true);

drop policy if exists task_checklist_items_dev_insert_all on public.task_checklist_items;
create policy task_checklist_items_dev_insert_all
  on public.task_checklist_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists task_checklist_items_dev_select_all on public.task_checklist_items;
create policy task_checklist_items_dev_select_all
  on public.task_checklist_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists task_checklist_items_dev_update_all on public.task_checklist_items;
create policy task_checklist_items_dev_update_all
  on public.task_checklist_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow public delete inventory_items" on public.inventory_items;
create policy "Allow public delete inventory_items"
  on public.inventory_items
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert inventory_items" on public.inventory_items;
create policy "Allow public insert inventory_items"
  on public.inventory_items
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read inventory_items" on public.inventory_items;
create policy "Allow public read inventory_items"
  on public.inventory_items
  for select
  to public
  using (true);

drop policy if exists "Allow public update inventory_items" on public.inventory_items;
create policy "Allow public update inventory_items"
  on public.inventory_items
  for update
  to public
  using (true)
  with check (true);

drop policy if exists inventory_items_dev_delete_all on public.inventory_items;
create policy inventory_items_dev_delete_all
  on public.inventory_items
  for delete
  to anon, authenticated
  using (true);

drop policy if exists inventory_items_dev_insert_all on public.inventory_items;
create policy inventory_items_dev_insert_all
  on public.inventory_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists inventory_items_dev_select_all on public.inventory_items;
create policy inventory_items_dev_select_all
  on public.inventory_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists inventory_items_dev_update_all on public.inventory_items;
create policy inventory_items_dev_update_all
  on public.inventory_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists bar_refills_dev_delete_all on public.bar_refills;
create policy bar_refills_dev_delete_all
  on public.bar_refills
  for delete
  to anon, authenticated
  using (true);

drop policy if exists bar_refills_dev_insert_all on public.bar_refills;
create policy bar_refills_dev_insert_all
  on public.bar_refills
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists bar_refills_dev_select_all on public.bar_refills;
create policy bar_refills_dev_select_all
  on public.bar_refills
  for select
  to anon, authenticated
  using (true);

drop policy if exists bar_refills_dev_update_all on public.bar_refills;
create policy bar_refills_dev_update_all
  on public.bar_refills
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists bar_refill_items_dev_delete_all on public.bar_refill_items;
create policy bar_refill_items_dev_delete_all
  on public.bar_refill_items
  for delete
  to anon, authenticated
  using (true);

drop policy if exists bar_refill_items_dev_insert_all on public.bar_refill_items;
create policy bar_refill_items_dev_insert_all
  on public.bar_refill_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists bar_refill_items_dev_select_all on public.bar_refill_items;
create policy bar_refill_items_dev_select_all
  on public.bar_refill_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists bar_refill_items_dev_update_all on public.bar_refill_items;
create policy bar_refill_items_dev_update_all
  on public.bar_refill_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.shift_templates to public, anon, authenticated;
grant select, insert, update, delete on table public.schedule_capacity to public, anon, authenticated;
grant select, insert, update, delete on table public.tasks to public, anon, authenticated;
grant select, insert, update, delete on table public.task_templates to public, anon, authenticated;
grant select, insert, update, delete on table public.task_template_checklist_items to public, anon, authenticated;
grant select, insert, update, delete on table public.task_checklist_items to public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_items to public, anon, authenticated;
grant select, insert, update, delete on table public.bar_refills to public, anon, authenticated;
grant select, insert, update, delete on table public.bar_refill_items to public, anon, authenticated;

do $close_public_policies_phase_b_rollback_sequences$
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
      execute format(
        'grant usage, select on sequence %s to public, anon, authenticated',
        v_sequence
      );
    end if;
  end loop;
end
$close_public_policies_phase_b_rollback_sequences$;

commit;
