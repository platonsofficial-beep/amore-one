# ONE v1.0.0-core

Operations platform for hospitality teams.

## Local development

### Auth bypass

For local development without Supabase login, set:

```env
VITE_AUTH_DISABLED=true
```

When enabled, the app skips the login screen and uses a mock development session. All modules behave as before.

Remove the variable or set it to `false` to require Supabase email/password sign-in.

### Workspace membership (Phase 1)

Run these in the Supabase SQL editor (in order):

1. `supabase/workspaces_schema.sql`
2. `supabase/workspace_members_schema.sql`
3. `supabase/workspace_members_rls_policies.sql`

On first authenticated sign-in, the app creates a workspace membership automatically. The first member becomes **Owner**; later members default to **Staff**.

Required Supabase env vars (unchanged):

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — oxlint

## Module status

### Operations V1 — complete

Operations V1 is complete and locked. Scope includes announcements, checklists, tasks, and shift notes on the Operations dashboard. Announcements: owners and managers manage; staff read on Today and mark seen only. Do not extend without a new phase. Bug fixes and copy-only polish are allowed if they do not change permissions, database schema, or service contracts.
