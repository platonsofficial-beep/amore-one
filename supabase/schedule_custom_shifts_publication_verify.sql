-- Run with explicit owner approval
-- =============================================================================
-- Verify schedule publication allows a null shift_template_id (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if the applied function still rejects custom shifts.
-- Does not publish a week and does not change rows.
-- =============================================================================

begin;

do $$
declare
  src text;
  shifts_nullable text;
  published_nullable text;
begin
  src := pg_get_functiondef('public.set_week_schedule_publication(uuid,date,text,bigint,uuid,jsonb)'::regprocedure);

  if src not like '%custom_shift_null_template_id_allowed%' then
    raise exception 'verify_failed_custom_shift_marker_missing';
  end if;

  if src like '%s.shift_template_id is null%' then
    raise exception 'verify_failed_null_template_still_rejected';
  end if;

  if src not like '%s.shift_template_id is not null and not exists%' then
    raise exception 'verify_failed_present_template_must_exist';
  end if;

  select c.is_nullable into shifts_nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'shifts' and c.column_name = 'shift_template_id';
  if shifts_nullable is distinct from 'YES' then
    raise exception 'verify_failed_shifts_template_id_not_nullable';
  end if;

  select c.is_nullable into published_nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'published_shifts' and c.column_name = 'shift_template_id';
  if published_nullable is distinct from 'YES' then
    raise exception 'verify_failed_published_shifts_template_id_not_nullable';
  end if;
end $$;

commit;
