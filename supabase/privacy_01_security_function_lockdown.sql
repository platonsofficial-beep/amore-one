-- Privacy readiness 1/2: lock down function EXECUTE + fixed search_path.
-- Approved by Platon 2026-10-29 (t335u). Backup: /workspace/legal/backup-20261029/.
-- Anon keeps EXECUTE only on get_workspace_invite_preview (invite link preview before login).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and d.objid is null
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- keep exactly the access signed-in users / service role already had (never broaden)
    if f.auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if f.svc_ok then execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;

  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and d.objid is null and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

grant execute on function public.get_workspace_invite_preview to anon;

-- New functions created by postgres in public are no longer executable by anon by default.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
