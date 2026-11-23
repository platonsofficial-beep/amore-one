-- NOT APPLIED. One-off repair for the 23 Nov 2026 SENTIO invite.
-- Do not run this from the app. Review it, then run it by hand if you want.
--
-- Invitee: a897c986-11ff-4c28-8313-9dd9c809d6b2 (platonsofficialbet@gmail.com)
-- Pending manager invite: ae909744-2b45-4ad1-a25b-8a653b276a35
--   created 2026-11-23 23:24 UTC, accepted_at null, revoked_at null, role manager
-- SENTIO workspace: 0d4ddd40-99b4-41f6-9551-9b42722072a6 (workspaces.name Platon Sachinis)
-- Accidental venue: 4ae5cdca-7c2f-4d44-8bf7-0ec63be5aa32 (Stelios Papadimas)
--   created 23:14 UTC, one owner membership, no employees, no reservations.
--
-- (a) Join SENTIO as manager and mark that invite accepted.
-- (b) is commented. Uncomment only after (a) succeeds.

begin;

insert into public.workspace_members (
  workspace_id,
  auth_user_id,
  employee_id,
  display_name,
  email,
  role
)
select
  wi.workspace_id,
  'a897c986-11ff-4c28-8313-9dd9c809d6b2'::uuid,
  wi.employee_id,
  'Stelios Papadimas',
  'platonsofficialbet@gmail.com',
  'manager'
from public.workspace_invites wi
where wi.id = 'ae909744-2b45-4ad1-a25b-8a653b276a35'
  and wi.workspace_id = '0d4ddd40-99b4-41f6-9551-9b42722072a6'
  and wi.accepted_at is null
  and wi.revoked_at is null
  and wi.role = 'manager'
  and not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = wi.workspace_id
      and wm.auth_user_id = 'a897c986-11ff-4c28-8313-9dd9c809d6b2'::uuid
  );

update public.workspace_invites
set
  accepted_at = now(),
  accepted_by = 'a897c986-11ff-4c28-8313-9dd9c809d6b2'::uuid
where id = 'ae909744-2b45-4ad1-a25b-8a653b276a35'
  and workspace_id = '0d4ddd40-99b4-41f6-9551-9b42722072a6'
  and accepted_at is null
  and revoked_at is null
  and role = 'manager';

commit;

-- (b) Optional. Removes the empty venue created at signup.
-- Run only after (a). It refuses to delete if employees or reservations exist,
-- or if anyone else is a member.
--
-- begin;
-- delete from public.workspaces w
-- where w.id = '4ae5cdca-7c2f-4d44-8bf7-0ec63be5aa32'
--   and w.name = 'Stelios Papadimas'
--   and not exists (
--     select 1 from public.employees e where e.workspace_id = w.id
--   )
--   and not exists (
--     select 1 from public.reservations r where r.workspace_id = w.id
--   )
--   and (
--     select count(*) from public.workspace_members m where m.workspace_id = w.id
--   ) = 1
--   and exists (
--     select 1
--     from public.workspace_members m
--     where m.workspace_id = w.id
--       and m.auth_user_id = 'a897c986-11ff-4c28-8313-9dd9c809d6b2'::uuid
--       and m.role = 'owner'
--   );
-- commit;
