-- Atomic publication for the existing ONE single-venue publication schema.
-- Requires schedule_publications, published_shifts, shifts, shift_templates,
-- employees and stock/workspace membership helpers. No automatic workspace backfill.
begin;
alter table public.schedule_publications add column if not exists revision bigint not null default 0;
alter table public.schedule_publications add column if not exists last_request_id uuid;
alter table public.schedule_publications add column if not exists last_request_payload jsonb;

create or replace function public.get_week_schedule_snapshot(p_workspace_id uuid, p_week_start_date date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'schedule_publication_forbidden' using errcode = '42501';
  end if;
  -- The legacy tables have no workspace_id. Fail closed rather than imply
  -- multi-tenant isolation that their schema cannot provide.
  if (select count(*) from public.workspaces) <> 1 then
    raise exception 'schedule_publication_single_workspace_required';
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
revoke all on function public.get_week_schedule_snapshot(uuid,date) from public, anon;
grant execute on function public.get_week_schedule_snapshot(uuid,date) to authenticated;

create or replace function public.set_week_schedule_publication(
  p_workspace_id uuid, p_week_start_date date, p_status text,
  p_expected_revision bigint, p_request_id uuid, p_draft_shifts jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_publication public.schedule_publications%rowtype;
  v_live_shifts jsonb;
  v_expected_shifts jsonb;
  v_payload jsonb;
begin
  if auth.uid() is null or not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'schedule_publication_forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.workspaces) <> 1 then
    raise exception 'schedule_publication_single_workspace_required';
  end if;
  if p_week_start_date is null or p_request_id is null or p_expected_revision is null
    or p_expected_revision < 0 or p_status is null or p_status not in ('draft','published') then
    raise exception 'schedule_publication_request_invalid';
  end if;
  if p_draft_shifts is null or jsonb_typeof(p_draft_shifts) <> 'array' then
    raise exception 'schedule_publication_shifts_invalid';
  end if;
  select coalesce(jsonb_agg(x.value order by x.value->>'id'),'[]'::jsonb)
    into v_expected_shifts from jsonb_array_elements(p_draft_shifts) x;
  v_payload := jsonb_build_object('status',p_status,'revision',p_expected_revision,'shifts',v_expected_shifts);

  insert into public.schedule_publications(week_start_date) values(p_week_start_date)
  on conflict (week_start_date) do nothing;
  select * into v_publication from public.schedule_publications
    where week_start_date = p_week_start_date for update;
  if v_publication.last_request_id = p_request_id then
    if v_publication.last_request_payload is distinct from v_payload then
      raise exception 'schedule_publication_request_conflict';
    end if;
    return public.get_week_schedule_snapshot(p_workspace_id,p_week_start_date);
  end if;
  if v_publication.revision <> p_expected_revision then
    raise exception 'schedule_publication_stale_revision';
  end if;

  if p_status = 'published' then
    -- Lock saved shifts so edits/deletions cannot race snapshot construction.
    perform 1 from public.shifts s where s.workspace_id = p_workspace_id
      and s.shift_date >= p_week_start_date and s.shift_date < p_week_start_date + 7
      order by s.id for share;
    if exists (select 1 from public.shifts s
      where s.workspace_id = p_workspace_id and s.shift_date >= p_week_start_date
        and s.shift_date < p_week_start_date + 7 and (
          s.employee_id is null or s.shift_template_id is null
          or not exists (select 1 from public.employees e where e.id=s.employee_id and e.workspace_id=p_workspace_id)
          or not exists (select 1 from public.shift_templates t where t.id=s.shift_template_id)
          or s.start_time::time = s.end_time::time)) then
      raise exception 'schedule_publication_invalid_assignment';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'employee_id',s.employee_id,'shift_template_id',s.shift_template_id,
      'shift_date',s.shift_date,'start_time',to_char(s.start_time::time,'HH24:MI'),
      'end_time',to_char(s.end_time::time,'HH24:MI'),'role',btrim(s.role),
      'area',btrim(s.area),'status',btrim(s.status),'notes',btrim(s.notes)) order by s.id),'[]'::jsonb)
    into v_live_shifts from public.shifts s
    where s.workspace_id=p_workspace_id and s.shift_date >= p_week_start_date
      and s.shift_date < p_week_start_date + 7;
    if v_live_shifts is distinct from v_expected_shifts then
      raise exception 'schedule_publication_draft_changed';
    end if;
  end if;

  -- A later error rolls back this deletion, replacement AND publication status.
  delete from public.published_shifts where week_start_date=p_week_start_date;
  if p_status = 'published' then
    insert into public.published_shifts(publication_id,week_start_date,employee_id,
      shift_template_id,shift_date,start_time,end_time,role,area,status,notes)
    select v_publication.id,p_week_start_date,x.employee_id,x.shift_template_id,
      x.shift_date,x.start_time,x.end_time,x.role,x.area,x.status,x.notes
    from jsonb_to_recordset(v_live_shifts) as x(employee_id uuid,shift_template_id uuid,
      shift_date date,start_time time,end_time time,role text,area text,status text,notes text);
  end if;
  update public.schedule_publications set status=p_status,
    published_at=case when p_status='published' then now() else null end,
    unpublished_at=case when p_status='draft' then now() else null end,
    revision=revision+1,last_request_id=p_request_id,last_request_payload=v_payload
  where id=v_publication.id;
  return public.get_week_schedule_snapshot(p_workspace_id,p_week_start_date);
end;
$$;
revoke all on function public.set_week_schedule_publication(uuid,date,text,bigint,uuid,jsonb) from public, anon;
grant execute on function public.set_week_schedule_publication(uuid,date,text,bigint,uuid,jsonb) to authenticated;

-- Prevent old clients from bypassing the transaction/revision check.
revoke insert,update,delete on public.schedule_publications,public.published_shifts from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
