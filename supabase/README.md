# Supabase SQL in this repo

These files are reference scripts. They are not a complete migration history.

Live reservation writes use the member's reservations permission level (`can_manage_workspace_reservations` → `has_workspace_permission(workspace, 'reservations', 2)`). A host with that level can insert and update reservations. Older scripts in this folder that gate reservation writes with `can_manage_workspace_stock` are stale and are being reconciled. Do not rewrite or re-apply those policies from this folder to match the old text.

`workspace_profiles_rls_dev_policies.sql` and `published_shifts_rls_dev_policies.sql` are **DEV ONLY / DO NOT RUN**. They are not the live policies.
