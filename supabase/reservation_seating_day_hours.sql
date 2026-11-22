-- NOT APPLIED. Platon must approve this file separately before it runs.
-- Adds per-weekday seating hours and last-arrival time.
-- Existing rows keep their current start, duration, and open days until a seating is saved with day hours.
-- Last arrival left blank means 30 minutes before the end of that day, same as today.

alter table public.reservation_seatings
  add column if not exists day_hours jsonb;

create or replace function public.seating_day_bounds(
  p_start text,
  p_duration integer,
  p_days integer[],
  p_hours jsonb,
  p_dow integer
)
returns table(is_open boolean, start_at time, end_at time, last_arrival time)
language plpgsql
stable
as $$
declare
  legacy_start time;
  legacy_end time;
  spec jsonb;
  start_txt text;
  end_txt text;
  last_txt text;
begin
  legacy_start := coalesce(nullif(btrim(coalesce(p_start, '')), '')::time, time '19:00');
  legacy_end := (legacy_start + make_interval(mins => greatest(15, least(coalesce(p_duration, 120), 480))))::time;
  spec := case when p_hours is null then null else p_hours -> p_dow::text end;
  if spec is null then
    is_open := p_dow = any (coalesce(p_days, array[0, 1, 2, 3, 4, 5, 6]));
    start_at := legacy_start;
    end_at := legacy_end;
    last_arrival := case
      when (legacy_end - interval '30 minutes')::time < legacy_start then legacy_start
      else (legacy_end - interval '30 minutes')::time
    end;
    return next;
    return;
  end if;
  start_txt := nullif(btrim(coalesce(spec->>'start', '')), '');
  end_txt := nullif(btrim(coalesce(spec->>'end', '')), '');
  last_txt := nullif(btrim(coalesce(spec->>'lastArrival', '')), '');
  start_at := coalesce(start_txt::time, legacy_start);
  end_at := coalesce(end_txt::time, legacy_end);
  if end_at <= start_at then
    end_at := (start_at + interval '15 minutes')::time;
  end if;
  if last_txt is null then
    last_arrival := case
      when (end_at - interval '30 minutes')::time < start_at then start_at
      else (end_at - interval '30 minutes')::time
    end;
  else
    last_arrival := last_txt::time;
    if last_arrival < start_at then last_arrival := start_at; end if;
    if last_arrival > end_at then last_arrival := end_at; end if;
  end if;
  is_open := coalesce((spec->>'open')::boolean, true);
  return next;
end;
$$;

-- Arrivals run from the day's start through its last arrival.
create or replace function public.assign_public_seating(
  p_workspace uuid,
  p_date date,
  p_arrival time
)
returns public.reservation_seatings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  chosen public.reservation_seatings;
begin
  select s.* into chosen
  from public.reservation_seatings s
  cross join lateral public.seating_day_bounds(
    s.start_time, s.duration_minutes, s.days_of_week, s.day_hours, extract(dow from p_date)::int
  ) b
  where s.workspace_id = p_workspace
    and s.is_active
    and b.is_open
    and p_arrival >= b.start_at
    and p_arrival <= b.last_arrival
  order by b.start_at, s.sort_order
  limit 1;
  return chosen;
end;
$$;

revoke all on function public.assign_public_seating(uuid, date, time) from public, anon, authenticated;

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
  v_seatings jsonb := '[]'::jsonb;
  v_day_used integer := 0;
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

  select coalesce(sum(r.party_size), 0) into v_day_used
  from public.reservations r
  where r.workspace_id = v.workspace_id
    and r.source = 'online'
    and r.reservation_date = p_date
    and r.status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show');

  select layout_json into v_layout
  from public.floor_plans
  where workspace_id = v.workspace_id and is_active = true
  order by updated_at desc
  limit 1;

  select coalesce(jsonb_agg(card order by card->>'startTime'), '[]'::jsonb)
  into v_seatings
  from (
    select jsonb_build_object(
      'seatingId', s.id,
      'id', s.id,
      'name', s.name,
      'startTime', to_char(b.start_at, 'HH24:MI'),
      'endTime', to_char(b.end_at, 'HH24:MI'),
      'lastArrival', to_char(b.last_arrival, 'HH24:MI'),
      'durationMinutes', s.duration_minutes,
      'isActive', true,
      'state', case
        when (
          v.daily_online_covers is not null
          and v.daily_online_covers - v_day_used < p_party
        ) or (
          s.online_capacity is not null
          and s.online_capacity - (
            select coalesce(sum(r.party_size), 0)
            from public.reservations r
            where r.workspace_id = v.workspace_id
              and r.source = 'online'
              and r.seating_id = s.id
              and r.reservation_date = p_date
              and r.status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show')
          ) < p_party
        ) then 'full'
        when (
          v.daily_online_covers is not null
          and v.daily_online_covers - v_day_used <= greatest(p_party, ceil(v.daily_online_covers * 0.25))
        ) or (
          s.online_capacity is not null
          and s.online_capacity - (
            select coalesce(sum(r.party_size), 0)
            from public.reservations r
            where r.workspace_id = v.workspace_id
              and r.source = 'online'
              and r.seating_id = s.id
              and r.reservation_date = p_date
              and r.status not in ('Cancelled', 'Not Shown', 'Rejected', 'No Show')
          ) <= greatest(p_party, ceil(s.online_capacity * 0.25))
        ) then 'few'
        else 'available'
      end,
      'slots', (
        select coalesce(jsonb_agg(to_char(timed.slot, 'HH24:MI') order by timed.slot), '[]'::jsonb)
        from generate_series(0, greatest((extract(epoch from (b.last_arrival - b.start_at)) / 60)::int, 0) / 15) as step
        cross join lateral (
          select (b.start_at + make_interval(mins => step * 15))::time as slot
        ) timed
        where timed.slot <= b.last_arrival
          and (p_date::timestamp + timed.slot) at time zone v_tz
            >= now() + make_interval(mins => v.min_notice_minutes)
      ),
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
    ) as card
    from public.reservation_seatings s
    cross join lateral public.seating_day_bounds(
      s.start_time, s.duration_minutes, s.days_of_week, s.day_hours, v_dow
    ) b
    where s.workspace_id = v.workspace_id
      and s.is_active
      and b.is_open
  ) day_seatings;

  return jsonb_build_object('ok', true, 'seatings', v_seatings);
end;
$$;

drop function if exists public.create_public_reservation(text, date, integer, uuid, text, text, text, text, text, boolean, text, text);
drop function if exists public.create_public_reservation(text, date, integer, uuid, text, text, text, text, text, boolean, text, text, text);
drop function if exists public.create_public_reservation(text, date, integer, uuid, text, text, text, text, text, boolean, text, text, text, boolean);

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
  v_day_open boolean := false;
  v_day_start time;
  v_day_end time;
  v_day_last time;
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
  if v_assigned.id is null then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end if;
  select b.is_open, b.start_at, b.end_at, b.last_arrival
    into v_day_open, v_day_start, v_day_end, v_day_last
  from public.seating_day_bounds(
    v_assigned.start_time, v_assigned.duration_minutes, v_assigned.days_of_week, v_assigned.day_hours,
    extract(dow from p_date)::int
  ) b;
  if v_day_open is not true or v_arrival < v_day_start or v_arrival > v_day_last then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end if;
  v_cap := v_assigned.online_capacity;
  v_area_cap := nullif(v_assigned.online_area_caps->>v_area, '')::int;
  v_start := to_char(v_day_start, 'HH24:MI');
  v_end := to_char(v_day_end, 'HH24:MI');

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
    'onlineAreaCaps', coalesce(s.online_area_caps, '{}'::jsonb),
    'dayHours', coalesce(s.day_hours, '{}'::jsonb)
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
    'dailyOnlineCovers', v.daily_online_covers,
    'areas', v_areas,
    'seatings', v_seatings
  );
end;
$$;
