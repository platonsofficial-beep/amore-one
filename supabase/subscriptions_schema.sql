-- ONE subscriptions. NOT APPLIED.
-- Platon approves this file before anyone runs it. Do not apply it to the live project from CI.
--
-- Grace is one config value: public.subscription_config.grace_days, default 7.
-- workspace_allows_writes stays true through that window after a trial ends or a
-- payment fails, and returns false once the window ends. A paid active period
-- in the future unlocks immediately. A venue with no billing row stays open.
-- Demo and test venues are free_forever on the venue row, not on every venue
-- the same person later creates.
--
-- Each new Start or Pro venue gets its own one-month trial (interval '1 month').
-- Group has no free month. Creating many venues farms free months; the Start
-- cap is still 1 venue and the Pro cap is still 3.

create table if not exists public.subscription_config (
  id int primary key check (id = 1),
  grace_days int not null default 7 check (grace_days >= 0)
);

insert into public.subscription_config (id, grace_days)
values (1, 7)
on conflict (id) do nothing;

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_auth_user_id uuid,
  stripe_customer_id text,
  extra_venue_qty int not null default 0 check (extra_venue_qty >= 0),
  name text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists billing_accounts_owner_unique
  on public.billing_accounts (owner_auth_user_id)
  where owner_auth_user_id is not null;

create table if not exists public.billing_account_venues (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan text not null default 'start' check (plan in ('start', 'pro', 'group')),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'month3', 'month6', 'year')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'grace', 'locked', 'canceled', 'pending_payment')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_started_at timestamptz,
  grace_reason text check (grace_reason in ('trial', 'payment')),
  free_forever boolean not null default false,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.billing_account_venues add column if not exists free_forever boolean not null default false;
alter table public.billing_account_venues add column if not exists grace_started_at timestamptz;
alter table public.billing_account_venues add column if not exists grace_reason text;
alter table public.billing_account_venues add column if not exists trial_ends_at timestamptz;
alter table public.billing_account_venues add column if not exists current_period_end timestamptz;
alter table public.billing_account_venues add column if not exists billing_interval text not null default 'month';
alter table public.billing_account_venues add column if not exists stripe_subscription_id text;

create unique index if not exists billing_account_venues_workspace_unique
  on public.billing_account_venues (workspace_id);

alter table public.subscription_config enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.billing_account_venues enable row level security;

revoke all on public.subscription_config from public, anon, authenticated;
revoke all on public.billing_accounts from public, anon, authenticated;
revoke all on public.billing_account_venues from public, anon, authenticated;
grant select on public.subscription_config to authenticated;
grant select on public.billing_accounts to authenticated;
grant select on public.billing_account_venues to authenticated;

drop policy if exists subscription_config_select on public.subscription_config;
create policy subscription_config_select on public.subscription_config
  for select to authenticated
  using (true);

drop policy if exists billing_accounts_select on public.billing_accounts;
create policy billing_accounts_select on public.billing_accounts
  for select to authenticated
  using (
    owner_auth_user_id = auth.uid()
    or exists (
      select 1
      from public.billing_account_venues v
      join public.workspace_members m on m.workspace_id = v.workspace_id
      where v.billing_account_id = billing_accounts.id
        and m.auth_user_id = auth.uid()
    )
  );

drop policy if exists billing_account_venues_select on public.billing_account_venues;
create policy billing_account_venues_select on public.billing_account_venues
  for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = billing_account_venues.workspace_id
        and m.auth_user_id = auth.uid()
    )
  );

create or replace function public.subscription_grace_days()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select grace_days from public.subscription_config where id = 1), 7);
$$;

create or replace function public.workspace_allows_writes(p_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $allows$
declare
  v_grace int := public.subscription_grace_days();
  v public.billing_account_venues%rowtype;
  v_now timestamptz := now();
begin
  if p_workspace_id is null then
    return true;
  end if;

  select * into v
  from public.billing_account_venues
  where workspace_id = p_workspace_id;

  if not found then
    return true;
  end if;

  if coalesce(v.free_forever, false) then
    return true;
  end if;

  if v.status = 'active' and v.current_period_end is not null and v_now < v.current_period_end then
    return true;
  end if;

  if v.status = 'trialing' and v.trial_ends_at is not null and v_now < v.trial_ends_at then
    return true;
  end if;

  if v.grace_started_at is not null
     and (v.grace_reason = 'payment' or v.status = 'past_due')
     and v_now < v.grace_started_at + make_interval(days => v_grace) then
    return true;
  end if;

  if v.status = 'active'
     and v.current_period_end is not null
     and v_now >= v.current_period_end
     and v_now < v.current_period_end + make_interval(days => v_grace) then
    return true;
  end if;

  if v.trial_ends_at is not null
     and coalesce(v.grace_reason, '') <> 'payment'
     and v.status not in ('past_due', 'pending_payment', 'canceled')
     and v_now < v.trial_ends_at + make_interval(days => v_grace) then
    return true;
  end if;

  return false;
end;
$allows$;

comment on function public.workspace_allows_writes(uuid) is
  'True during trial, a paid period, or the grace_days window (default 7) after trial end or payment failure. False once grace ends. Missing row stays true.';

create or replace function public.assert_employee_plan_cap(p_workspace_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $cap$
declare
  v_plan text;
  v_free boolean;
  v_cap int;
  v_count int;
  v_has_active boolean;
begin
  select plan, free_forever into v_plan, v_free
  from public.billing_account_venues
  where workspace_id = p_workspace_id;

  if coalesce(v_free, false) or v_plan is null or v_plan = 'group' then
    return;
  end if;

  v_cap := case v_plan when 'start' then 15 when 'pro' then 40 else null end;
  if v_cap is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'active'
  ) into v_has_active;

  if v_has_active then
    execute $count$
      select count(*) from public.employees
      where workspace_id = $1
        and id is distinct from $2
        and coalesce(active, true) = true
        and lower(coalesce(status, '')) <> 'disabled'
    $count$
      into v_count
      using p_workspace_id, p_employee_id;
  else
    execute $count$
      select count(*) from public.employees
      where workspace_id = $1
        and id is distinct from $2
        and lower(coalesce(status, '')) <> 'disabled'
    $count$
      into v_count
      using p_workspace_id, p_employee_id;
  end if;

  if v_count >= v_cap then
    raise exception 'plan_staff_cap' using errcode = 'P0001';
  end if;
end;
$cap$;

create or replace function public.enforce_workspace_subscription_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
declare
  v_payload jsonb;
  v_workspace uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  begin
    v_workspace := nullif(v_payload->>'workspace_id', '')::uuid;
  exception when others then
    v_workspace := null;
  end;

  if v_workspace is null
     and tg_table_name = 'chat_messages'
     and to_regclass('public.chat_conversations') is not null then
    begin
      execute 'select workspace_id from public.chat_conversations where id = $1'
        into v_workspace
        using nullif(v_payload->>'conversation_id', '')::uuid;
    exception when others then
      v_workspace := null;
    end;
  end if;

  if v_workspace is not null and not public.workspace_allows_writes(v_workspace) then
    raise exception 'workspace_subscription_locked' using errcode = 'P0001';
  end if;

  if tg_op <> 'DELETE'
     and tg_table_name = 'employees'
     and v_workspace is not null
     and coalesce(v_payload->>'active', 'true') <> 'false'
     and lower(coalesce(v_payload->>'status', '')) <> 'disabled' then
    perform public.assert_employee_plan_cap(v_workspace, nullif(v_payload->>'id', '')::uuid);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$guard$;

do $attach$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and c.table_name not like 'billing\_%' escape '\'
      and c.table_name <> 'subscription_config'
  loop
    execute format('drop trigger if exists subscription_write_guard on public.%I', r.table_name);
    execute format(
      'create trigger subscription_write_guard before insert or update or delete on public.%I for each row execute function public.enforce_workspace_subscription_write()',
      r.table_name
    );
  end loop;

  if to_regclass('public.chat_messages') is not null then
    execute 'drop trigger if exists subscription_write_guard on public.chat_messages';
    execute 'create trigger subscription_write_guard before insert or update or delete on public.chat_messages for each row execute function public.enforce_workspace_subscription_write()';
  end if;
end;
$attach$;

create or replace function public.venue_plan_allows_another(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $cap$
declare
  v_count int;
  v_plan text;
  v_extra int;
begin
  select count(*) into v_count
  from public.billing_account_venues v
  join public.billing_accounts a on a.id = v.billing_account_id
  where a.owner_auth_user_id = p_uid
    and coalesce(v.free_forever, false) = false;

  select v.plan into v_plan
  from public.billing_account_venues v
  join public.billing_accounts a on a.id = v.billing_account_id
  where a.owner_auth_user_id = p_uid
    and v.plan in ('start', 'pro', 'group')
    and coalesce(v.free_forever, false) = false
  order by v.created_at asc
  limit 1;

  if v_plan is null then
    return true;
  end if;
  if v_plan = 'start' and v_count >= 1 then
    return false;
  end if;
  if v_plan = 'pro' and v_count >= 3 then
    return false;
  end if;
  if v_plan = 'group' then
    select coalesce(extra_venue_qty, 0) into v_extra
    from public.billing_accounts
    where owner_auth_user_id = p_uid
    limit 1;
    if v_count >= 5 + coalesce(v_extra, 0) then
      return false;
    end if;
  end if;
  return true;
end;
$cap$;

create or replace function public.start_venue_trial(p_workspace_id uuid, p_plan text)
returns uuid
language plpgsql
security definer
set search_path = public
as $trial$
declare
  v_uid uuid := auth.uid();
  v_account uuid;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_plan not in ('start', 'pro') then
    raise exception 'trial_plan_not_allowed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and auth_user_id = v_uid
      and role = 'owner'
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select id into v_existing
  from public.billing_account_venues
  where workspace_id = p_workspace_id;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_account
  from public.billing_accounts
  where owner_auth_user_id = v_uid
  limit 1;
  if v_account is null then
    insert into public.billing_accounts (owner_auth_user_id)
    values (v_uid)
    returning id into v_account;
  end if;

  insert into public.billing_account_venues (
    billing_account_id, workspace_id, plan, billing_interval, status, trial_ends_at
  ) values (
    v_account, p_workspace_id, p_plan, 'month', 'trialing', now() + interval '1 month'
  )
  returning id into v_existing;
  return v_existing;
end;
$trial$;

create or replace function public.attach_new_venue_billing(p_workspace_id uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $attach$
declare
  v_plan text;
  v_account uuid;
begin
  if not public.venue_plan_allows_another(p_uid) then
    raise exception 'plan_venue_cap' using errcode = 'P0001';
  end if;

  select v.plan, a.id into v_plan, v_account
  from public.billing_account_venues v
  join public.billing_accounts a on a.id = v.billing_account_id
  where a.owner_auth_user_id = p_uid
    and coalesce(v.free_forever, false) = false
  order by v.created_at asc
  limit 1;

  if v_plan = 'group' then
    insert into public.billing_account_venues (
      billing_account_id, workspace_id, plan, billing_interval, status
    ) values (
      v_account, p_workspace_id, 'group', 'month', 'pending_payment'
    );
    return;
  end if;

  perform public.start_venue_trial(p_workspace_id, coalesce(v_plan, 'pro'));
end;
$attach$;

-- First venue for a brand-new signup. Never attaches the caller to an existing
-- workspace, including AMORE.NICOSIA.
create or replace function public.create_signup_venue(
  p_name text,
  p_plan text default 'start',
  p_timezone text default 'Europe/Nicosia',
  p_currency text default 'EUR'
) returns uuid
language plpgsql
security definer
set search_path = public
as $signup$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Nicosia');
  v_slug text;
  v_email text;
  v_bar uuid;
  v_kitchen uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspace_members where auth_user_id = v_uid) then
    raise exception 'membership_exists' using errcode = '23505';
  end if;
  if p_plan not in ('start', 'pro') then
    raise exception 'trial_plan_not_allowed' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'invalid_venue_name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' or v_slug = 'amore-nicosia' then
    v_slug := 'venue';
  end if;
  v_slug := left(v_slug, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.workspaces (name, slug) values (v_name, v_slug) returning id into v_ws;
  insert into public.workspace_members (workspace_id, auth_user_id, display_name, email, role)
  values (v_ws, v_uid, v_name, coalesce(v_email, ''), 'owner');
  insert into public.workspace_profiles (
    workspace_key, workspace_id, business_name, timezone, currency, city, country_code, country_name
  ) values (
    v_ws::text, v_ws, v_name, v_tz, coalesce(nullif(btrim(p_currency), ''), 'EUR'), '', 'CY', 'Cyprus'
  );
  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Bar', 0, true, v_uid, v_uid) returning id into v_bar;
  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Kitchen', 1, true, v_uid, v_uid) returning id into v_kitchen;
  insert into public.workspace_storages (
    workspace_id, location_key, name, sort_order, active, department_id, is_supply, is_buying, created_by, updated_by
  )
  select v_ws, s.k, s.k, s.o, true,
         case s.d when 'bar' then v_bar when 'kitchen' then v_kitchen end,
         s.k = 'Main Storage', false, v_uid, v_uid
  from (values
    ('Main Storage', 0, 'bar'),
    ('Bar', 1, 'bar'),
    ('Coffee Station', 2, 'bar'),
    ('Freezer', 3, 'kitchen'),
    ('Fridge', 4, 'kitchen'),
    ('Kitchen', 5, 'kitchen'),
    ('Wine Storage', 6, 'bar'),
    ('Water Storage', 7, 'bar'),
    ('Other', 8, null)
  ) s(k, o, d);

  perform public.start_venue_trial(v_ws, p_plan);
  return v_ws;
end;
$signup$;

-- Additional venues. Same body as create_workspace_venue.sql, plus the billing attach.
-- Apply this file after create_workspace_venue.sql.
create or replace function public.create_workspace_venue(
  p_name text,
  p_timezone text default 'Europe/Nicosia',
  p_currency text default 'EUR',
  p_city text default '',
  p_country_code text default 'CY',
  p_country_name text default 'Cyprus'
) returns uuid
language plpgsql
security definer
set search_path = public
as $venue$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Nicosia');
  v_slug text;
  v_display text;
  v_email text;
  v_bar uuid;
  v_kitchen uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_venue_name' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.workspace_members
    where auth_user_id = v_uid and role in ('owner', 'general_manager')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if not public.venue_plan_allows_another(v_uid) then
    raise exception 'plan_venue_cap' using errcode = 'P0001';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' or v_slug = 'amore-nicosia' then v_slug := 'venue'; end if;
  v_slug := left(v_slug, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.workspaces (name, slug) values (v_name, v_slug) returning id into v_ws;

  select display_name, email into v_display, v_email
  from public.workspace_members
  where auth_user_id = v_uid
  order by (role = 'owner') desc, created_at asc
  limit 1;

  insert into public.workspace_members (workspace_id, auth_user_id, display_name, email, role)
  values (v_ws, v_uid, coalesce(v_display, ''), coalesce(v_email, ''), 'owner');

  insert into public.workspace_profiles (
    workspace_key, workspace_id, business_name, timezone, currency, city, country_code, country_name
  ) values (
    v_ws::text, v_ws, v_name, v_tz, coalesce(nullif(btrim(p_currency), ''), 'EUR'),
    coalesce(btrim(p_city), ''), coalesce(btrim(p_country_code), ''), coalesce(btrim(p_country_name), '')
  );

  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Bar', 0, true, v_uid, v_uid) returning id into v_bar;
  insert into public.workspace_departments (workspace_id, name, sort_order, active, created_by, updated_by)
  values (v_ws, 'Kitchen', 1, true, v_uid, v_uid) returning id into v_kitchen;

  insert into public.workspace_storages (
    workspace_id, location_key, name, sort_order, active, department_id, is_supply, is_buying, created_by, updated_by
  )
  select v_ws, s.k, s.k, s.o, true,
         case s.d when 'bar' then v_bar when 'kitchen' then v_kitchen end,
         s.k = 'Main Storage', false, v_uid, v_uid
  from (values
    ('Main Storage', 0, 'bar'),
    ('Bar', 1, 'bar'),
    ('Coffee Station', 2, 'bar'),
    ('Freezer', 3, 'kitchen'),
    ('Fridge', 4, 'kitchen'),
    ('Kitchen', 5, 'kitchen'),
    ('Wine Storage', 6, 'bar'),
    ('Water Storage', 7, 'bar'),
    ('Other', 8, null)
  ) s(k, o, d);

  perform public.attach_new_venue_billing(v_ws, v_uid);
  return v_ws;
end;
$venue$;

revoke all on function public.subscription_grace_days() from public, anon;
revoke all on function public.workspace_allows_writes(uuid) from public, anon;
revoke all on function public.start_venue_trial(uuid, text) from public, anon;
revoke all on function public.attach_new_venue_billing(uuid, uuid) from public, anon;
revoke all on function public.create_signup_venue(text, text, text, text) from public, anon;
revoke all on function public.venue_plan_allows_another(uuid) from public, anon;
grant execute on function public.subscription_grace_days() to authenticated;
grant execute on function public.workspace_allows_writes(uuid) to authenticated;
grant execute on function public.start_venue_trial(uuid, text) to authenticated;
grant execute on function public.create_signup_venue(text, text, text, text) to authenticated;
grant execute on function public.create_workspace_venue(text, text, text, text, text, text) to authenticated;

insert into public.billing_accounts (id, name)
values ('00000000-0000-4000-8000-000000000001', 'ONE complimentary venues')
on conflict (id) do nothing;

insert into public.billing_account_venues (
  billing_account_id, workspace_id, plan, billing_interval, status, free_forever, current_period_end
)
select
  '00000000-0000-4000-8000-000000000001',
  w.id,
  'group',
  'year',
  'active',
  true,
  now() + interval '100 years'
from public.workspaces w
where w.slug = 'amore-nicosia'
   or w.slug ilike '%demo%'
   or w.slug ilike '%test%'
   or w.name ilike '%demo%'
   or w.name ilike '%test%'
on conflict (workspace_id) do update
  set free_forever = true,
      status = 'active',
      current_period_end = excluded.current_period_end;
