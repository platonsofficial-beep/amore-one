-- Adds shift_template_id to weekly template shifts for grid integrity.
-- Run in Supabase SQL editor if the column is not present yet.

alter table if exists public.weekly_schedule_template_shifts
  add column if not exists shift_template_id uuid null;
