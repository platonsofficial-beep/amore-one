-- Venue location fields for workspace profile (idempotent).
alter table if exists public.workspace_profiles
  add column if not exists country_code text not null default '',
  add column if not exists country_name text not null default '',
  add column if not exists city text not null default '',
  add column if not exists default_phone_country_code text not null default '';

comment on column public.workspace_profiles.country_code is 'ISO 3166-1 alpha-2 venue country, e.g. CY';
comment on column public.workspace_profiles.country_name is 'Venue country display name, e.g. Cyprus';
comment on column public.workspace_profiles.city is 'Venue city, e.g. Nicosia';
comment on column public.workspace_profiles.default_phone_country_code is 'Optional E.164 dial prefix override, e.g. +357';
