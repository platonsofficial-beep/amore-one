-- Online guest reservations, step 2.
-- Do not apply from the app. Run in the Supabase SQL editor when an owner approves it.
-- Prerequisite: supabase/online_booking.sql is already applied
-- (workspace_online_booking, seating caps, reservations.source, confirm_token).
--
-- The guest page calls the anon RPCs below. It never reads staff or guest rows.
-- Emails are sent by the Vercel functions, not by the browser.
--
-- Env vars (set in Vercel, never in the client, never printed):
--   RESEND_API_KEY
--   ONLINE_BOOKING_FROM_EMAIL     verified sender, e.g. ONE <bookings@onehospitality.app>
--   SUPABASE_URL
--   SUPABASE_SERVICE_ROLE_KEY     server only
--   CRON_SECRET                   Vercel cron sends Authorization: Bearer <CRON_SECRET>
-- Schedule: GET /api/online-booking-reminders every 15 minutes.
-- Hobby Vercel rejects */15 (only one cron run per day), so it is not in vercel.json.
-- On Pro, add { "path": "/api/online-booking-reminders", "schedule": "*/15 * * * *" }
-- with Authorization: Bearer CRON_SECRET. A daily Hobby cron would miss the reminder window.
-- Also enable Realtime for public.reservations (this file adds it to supabase_realtime
-- when the publication exists) so the staff list refreshes when a guest books.

alter table public.reservations add column if not exists guest_email text not null default '';
alter table public.reservations add column if not exists online_area_id text not null default '';
alter table public.reservations add column if not exists guest_consent_at timestamptz;
alter table public.reservations add column if not exists booking_email_sent_at timestamptz;
alter table public.reservations add column if not exists email_reminder_sent_at timestamptz;

create table if not exists public.public_booking_throttle (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

alter table public.public_booking_throttle enable row level security;
create index if not exists public_booking_throttle_bucket_idx
  on public.public_booking_throttle (bucket, created_at desc);

-- No policies. Only the security-definer functions below write this table.

create or replace function public.public_booking_settings(p_slug text)
returns public.workspace_online_booking
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.workspace_online_booking
  where enabled = true
    and lower(slug) = lower(btrim(p_slug))
  limit 1;
$$;

revoke all on function public.public_booking_settings(text) from public, anon, authenticated;

create or replace function public.get_public_booking_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.workspace_online_booking;
  v_name text := '';
  v_logo text := '';
  v_tz text := 'UTC';
  v_country text := '';
  v_dial text := '';
  v_layout jsonb := '{}'::jsonb;
  v_areas jsonb := '[]'::jsonb;
  v_seatings jsonb := '[]'::jsonb;
begin
  v := public.public_booking_settings(p_slug);
  if v is null or v.workspace_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select name into v_name from public.workspaces where id = v.workspace_id;

  begin
    select
      coalesce(nullif(btrim(business_name), ''), v_name),
      coalesce(logo_url, ''),
      coalesce(nullif(btrim(timezone), ''), 'UTC'),
      coalesce(country_code, ''),
      coalesce(default_phone_country_code, '')
    into v_name, v_logo, v_tz, v_country, v_dial
    from public.workspace_profiles
    where workspace_id = v.workspace_id
    order by updated_at desc
    limit 1;
  exception when undefined_column or undefined_table then
    null;
  end;

  select layout_json into v_layout
  from public.floor_plans
  where workspace_id = v.workspace_id and is_active = true
  order by updated_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', floor->>'id',
    'label', coalesce(nullif(floor->>'label', ''), floor->>'id'),
    'smoking', coalesce((floor->>'smoking')::boolean, false),
    'onlineBookingVisible', true
  )), '[]'::jsonb)
  into v_areas
  from jsonb_array_elements(coalesce(v_layout->'floors', '[]'::jsonb)) floor
  where coalesce((floor->>'onlineBookingVisible')::boolean, false)
    and coalesce(floor->>'id', '') <> '';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'startTime', s.start_time,
    'durationMinutes', s.duration_minutes,
    'daysOfWeek', to_jsonb(s.days_of_week),
    'isActive', s.is_active,
    'onlineCapacity', s.online_capacity,
    'onlineAreaCaps', coalesce(s.online_area_caps, '{}'::jsonb)
  ) order by s.sort_order, s.name), '[]'::jsonb)
  into v_seatings
  from public.reservation_seatings s
  where s.workspace_id = v.workspace_id and s.is_active = true;

  return jsonb_build_object(
    'ok', true,
    'venueName', coalesce(v_name, ''),
    'logoUrl', coalesce(v_logo, ''),
    'timeZone', coalesce(v_tz, 'UTC'),
    'countryCode', coalesce(v_country, ''),
    'phoneCountryCode', coalesce(v_dial, ''),
    'venuePhone', coalesce(v.venue_phone, ''),
    'confirmationMethod', v.confirmation_method,
    'emailConfirmHours', v.email_confirm_hours,
    'maxPartySize', v.max_party_size,
    'bookingWindowDays', v.booking_window_days,
    'minNoticeMinutes', v.min_notice_minutes,
    'areas', v_areas,
    'seatings', v_seatings
  );
end;
$$;

create or replace function public.get_public_availability(
  p_slug text,
  p_date date,
  p_party integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.workspace_online_booking;
  v_tz text := 'UTC';
  v_today date;
  v_dow int;
  v_layout jsonb := '{}'::jsonb;
  v_times jsonb := '[]'::jsonb;
begin
  v := public.public_booking_settings(p_slug);
  if v is null or v.workspace_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  if p_party is null or p_party < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_party > v.max_party_size then
    return jsonb_build_object('ok', false, 'reason', 'call_us', 'venuePhone', coalesce(v.venue_phone, ''));
  end if;

  begin
    select coalesce(nullif(btrim(timezone), ''), 'UTC') into v_tz
    from public.workspace_profiles
    where workspace_id = v.workspace_id
    order by updated_at desc
    limit 1;
  exception when undefined_column or undefined_table then
    v_tz := 'UTC';
  end;

  v_today := (now() at time zone v_tz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + v.booking_window_days then
    return jsonb_build_object('ok', false, 'reason', 'date');
  end if;
  v_dow := extract(dow from p_date)::int;

  select layout_json into v_layout
  from public.floor_plans
  where workspace_id = v.workspace_id and is_active = true
  order by updated_at desc
  limit 1;

  select coalesce(jsonb_agg(slot order by slot->>'time'), '[]'::jsonb)
  into v_times
  from (
    select jsonb_build_object(
      'seatingId', s.id,
      'name', s.name,
      'time', s.start_time,
      'areas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', floor->>'id',
          'label', coalesce(nullif(floor->>'label', ''), floor->>'id'),
          'smoking', coalesce((floor->>'smoking')::boolean, false)
        )), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_layout->'floors', '[]'::jsonb)) floor
        where coalesce((floor->>'onlineBookingVisible')::boolean, false)
          and coalesce(floor->>'id', '') <> ''
          and (
            nullif(s.online_area_caps->> (floor->>'id'), '') is null
            or (
              select coalesce(sum(r.party_size), 0)
              from public.reservations r
              where r.workspace_id = v.workspace_id
                and r.source = 'online'
                and r.seating_id = s.id
                and r.reservation_date = p_date
                and r.online_area_id = floor->>'id'
                and r.status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show')
            ) + p_party <= (s.online_area_caps->> (floor->>'id'))::int
          )
      )
    ) as slot
    from public.reservation_seatings s
    where s.workspace_id = v.workspace_id
      and s.is_active
      and v_dow = any (s.days_of_week)
      and (p_date::timestamp + s.start_time::time) at time zone v_tz
          >= now() + make_interval(mins => v.min_notice_minutes)
      and (
        s.online_capacity is null
        or (
          select coalesce(sum(r.party_size), 0)
          from public.reservations r
          where r.workspace_id = v.workspace_id
            and r.source = 'online'
            and r.seating_id = s.id
            and r.reservation_date = p_date
            and r.status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show')
        ) + p_party <= s.online_capacity
      )
  ) open_slots
  where jsonb_array_length(slot->'areas') > 0;

  return jsonb_build_object('ok', true, 'times', v_times);
end;
$$;

create or replace function public.create_public_reservation(
  p_slug text,
  p_date date,
  p_party integer,
  p_seating_id uuid,
  p_area_id text,
  p_name text,
  p_phone text,
  p_email text,
  p_note text,
  p_consent boolean,
  p_honeypot text,
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.workspace_online_booking;
  v_phone text;
  v_email text;
  v_name text;
  v_note text;
  v_area text;
  v_area_label text := '';
  v_smoking boolean := false;
  v_time text;
  v_cap integer;
  v_area_cap integer;
  v_used integer;
  v_area_used integer;
  v_layout jsonb;
  v_tz text := 'UTC';
  v_today date;
  v_id uuid;
  v_token text := null;
  v_status text;
  v_venue text := '';
  v_ip text := '';
  u uuid;
begin
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  v := public.public_booking_settings(p_slug);
  if v is null or v.workspace_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  if p_consent is not true then
    return jsonb_build_object('ok', false, 'reason', 'consent');
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_email := btrim(coalesce(p_email, ''));
  v_note := left(btrim(coalesce(p_note, '')), 500);
  v_area := btrim(coalesce(p_area_id, ''));

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'name');
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'phone');
  end if;
  if v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'email');
  end if;
  if v.confirmation_method = 'email' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'email');
  end if;
  if p_party is null or p_party < 1 or p_party > v.max_party_size then
    return jsonb_build_object('ok', false, 'reason', 'call_us', 'venuePhone', coalesce(v.venue_phone, ''));
  end if;

  begin
    select coalesce(nullif(btrim(timezone), ''), 'UTC'),
      coalesce(nullif(btrim(business_name), ''), '')
    into v_tz, v_venue
    from public.workspace_profiles where workspace_id = v.workspace_id
    order by updated_at desc limit 1;
  exception when undefined_column or undefined_table then
    v_tz := 'UTC';
  end;
  v_today := (now() at time zone v_tz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + v.booking_window_days then
    return jsonb_build_object('ok', false, 'reason', 'date');
  end if;

  if (
    select count(*) from public.public_booking_throttle
    where bucket = 'phone:' || md5(v_phone) and created_at > now() - interval '60 minutes'
  ) >= 3
  or (
    select count(*) from public.public_booking_throttle
    where bucket = 'venue:' || v.workspace_id::text and created_at > now() - interval '10 minutes'
  ) >= 30
  or (
    nullif(btrim(coalesce(p_client_key, '')), '') is not null
    and (
      select count(*) from public.public_booking_throttle
      where bucket = 'client:' || md5(left(btrim(p_client_key), 80))
        and created_at > now() - interval '60 minutes'
    ) >= 8
  ) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  begin
    v_ip := left(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), 80);
  exception when others then
    v_ip := '';
  end;
  if v_ip <> '' and (
    select count(*) from public.public_booking_throttle
    where bucket = 'ip:' || md5(split_part(v_ip, ',', 1))
      and created_at > now() - interval '60 minutes'
  ) >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  perform pg_advisory_xact_lock(hashtext('online-booking:' || v.workspace_id::text));

  select s.start_time, s.online_capacity,
    nullif(s.online_area_caps->>v_area, '')::int
  into v_time, v_cap, v_area_cap
  from public.reservation_seatings s
  where s.id = p_seating_id
    and s.workspace_id = v.workspace_id
    and s.is_active
    and extract(dow from p_date)::int = any (s.days_of_week)
    and (p_date::timestamp + s.start_time::time) at time zone v_tz
        >= now() + make_interval(mins => v.min_notice_minutes);

  if v_time is null then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  select layout_json into v_layout
  from public.floor_plans
  where workspace_id = v.workspace_id and is_active
  order by updated_at desc limit 1;

  select floor->>'label', coalesce((floor->>'smoking')::boolean, false)
  into v_area_label, v_smoking
  from jsonb_array_elements(coalesce(v_layout->'floors', '[]'::jsonb)) floor
  where floor->>'id' = v_area
    and coalesce((floor->>'onlineBookingVisible')::boolean, false)
  limit 1;

  if v_area_label is null then
    return jsonb_build_object('ok', false, 'reason', 'area');
  end if;

  select coalesce(sum(party_size), 0) into v_used
  from public.reservations
  where workspace_id = v.workspace_id
    and source = 'online'
    and seating_id = p_seating_id
    and reservation_date = p_date
    and status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  select coalesce(sum(party_size), 0) into v_area_used
  from public.reservations
  where workspace_id = v.workspace_id
    and source = 'online'
    and seating_id = p_seating_id
    and reservation_date = p_date
    and online_area_id = v_area
    and status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  if (v_cap is not null and v_used + p_party > v_cap)
    or (v_area_cap is not null and v_area_used + p_party > v_area_cap) then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  v_status := case when v.confirmation_method = 'instant' then 'Confirmed' else 'Pending' end;
  if v.confirmation_method = 'email' then
    v_token := encode(gen_random_bytes(24), 'hex');
  end if;

  insert into public.reservations (
    workspace_id, guest_name, phone, guest_email, reservation_date, reservation_time,
    party_size, guests, area, online_area_id, status, notes, seating_id,
    source, confirmation_method, confirm_token, confirm_token_expires_at, email_confirm_hours,
    guest_consent_at
  ) values (
    v.workspace_id, v_name, v_phone, v_email, p_date, v_time,
    p_party, p_party, v_area_label, v_area, v_status, v_note, p_seating_id,
    'online', v.confirmation_method, v_token,
    case when v_token is null then null else (p_date::timestamp + v_time::time) at time zone v_tz end,
    case when v.confirmation_method = 'email' then v.email_confirm_hours else null end,
    now()
  )
  returning id into v_id;

  insert into public.public_booking_throttle (bucket) values
    ('phone:' || md5(v_phone)),
    ('venue:' || v.workspace_id::text);
  if nullif(btrim(coalesce(p_client_key, '')), '') is not null then
    insert into public.public_booking_throttle (bucket)
    values ('client:' || md5(left(btrim(p_client_key), 80)));
  end if;
  if v_ip <> '' then
    insert into public.public_booking_throttle (bucket)
    values ('ip:' || md5(split_part(v_ip, ',', 1)));
  end if;

  begin
    for u in
      select * from public.notify_operations_recipients(v.workspace_id, 'managers', true)
      union
      select * from public.notify_operations_recipients(v.workspace_id, 'service', false)
    loop
      perform public.notify_enqueue(
        v.workspace_id, u, 'online_reservation',
        'Online reservation',
        v_name || ' · ' || p_party || ' · ' || v_time,
        '/',
        jsonb_build_object('view', 'reservations', 'reservation_id', v_id),
        'ob:' || v_id::text || ':' || u::text
      );
    end loop;
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', v_status,
    'confirmationMethod', v.confirmation_method,
    'confirmToken', v_token,
    'date', p_date,
    'time', v_time,
    'party', p_party,
    'areaLabel', v_area_label,
    'smoking', v_smoking,
    'venueName', coalesce(nullif(v_venue, ''), (select name from public.workspaces where id = v.workspace_id), '')
  );
exception when undefined_column then
  return jsonb_build_object('ok', false, 'reason', 'unavailable');
end;
$$;

create or replace function public.confirm_public_reservation(
  p_slug text,
  p_token text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.workspace_online_booking;
  r public.reservations;
  v_next text;
begin
  v := public.public_booking_settings(p_slug);
  if v is null or v.workspace_id is null or nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into r
  from public.reservations
  where workspace_id = v.workspace_id
    and confirm_token = btrim(p_token)
    and source = 'online'
  limit 1;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if r.status in ('Confirmed', 'Cancelled') then
    return jsonb_build_object('ok', true, 'status', r.status, 'guestName', r.guest_name,
      'date', r.reservation_date, 'time', r.reservation_time, 'party', r.party_size, 'areaLabel', r.area);
  end if;

  if r.confirm_token_expires_at is not null and r.confirm_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if r.status not in ('Pending', 'Not Confirmed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_next := case when p_action = 'cancel' then 'Cancelled' else 'Confirmed' end;
  update public.reservations set status = v_next where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'status', v_next,
    'guestName', r.guest_name,
    'date', r.reservation_date,
    'time', r.reservation_time,
    'party', r.party_size,
    'areaLabel', r.area
  );
end;
$$;

-- Service role only. The reminder cron claims rows, sends mail, and releases on failure.
create or replace function public.claim_public_booking_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  with due as (
    select r.id
    from public.reservations r
    join public.workspace_online_booking b on b.workspace_id = r.workspace_id
    where r.source = 'online'
      and r.confirmation_method = 'email'
      and r.status = 'Pending'
      and r.email_reminder_sent_at is null
      and r.confirm_token is not null
      and r.guest_email <> ''
      and b.enabled
      and (r.reservation_date::timestamp + r.reservation_time::time)
          at time zone coalesce((
            select nullif(btrim(p.timezone), '')
            from public.workspace_profiles p
            where p.workspace_id = r.workspace_id
            order by p.updated_at desc
            limit 1
          ), 'UTC')
          - make_interval(hours => coalesce(r.email_confirm_hours, b.email_confirm_hours))
          <= now()
      and (r.reservation_date::timestamp + r.reservation_time::time)
          at time zone coalesce((
            select nullif(btrim(p.timezone), '')
            from public.workspace_profiles p
            where p.workspace_id = r.workspace_id
            order by p.updated_at desc
            limit 1
          ), 'UTC')
          > now()
    for update of r skip locked
    limit 25
  ), marked as (
    update public.reservations r
    set email_reminder_sent_at = now()
    from due
    where r.id = due.id
    returning r.id, r.guest_email, r.guest_name, r.confirm_token, r.reservation_date,
      r.reservation_time, r.party_size, r.area, r.workspace_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'email', m.guest_email,
    'guestName', m.guest_name,
    'token', m.confirm_token,
    'date', m.reservation_date,
    'time', m.reservation_time,
    'party', m.party_size,
    'areaLabel', m.area,
    'slug', b.slug,
    'venueName', coalesce((
      select coalesce(nullif(btrim(p.business_name), ''), w.name)
      from public.workspaces w
      left join public.workspace_profiles p on p.workspace_id = w.id
      where w.id = m.workspace_id
      limit 1
    ), ''),
    'smoking', false
  )), '[]'::jsonb)
  into v_rows
  from marked m
  join public.workspace_online_booking b on b.workspace_id = m.workspace_id;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function public.release_public_booking_reminder(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reservations
  set email_reminder_sent_at = null
  where id = p_id and source = 'online' and confirmation_method = 'email';
$$;

create or replace function public.public_booking_email_payload(p_id uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.reservations;
  v_slug text;
  v_venue text := '';
begin
  select * into r
  from public.reservations
  where id = p_id and confirm_token = btrim(coalesce(p_token, '')) and source = 'online';
  if r.id is null or r.guest_email = '' then
    return jsonb_build_object('ok', false);
  end if;
  if r.booking_email_sent_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'sent');
  end if;
  select slug into v_slug from public.workspace_online_booking where workspace_id = r.workspace_id;
  select coalesce(nullif(btrim(p.business_name), ''), w.name, '')
  into v_venue
  from public.workspaces w
  left join public.workspace_profiles p on p.workspace_id = w.id
  where w.id = r.workspace_id
  limit 1;
  return jsonb_build_object(
    'ok', true,
    'id', r.id,
    'email', r.guest_email,
    'guestName', r.guest_name,
    'date', r.reservation_date,
    'time', r.reservation_time,
    'party', r.party_size,
    'areaLabel', r.area,
    'slug', v_slug,
    'venueName', v_venue,
    'confirmationMethod', r.confirmation_method,
    'token', r.confirm_token,
    'status', r.status
  );
end;
$$;

create or replace function public.mark_public_booking_email_sent(p_id uuid, p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reservations
  set booking_email_sent_at = now()
  where id = p_id and confirm_token = btrim(coalesce(p_token, '')) and source = 'online';
$$;

revoke all on function public.get_public_booking_info(text) from public;
revoke all on function public.get_public_availability(text, date, integer) from public;
revoke all on function public.create_public_reservation(text, date, integer, uuid, text, text, text, text, text, boolean, text, text) from public;
revoke all on function public.confirm_public_reservation(text, text, text) from public;
revoke all on function public.claim_public_booking_reminders() from public;
revoke all on function public.release_public_booking_reminder(uuid) from public;
revoke all on function public.public_booking_email_payload(uuid, text) from public;
revoke all on function public.mark_public_booking_email_sent(uuid, text) from public;

grant execute on function public.get_public_booking_info(text) to anon, authenticated;
grant execute on function public.get_public_availability(text, date, integer) to anon, authenticated;
grant execute on function public.create_public_reservation(text, date, integer, uuid, text, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.confirm_public_reservation(text, text, text) to anon, authenticated;
grant execute on function public.claim_public_booking_reminders() to service_role;
grant execute on function public.release_public_booking_reminder(uuid) to service_role;
grant execute on function public.public_booking_email_payload(uuid, text) to service_role;
grant execute on function public.mark_public_booking_email_sent(uuid, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservations'
    ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;
