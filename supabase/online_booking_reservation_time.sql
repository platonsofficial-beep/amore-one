-- Production patch for public online booking. Do not apply from the app.
-- Not applied in this change. Run it on the database when you are ready.
--
-- Cause: create_public_reservation inserted reservation_time as text into a
-- time column (Postgres 42804). The error reached the guest as
-- "Online reservations are not available right now."
-- An arrival at the seating's closing time is also rejected.

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
  p_client_key text,
  p_arrival text,
  p_understand boolean,
  p_locale text
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
  v_arrival time;
  v_assigned public.reservation_seatings;
  v_end text;
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
  v_day_used integer := 0;
  v_locale text := 'en';
  v_start text := '';
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
  if p_understand is not true then
    return jsonb_build_object('ok', false, 'reason', 'understand');
  end if;
  v_locale := case when btrim(coalesce(p_locale, '')) = 'el' then 'el' else 'en' end;

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

  begin
    v_arrival := btrim(coalesce(p_arrival, ''))::time;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end;
  v_time := to_char(v_arrival, 'HH24:MI');
  if (p_date::timestamp + v_arrival) at time zone v_tz
      < now() + make_interval(mins => v.min_notice_minutes) then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end if;

  v_assigned := public.assign_public_seating(v.workspace_id, p_date, v_arrival);
  if v_assigned.id is null
     or v_arrival < v_assigned.start_time::time
     or v_arrival >= v_assigned.start_time::time + make_interval(mins => v_assigned.duration_minutes) then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end if;
  v_cap := v_assigned.online_capacity;
  v_area_cap := nullif(v_assigned.online_area_caps->>v_area, '')::int;
  v_start := to_char(v_assigned.start_time::time, 'HH24:MI');
  v_end := to_char(v_assigned.start_time::time + make_interval(mins => v_assigned.duration_minutes), 'HH24:MI');

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
    and seating_id = v_assigned.id
    and reservation_date = p_date
    and status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  select coalesce(sum(party_size), 0) into v_area_used
  from public.reservations
  where workspace_id = v.workspace_id
    and source = 'online'
    and seating_id = v_assigned.id
    and reservation_date = p_date
    and online_area_id = v_area
    and status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  select coalesce(sum(party_size), 0) into v_day_used
  from public.reservations
  where workspace_id = v.workspace_id
    and source = 'online'
    and reservation_date = p_date
    and status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  if (v_cap is not null and v_used + p_party > v_cap)
    or (v.daily_online_covers is not null and v_day_used + p_party > v.daily_online_covers)
    or (v_area_cap is not null and v_area_used + p_party > v_area_cap) then
    return jsonb_build_object('ok', false, 'reason', 'full', 'seatingId', v_assigned.id);
  end if;

  v_status := case when v.confirmation_method = 'instant' then 'Confirmed' else 'Pending' end;
  if v.confirmation_method = 'email' then
    v_token := encode(gen_random_bytes(24), 'hex');
  end if;

  insert into public.reservations (
    workspace_id, guest_name, phone, guest_email, reservation_date, reservation_time,
    party_size, guests, area, online_area_id, status, notes, seating_id,
    source, confirmation_method, confirm_token, confirm_token_expires_at, email_confirm_hours,
    guest_consent_at, guest_locale
  ) values (
    v.workspace_id, v_name, v_phone, v_email, p_date, v_arrival,
    p_party, p_party, v_area_label, v_area, v_status, v_note, v_assigned.id,
    'online', v.confirmation_method, v_token,
    case when v_token is null then null else (p_date::timestamp + v_time::time) at time zone v_tz end,
    case when v.confirmation_method = 'email' then v.email_confirm_hours else null end,
    now(), v_locale
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
    'seatingId', v_assigned.id,
    'seatingName', v_assigned.name,
    'startTime', v_start,
    'endTime', v_end,
    'locale', v_locale,
    'party', p_party,
    'areaLabel', v_area_label,
    'smoking', v_smoking,
    'venueName', coalesce(nullif(v_venue, ''), (select name from public.workspaces where id = v.workspace_id), '')
  );
exception when undefined_column then
  return jsonb_build_object('ok', false, 'reason', 'unavailable');
end;
$$;
