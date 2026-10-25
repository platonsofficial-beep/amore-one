# Member and employee access hardening

This release fixes the reservation-list missing import and profile membership
refresh, and hardens member/employee access. It does not migrate stock balances,
change schedule publication, or finish multi-workspace support.

## Database and client are one coordinated release

Apply `supabase/member_employee_access_hardening.sql` **after** the existing
workspace, employee (including identity color), membership and invitation schemas,
their RLS policies, and `stock_rls_policies.sql`. The script is transactional and
safe to rerun. It must remain the last access-policy migration: replaying the old
employee policy script restores table-wide SELECT and would undo column privacy.

The new client requires `get_employee_private_fields`. The old client uses
wildcard employee reads that are intentionally rejected after hardening. Use a
maintenance window: apply the SQL, deploy the matching client, and require open
tabs/installed PWAs to reload before reopening access. Do not deploy just one half.

No production database is changed by `npm test` or `npm run build`.

## Access contract

| Operation | Allowed |
| --- | --- |
| Read ordinary roster columns | Workspace members, subject to existing RLS |
| Read/write salary | Owner and General Manager only |
| Read internal notes and emergency contact | Owner, General Manager, Manager |
| Change own phone/color | Linked employee; existing identity RPC remains valid |
| Change own membership | Display name and last-seen time only |
| Self-link employee record | Owner/GM, same workspace |
| Modify another member | Existing owner RLS, with immutable user/workspace identity |
| Delete membership | Owner only |
| Invite staff/host | Existing management roles |
| Invite manager | Owner/GM only |
| Invite owner/GM | Rejected; ownership changes are not an invitation workflow |

Direct API SELECT of salary, notes or emergency contact is denied for all users.
The SECURITY DEFINER read RPC filters by workspace and applies field-level
authorization, returning null for private fields the caller cannot read. Client
code never falls back to an unrestricted private-field read. Manager edits omit
salary instead of sending a hidden/blank value.

Write guards intentionally run as SECURITY INVOKER. Authenticated API writes are
checked; trusted `postgres`, `supabase_admin` and `service_role` execution (including
the existing validated invitation and identity SECURITY DEFINER RPCs) is preserved.
Confirm function ownership on the target database before release; service-role
credentials must never be used by the browser.

Phone/email and other ordinary roster columns retain existing member visibility.
This release does not claim to resolve all personal-data policies or the existing
single-workspace published-schedule model.

## Verification

`npm test` includes `tests/memberEmployeeAccess.database.test.js`. It runs the
repository's schemas/policies/RPCs in an in-memory PGlite PostgreSQL instance with
Owner, GM, Manager, Staff, Host, anonymous and second-workspace actors. It tests
real grants, RLS and triggers, including repeat application of the migration.
It does not emulate Supabase's PostgREST HTTP layer or production-specific policies.

Before production, run the release on a staging copy and verify:

1. Owner/GM can view and edit salary; Manager cannot read or change it.
2. Manager employee edits preserve salary and still save notes/contact details.
3. Staff can save display name/phone and select an identity color.
4. Direct role/employee-link tampering is rejected; cross-workspace reads fail.
5. Staff/host and manager invitations, acceptance, revocation and Owner/GM linking work.
6. Team list, shift creation/editing and published schedule render through PostgREST.
7. Direct employee wildcard/private-column reads are denied with a user JWT.

Inspect actual `pg_policies`, table/column grants, function owners and other exposed
views/RPCs: untracked production grants or SECURITY DEFINER functions may provide
additional access beyond the checked-in schema. Do not declare the live system
secured until this verification and deployment are complete.

Audit existing memberships and outstanding invitations as well. The guards stop
new unauthorized writes; they do not undo past role changes or revoke previously
issued privileged tokens. Resolve suspicious roles/tokens before reopening access.

If rollout fails, keep access in maintenance mode and repair forward. Do not
restore unrestricted SELECT or self-role updates as a convenience workaround.

## Remaining priorities

1. Atomic location-aware supplier receiving with idempotent retries.
2. Transactional schedule publication preserving the last successful snapshot.
3. Explicit single-venue versus multi-tenant deployment model.
4. Ordered migrations and removal of legacy permissive access paths.
5. Legacy inventory/task consolidation, followed by gradual App.jsx extraction.
