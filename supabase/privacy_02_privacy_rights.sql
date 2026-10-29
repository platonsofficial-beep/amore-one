-- Privacy readiness 2/2: account deletion, data export, close venue (30-day grace),
-- retention engine (DISABLED), emergency-contact visibility fix.
-- Approved by Platon 2026-10-29 (t335u). Deletes no existing data when applied.

-- ---------------------------------------------------------------- schema
alter table public.workspaces
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid,
  add column if not exists purge_after timestamptz;

alter table public.workspace_members
  add column if not exists account_deleted_at timestamptz;

create table if not exists public.privacy_retention_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,           -- OFF until Platon approves
  reservation_guest_months int not null default 24, -- anonymise guest name/phone/notes
  chat_message_months int not null default 24,      -- blank body + attachment ref
  attendance_months int not null default 72,        -- delete clock-in records (6 years)
  notification_months int not null default 12,      -- delete in-app notifications
  invite_days int not null default 90,              -- delete used/expired/revoked invites
  push_stale_days int not null default 180,         -- delete unused push subscriptions
  closed_venue_grace_days int not null default 30,  -- closed venue -> permanent purge
  updated_at timestamptz not null default now()
);
insert into public.privacy_retention_settings (id) values (1) on conflict (id) do nothing;
alter table public.privacy_retention_settings enable row level security;
revoke all on public.privacy_retention_settings from anon, authenticated;

-- ---------------------------------------------------------------- sensitive fields
-- Emergency contact is personal HR data: require the private-data permission
-- (was gated by the stock permission). Salary unchanged; notes unchanged.
create or replace function public.get_employee_private_fields(p_workspace_id uuid, p_employee_ids uuid[])
 returns table(id uuid, salary numeric, emergency_contact text, notes text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'employee_details_forbidden' using errcode = '42501';
  end if;
  return query select e.id,
    case when public.can_manage_workspace_people_private(p_workspace_id) then e.salary else null::numeric end,
    case when public.can_manage_workspace_people_private(p_workspace_id) then e.emergency_contact else null::text end,
    case when public.can_manage_workspace_stock(p_workspace_id) then e.notes else null::text end
  from public.employees e
  where e.workspace_id = p_workspace_id and e.id = any(p_employee_ids);
end;
$function$;

-- ---------------------------------------------------------------- export helpers
create or replace function public.privacy_rows_json(p_table text, p_column text, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - array[''token'',''p256dh'',''auth'',''endpoint'']), ''[]''::jsonb) from public.%I t where %I = any($1)',
    p_table, p_column) into v using p_ids;
  return v;
end $$;
revoke all on function public.privacy_rows_json(text, text, uuid[]) from public, anon, authenticated;

-- "Λήψη των δεδομένων μου": everything linked to the signed-in user.
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_members uuid[];
  v_employees uuid[];
  v_out jsonb;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(employee_id) filter (where employee_id is not null), '{}')
    into v_members, v_employees from workspace_members where auth_user_id = v_uid;

  v_out := jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                 'last_sign_in_at', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'memberships', public.privacy_rows_json('workspace_members', 'id', v_members),
    'venues', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name)), '[]')
               from workspaces w where w.id in (select workspace_id from workspace_members where auth_user_id = v_uid)),
    'employee_records', public.privacy_rows_json('employees', 'id', v_employees));

  for r in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type = 'uuid'
      and c.column_name in ('member_id', 'author_member_id', 'employee_id', 'user_id')
      and c.table_name not in ('workspace_members', 'employees')
    order by 1, 2
  loop
    v_out := v_out || jsonb_build_object(r.table_name || '.' || r.column_name,
      public.privacy_rows_json(r.table_name, r.column_name,
        case r.column_name when 'employee_id' then v_employees when 'user_id' then array[v_uid]
             else v_members end));
  end loop;
  return v_out;
end $$;

-- Owner-level venue export (all rows of every table scoped to the venue).
create or replace function public.export_workspace_data(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; r record;
begin
  if auth.uid() is null or not public.is_workspace_owner(p_workspace_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_out := jsonb_build_object('exported_at', now(),
    'venue', (select to_jsonb(w) from workspaces w where w.id = p_workspace_id));
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'workspace_id' and c.data_type = 'uuid'
    order by 1
  loop
    v_out := v_out || jsonb_build_object(r.table_name,
      public.privacy_rows_json(r.table_name, 'workspace_id', array[p_workspace_id]));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- close / reopen venue
create or replace function public.close_workspace_venue(p_workspace_id uuid, p_confirm_name text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_name text; v_closed timestamptz; v_purge timestamptz; v_days int;
begin
  if auth.uid() is null or not public.is_workspace_owner(p_workspace_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select name, closed_at into v_name, v_closed from workspaces where id = p_workspace_id for update;
  if v_closed is not null then raise exception 'already_closed' using errcode = '22023'; end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'confirmation_mismatch' using errcode = '22023';
  end if;
  select closed_venue_grace_days into v_days from privacy_retention_settings where id = 1;
  v_purge := now() + make_interval(days => coalesce(v_days, 30));
  update workspaces set closed_at = now(), closed_by = auth.uid(), purge_after = v_purge where id = p_workspace_id;
  return v_purge;
end $$;

create or replace function public.reopen_workspace_venue(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_workspace_owner(p_workspace_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update workspaces set closed_at = null, closed_by = null, purge_after = null
   where id = p_workspace_id and closed_at is not null and purge_after > now();
  if not found then raise exception 'not_reopenable' using errcode = '22023'; end if;
end $$;

-- ---------------------------------------------------------------- account deletion
create or replace function public.delete_my_account(p_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_blocking text;
  v_members uuid[];
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if btrim(coalesce(p_confirm, '')) <> 'ΔΙΑΓΡΑΦΗ' then
    raise exception 'confirmation_required' using errcode = '22023';
  end if;

  -- Sole owner of an open venue: must transfer ownership or close the venue first.
  select string_agg(w.name, ', ' order by w.name) into v_blocking
  from workspace_members m join workspaces w on w.id = m.workspace_id
  where m.auth_user_id = v_uid and m.role = 'owner' and w.closed_at is null
    and not exists (select 1 from workspace_members o
                    where o.workspace_id = m.workspace_id and o.role = 'owner'
                      and o.auth_user_id <> v_uid and o.account_deleted_at is null);
  if v_blocking is not null then
    raise exception 'sole_owner' using errcode = '22023', detail = v_blocking;
  end if;

  select coalesce(array_agg(id), '{}') into v_members from workspace_members where auth_user_id = v_uid;

  -- Venue records (attendance, leave, chat history) stay with the venue (controller),
  -- but the person is anonymised.
  update workspace_members
     set display_name = 'Διαγραμμένος χρήστης', email = '', avatar_path = null,
         avatar_updated_at = null, last_seen_at = null, account_deleted_at = now()
   where auth_user_id = v_uid;
  delete from chat_participants where member_id = any(v_members);
  delete from push_subscriptions where user_id = v_uid;
  delete from notifications where user_id = v_uid;
  delete from notification_preferences where user_id = v_uid;
  delete from operations_announcement_reads where user_id = v_uid;

  -- Auth: remove login identities and sessions, scrub and lock the user record.
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.mfa_factors where user_id = v_uid;
  update auth.users
     set email = 'deleted-' || v_uid || '@deleted.invalid', phone = null,
         encrypted_password = '', raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', deleted_at = now()
   where id = v_uid;

  return jsonb_build_object('deleted', true, 'at', now());
end $$;

-- ---------------------------------------------------------------- retention (DISABLED)
create or replace function public.purge_workspace(p_workspace_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_pass int := 0; v_left int; v_deleted int := 0; n int;
begin
  loop
    v_pass := v_pass + 1; v_left := 0;
    for r in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'workspace_id' and c.table_name <> 'workspaces'
    loop
      begin
        execute format('delete from public.%I where workspace_id = $1', r.table_name) using p_workspace_id;
        get diagnostics n = row_count; v_deleted := v_deleted + n;
      exception when foreign_key_violation then
        v_left := v_left + 1;
      end;
    end loop;
    exit when v_left = 0 or v_pass >= 10;
  end loop;
  if v_left > 0 then raise exception 'purge_incomplete'; end if;
  delete from workspaces where id = p_workspace_id;
  return v_deleted;
end $$;

create or replace function public.run_privacy_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s privacy_retention_settings; v jsonb := '{}'; n int; w record;
begin
  select * into s from privacy_retention_settings where id = 1;
  if not p_dry_run and not coalesce(s.enabled, false) then
    raise exception 'retention_disabled' using errcode = '55000';
  end if;

  select count(*) into n from reservations
   where reservation_date < (now() - make_interval(months => s.reservation_guest_months))::date
     and (guest_name <> '—' or phone is not null or coalesce(notes, '') <> '');
  v := v || jsonb_build_object('reservations_anonymise', n);
  if not p_dry_run then
    update reservations set guest_name = '—', phone = null, notes = null
     where reservation_date < (now() - make_interval(months => s.reservation_guest_months))::date
       and (guest_name <> '—' or phone is not null or coalesce(notes, '') <> '');
  end if;

  select count(*) into n from chat_messages
   where created_at < now() - make_interval(months => s.chat_message_months) and deleted_at is null;
  v := v || jsonb_build_object('chat_messages_blank', n);
  if not p_dry_run then
    update chat_messages set body = '', attachment_path = null, attachment_meta = null, deleted_at = now()
     where created_at < now() - make_interval(months => s.chat_message_months) and deleted_at is null;
  end if;

  select count(*) into n from attendance_entries
   where work_date < (now() - make_interval(months => s.attendance_months))::date;
  v := v || jsonb_build_object('attendance_delete', n);
  if not p_dry_run then
    delete from attendance_entries where work_date < (now() - make_interval(months => s.attendance_months))::date;
  end if;

  select count(*) into n from notifications where created_at < now() - make_interval(months => s.notification_months);
  v := v || jsonb_build_object('notifications_delete', n);
  if not p_dry_run then
    delete from notifications where created_at < now() - make_interval(months => s.notification_months);
  end if;

  select count(*) into n from workspace_invites
   where coalesce(accepted_at, revoked_at, expires_at) < now() - make_interval(days => s.invite_days);
  v := v || jsonb_build_object('invites_delete', n);
  if not p_dry_run then
    delete from workspace_invites
     where coalesce(accepted_at, revoked_at, expires_at) < now() - make_interval(days => s.invite_days);
  end if;

  select count(*) into n from push_subscriptions
   where coalesce(disabled_at, last_seen_at, created_at) < now() - make_interval(days => s.push_stale_days);
  v := v || jsonb_build_object('push_subscriptions_delete', n);
  if not p_dry_run then
    delete from push_subscriptions
     where coalesce(disabled_at, last_seen_at, created_at) < now() - make_interval(days => s.push_stale_days);
  end if;

  select count(*) into n from workspaces where closed_at is not null and purge_after < now();
  v := v || jsonb_build_object('closed_venues_purge', n);
  if not p_dry_run then
    for w in select id from workspaces where closed_at is not null and purge_after < now() loop
      perform public.purge_workspace(w.id);
    end loop;
  end if;

  return v || jsonb_build_object('dry_run', p_dry_run, 'enabled', s.enabled);
end $$;

-- Scheduling is intentionally NOT done. After Platon approves the periods:
--   update public.privacy_retention_settings set enabled = true where id = 1;
--   select cron.schedule('privacy-retention-nightly', '30 2 * * *', 'select public.run_privacy_retention(false)');

-- ---------------------------------------------------------------- grants
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.export_workspace_data(uuid) from public, anon;
revoke all on function public.close_workspace_venue(uuid, text) from public, anon;
revoke all on function public.reopen_workspace_venue(uuid) from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
revoke all on function public.purge_workspace(uuid) from public, anon, authenticated;
revoke all on function public.run_privacy_retention(boolean) from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.export_workspace_data(uuid) to authenticated;
grant execute on function public.close_workspace_venue(uuid, text) to authenticated;
grant execute on function public.reopen_workspace_venue(uuid) to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.purge_workspace(uuid) to service_role;
grant execute on function public.run_privacy_retention(boolean) to service_role;
