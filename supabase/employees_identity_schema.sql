-- Employee personal identity color persistence (palette ID only).
-- Prerequisite: public.employees must exist (employees_schema.sql).
-- Run in the Supabase SQL editor after employees_schema.sql.
-- Safe to re-run: column, CHECK, and index creation are idempotent.
--
-- V1 rules:
--   identity_color stores a stable palette ID (text) or NULL for neutral/unassigned.
--   HEX, RGB, display names, and "neutral" are never persisted.
--   Same color may not belong to two employees in one workspace.
--   Same color may be reused across different workspaces.
--   This migration does not backfill or update existing employee rows.
--
-- Before applying to an environment that may have been manually modified, run the
-- preflight queries in the section below. Both must return zero rows.

-- ---------------------------------------------------------------------------
-- Preflight (diagnostic only — do not execute destructive cleanup)
-- ---------------------------------------------------------------------------
--
-- Invalid persisted values (must return 0 rows before applying CHECK):
--
-- SELECT id, workspace_id, full_name, identity_color
-- FROM public.employees
-- WHERE identity_color IS NOT NULL
--   AND identity_color NOT IN (
--     'champagne', 'rose-gold', 'amber', 'coral', 'terracotta', 'rust',
--     'sage', 'moss', 'forest', 'emerald', 'teal', 'cyan', 'ocean',
--     'slate-blue', 'indigo', 'violet', 'plum', 'magenta', 'ruby', 'crimson',
--     'copper', 'bronze', 'sand', 'stone', 'pearl', 'silver', 'pewter',
--     'graphite', 'midnight', 'obsidian', 'honey', 'apricot', 'berry', 'wine',
--     'orchid', 'lavender', 'periwinkle', 'sapphire', 'glacier', 'jade', 'mint',
--     'olive', 'fern', 'chestnut', 'cocoa', 'ash', 'ember', 'dusk'
--   );
--
-- Duplicate non-null colors within a workspace (must return 0 rows before index):
--
-- SELECT workspace_id, identity_color, COUNT(*) AS employee_count
-- FROM public.employees
-- WHERE identity_color IS NOT NULL
-- GROUP BY workspace_id, identity_color
-- HAVING COUNT(*) > 1;

-- ---------------------------------------------------------------------------
-- Column
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists identity_color text null;

comment on column public.employees.identity_color is
  'Stable personal identity palette ID (48 curated values). NULL means neutral/unassigned.';

-- ---------------------------------------------------------------------------
-- Allowed palette IDs (48 selectable; neutral is represented by NULL)
-- ---------------------------------------------------------------------------

alter table public.employees
  drop constraint if exists employees_identity_color_allowed_check;

alter table public.employees
  add constraint employees_identity_color_allowed_check check (
    identity_color is null
    or identity_color in (
      'champagne',
      'rose-gold',
      'amber',
      'coral',
      'terracotta',
      'rust',
      'sage',
      'moss',
      'forest',
      'emerald',
      'teal',
      'cyan',
      'ocean',
      'slate-blue',
      'indigo',
      'violet',
      'plum',
      'magenta',
      'ruby',
      'crimson',
      'copper',
      'bronze',
      'sand',
      'stone',
      'pearl',
      'silver',
      'pewter',
      'graphite',
      'midnight',
      'obsidian',
      'honey',
      'apricot',
      'berry',
      'wine',
      'orchid',
      'lavender',
      'periwinkle',
      'sapphire',
      'glacier',
      'jade',
      'mint',
      'olive',
      'fern',
      'chestnut',
      'cocoa',
      'ash',
      'ember',
      'dusk'
    )
  );

-- ---------------------------------------------------------------------------
-- Workspace-scoped uniqueness (NULL values excluded)
-- ---------------------------------------------------------------------------

create unique index if not exists employees_workspace_identity_color_unique
  on public.employees (workspace_id, identity_color)
  where identity_color is not null;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- updated_at: public.set_employees_updated_at() fires on any row UPDATE, including
-- identity_color changes. No additional trigger is required.
-- RLS: no policy changes in this sprint. Manager and linked-staff UPDATE policies
-- operate at row level; identity writes must be gated in application/RPC later.
