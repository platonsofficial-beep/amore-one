-- Manual sort order for shift templates in Team → Schedule.
-- Run after shift_templates table exists.

alter table public.shift_templates
  add column if not exists sort_order integer not null default 0;

create index if not exists shift_templates_sort_order_idx
  on public.shift_templates (sort_order, template_name);

-- Backfill initial order by name when every row is still at the default.
do $$
begin
  if exists (
    select 1
    from public.shift_templates
  ) and not exists (
    select 1
    from public.shift_templates
    where sort_order <> 0
    limit 1
  ) then
    with ordered as (
      select id, row_number() over (order by template_name) as rn
      from public.shift_templates
    )
    update public.shift_templates st
    set sort_order = ordered.rn
    from ordered
    where st.id = ordered.id;
  end if;
end $$;
