-- Draft vs published floor plan layouts for ONE Reservations.
-- Run after floor_plans_schema.sql and floor_plans_rls_policies.sql.
--
-- layout_json      = published layout (visible in Host Mode)
-- draft_layout_json = owner draft while editing (optional)
-- published_at     = last publish timestamp

alter table public.floor_plans
  add column if not exists draft_layout_json jsonb,
  add column if not exists published_at timestamptz;

comment on column public.floor_plans.layout_json is
  'Published floor plan layout shown in Host Mode.';

comment on column public.floor_plans.draft_layout_json is
  'Owner draft layout while editing. Falls back to layout_json when null.';

comment on column public.floor_plans.published_at is
  'Timestamp when layout_json was last published to Host Mode.';
