-- NOT APPLIED.
--
-- get_week_schedule_snapshot raises schedule_publication_single_workspace_required
-- when public.workspaces has more than one row. Today then treats the whole
-- schedule load as a failure, so On shift, Team, and Attention show
-- "Couldn't load" even when the week is simply unpublished.
--
-- The app now reads that refusal as "nothing is published", so Today does not
-- need this file. Apply it only if a published week must load again while more
-- than one venue exists. schedule_publications is still not stored per venue,
-- so this read is the legacy single publication row, visible to every member.

create or replace function public.get_week_schedule_snapshot(p_workspace_id uuid, p_week_start_date date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'schedule_publication_forbidden' using errcode = '42501';
  end if;
  if p_week_start_date is null then raise exception 'schedule_publication_week_required'; end if;
  select jsonb_build_object(
    'publication', to_jsonb(p) - 'last_request_payload',
    'published_shifts', case when p.status = 'published' then coalesce((
      select jsonb_agg(to_jsonb(s) || jsonb_build_object('employees',
        case when e.id is not null then jsonb_build_object('full_name', e.full_name) else null end)
        order by s.shift_date, s.start_time, s.id)
      from public.published_shifts s
      left join public.employees e on e.id = s.employee_id and e.workspace_id = p_workspace_id
      where s.publication_id = p.id and s.week_start_date = p_week_start_date
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result from public.schedule_publications p where p.week_start_date = p_week_start_date;
  return coalesce(v_result, jsonb_build_object('publication', jsonb_build_object(
    'week_start_date', p_week_start_date, 'status', 'draft', 'revision', 0), 'published_shifts', '[]'::jsonb));
end;
$$;

revoke all on function public.get_week_schedule_snapshot(uuid, date) from public, anon;
grant execute on function public.get_week_schedule_snapshot(uuid, date) to authenticated;
