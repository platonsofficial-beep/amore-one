-- Venue GPS coordinates for guest directions.
-- Not applied. Do not run this from the app. Apply it in the Supabase SQL editor
-- only after review.
--
-- Additive on the live definitions after supabase/venue_contact_details.sql:
--   get_public_booking_info(text)
--   public_booking_email_payload(uuid, text)
--   claim_public_booking_reminders()
-- Coordinates win for mapsUrl. Otherwise the link is built from the address and city.
-- An empty address and no coordinates leave mapsUrl null.

alter table public.workspace_profiles
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision;

comment on column public.workspace_profiles.venue_lat is 'Optional venue latitude from the device location.';
comment on column public.workspace_profiles.venue_lng is 'Optional venue longitude from the device location.';

grant select (venue_lat, venue_lng)
  on table public.workspace_profiles to authenticated;
grant insert (venue_lat, venue_lng)
  on table public.workspace_profiles to authenticated;
grant update (venue_lat, venue_lng)
  on table public.workspace_profiles to authenticated;

create or replace function public.get_public_booking_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v public.workspace_online_booking;
  v_name text := '';
  v_logo text := '';
  v_tz text := 'UTC';
  v_country text := '';
  v_dial text := '';
  v_city text := '';
  v_country_name text := '';
  v_profile_phone text := '';
  v_address text := '';
  v_email text := '';
  v_lat double precision := null;
  v_lng double precision := null;
  v_maps text := null;
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
      coalesce(default_phone_country_code, ''),
      coalesce(city, ''),
      coalesce(country_name, ''),
      coalesce(venue_phone, ''),
      coalesce(venue_address, ''),
      coalesce(contact_email, ''),
      venue_lat,
      venue_lng
    into v_name, v_logo, v_tz, v_country, v_dial, v_city, v_country_name, v_profile_phone, v_address, v_email, v_lat, v_lng
    from public.workspace_profiles
    where workspace_id = v.workspace_id
    order by updated_at desc
    limit 1;
  exception when undefined_column or undefined_table then
    null;
  end;

  if v_lat is not null and v_lng is not null then
    v_maps := 'https://www.google.com/maps/search/?api=1&query='
      || rtrim(rtrim(round(v_lat::numeric, 6)::text, '0'), '.')
      || ','
      || rtrim(rtrim(round(v_lng::numeric, 6)::text, '0'), '.');
  elsif nullif(btrim(v_address), '') is not null then
    v_maps := 'https://www.google.com/maps/search/?api=1&query='
      || replace(replace(replace(replace(
           concat_ws(', ', nullif(btrim(v_address), ''), nullif(btrim(v_city), '')),
         ' ', '%20'), ',', '%2C'), '&', '%26'), '#', '%23');
  else
    v_maps := null;
  end if;

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
    'venuePhone', coalesce(nullif(btrim(v_profile_phone), ''), v.venue_phone, ''),
    'venueAddress', coalesce(v_address, ''),
    'contactEmail', coalesce(v_email, ''),
    'city', coalesce(v_city, ''),
    'countryName', coalesce(v_country_name, ''),
    'venueLat', v_lat,
    'venueLng', v_lng,
    'mapsUrl', v_maps,
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
$function$;

create or replace function public.public_booking_email_payload(p_id uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r public.reservations;
  v_slug text;
  v_venue text := '';
  v_start text := '';
  v_end text := '';
  v_seating text := '';
  v_phone text := '';
  v_address text := '';
  v_email text := '';
  v_city text := '';
  v_country text := '';
  v_lat double precision := null;
  v_lng double precision := null;
  v_maps text := null;
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
  select
    coalesce(nullif(btrim(p.business_name), ''), w.name, ''),
    coalesce(nullif(btrim(p.venue_phone), ''), b.venue_phone, ''),
    coalesce(p.venue_address, ''),
    coalesce(p.contact_email, ''),
    coalesce(p.city, ''),
    coalesce(p.country_name, ''),
    p.venue_lat,
    p.venue_lng
  into v_venue, v_phone, v_address, v_email, v_city, v_country, v_lat, v_lng
  from public.workspaces w
  left join public.workspace_profiles p on p.workspace_id = w.id
  left join public.workspace_online_booking b on b.workspace_id = w.id
  where w.id = r.workspace_id
  limit 1;
  select
    coalesce(s.name, ''),
    to_char(s.start_time::time, 'HH24:MI'),
    to_char(s.start_time::time + make_interval(mins => s.duration_minutes), 'HH24:MI')
  into v_seating, v_start, v_end
  from public.reservation_seatings s
  where s.id = r.seating_id;

  if v_lat is not null and v_lng is not null then
    v_maps := 'https://www.google.com/maps/search/?api=1&query='
      || rtrim(rtrim(round(v_lat::numeric, 6)::text, '0'), '.')
      || ','
      || rtrim(rtrim(round(v_lng::numeric, 6)::text, '0'), '.');
  elsif nullif(btrim(v_address), '') is not null then
    v_maps := 'https://www.google.com/maps/search/?api=1&query='
      || replace(replace(replace(replace(
           concat_ws(', ', nullif(btrim(v_address), ''), nullif(btrim(v_city), '')),
         ' ', '%20'), ',', '%2C'), '&', '%26'), '#', '%23');
  else
    v_maps := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', r.id,
    'email', r.guest_email,
    'guestName', r.guest_name,
    'date', r.reservation_date,
    'time', r.reservation_time,
    'party', r.party_size,
    'areaLabel', r.area,
    'locale', case when r.guest_locale = 'el' then 'el' else 'en' end,
    'seatingName', v_seating,
    'startTime', v_start,
    'endTime', v_end,
    'slug', v_slug,
    'venueName', v_venue,
    'venuePhone', coalesce(v_phone, ''),
    'venueAddress', coalesce(v_address, ''),
    'contactEmail', coalesce(v_email, ''),
    'city', coalesce(v_city, ''),
    'countryName', coalesce(v_country, ''),
    'venueLat', v_lat,
    'venueLng', v_lng,
    'mapsUrl', v_maps,
    'confirmationMethod', r.confirmation_method,
    'token', r.confirm_token,
    'status', r.status
  );
end;
$function$;

create or replace function public.claim_public_booking_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      r.reservation_time, r.party_size, r.area, r.workspace_id, r.seating_id, r.guest_locale
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
    'locale', case when m.guest_locale = 'el' then 'el' else 'en' end,
    'seatingName', coalesce(s.name, ''),
    'startTime', to_char(s.start_time::time, 'HH24:MI'),
    'endTime', to_char(s.start_time::time + make_interval(mins => s.duration_minutes), 'HH24:MI'),
    'slug', b.slug,
    'venueName', coalesce((
      select coalesce(nullif(btrim(p.business_name), ''), w.name)
      from public.workspaces w
      left join public.workspace_profiles p on p.workspace_id = w.id
      where w.id = m.workspace_id
      limit 1
    ), ''),
    'venuePhone', coalesce(
      nullif(btrim((
        select p.venue_phone
        from public.workspace_profiles p
        where p.workspace_id = m.workspace_id
        order by p.updated_at desc
        limit 1
      )), ''),
      nullif(btrim(b.venue_phone), ''),
      ''
    ),
    'venueAddress', coalesce((
      select nullif(btrim(p.venue_address), '')
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ), ''),
    'contactEmail', coalesce((
      select nullif(btrim(p.contact_email), '')
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ), ''),
    'city', coalesce((
      select nullif(btrim(p.city), '')
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ), ''),
    'countryName', coalesce((
      select nullif(btrim(p.country_name), '')
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ), ''),

    'venueLat', (
      select p.venue_lat
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ),
    'venueLng', (
      select p.venue_lng
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ),
    'mapsUrl', (
      select case
        when p.venue_lat is not null and p.venue_lng is not null then
          'https://www.google.com/maps/search/?api=1&query='
            || rtrim(rtrim(round(p.venue_lat::numeric, 6)::text, '0'), '.')
            || ','
            || rtrim(rtrim(round(p.venue_lng::numeric, 6)::text, '0'), '.')
        when nullif(btrim(p.venue_address), '') is not null then
          'https://www.google.com/maps/search/?api=1&query='
            || replace(replace(replace(replace(
                 concat_ws(', ', nullif(btrim(p.venue_address), ''), nullif(btrim(p.city), '')),
               ' ', '%20'), ',', '%2C'), '&', '%26'), '#', '%23')
        else null
      end
      from public.workspace_profiles p
      where p.workspace_id = m.workspace_id
      order by p.updated_at desc
      limit 1
    ),
    'smoking', false
  )), '[]'::jsonb)
  into v_rows
  from marked m
  join public.workspace_online_booking b on b.workspace_id = m.workspace_id
  left join public.reservation_seatings s on s.id = m.seating_id;

  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;
