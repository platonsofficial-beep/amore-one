-- NOT APPLIED. Do not run this until Platon approves it separately.
--
-- Replaces public.delete_my_account so a direct call accepts either
-- confirmation word:
--   ΔΙΑΓΡΑΦΗ  exact, after trim
--   DELETE    any letter case, after trim
--
-- The app does not need this file to delete an account. English asks the
-- person to type DELETE, Greek asks for ΔΙΑΓΡΑΦΗ, and the client still sends
-- ΔΙΑΓΡΑΦΗ to the function that is already live. Apply this only if the
-- database function itself should accept DELETE from a direct RPC call.
-- The rest of the function is unchanged from privacy_02_privacy_rights.sql.

create or replace function public.delete_my_account(p_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_confirm text := btrim(coalesce(p_confirm, ''));
  v_blocking text;
  v_members uuid[];
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_confirm <> 'ΔΙΑΓΡΑΦΗ' and upper(v_confirm) <> 'DELETE' then
    raise exception 'confirmation_required' using errcode = '22023';
  end if;

  -- Sole owner of an open venue: must transfer ownership or close the venue first.
  select string_agg(w.name, ', ' order by w.name) into v_blocking
  from workspace_members m join workspaces w on w.id = m.workspace_id
  where m.auth_user_id = v_uid and m.role = 'owner' and w.closed_at is null
    and not exists (select 1 from workspace_members o
                    where o.workspace_id = m.workspace_id and o.role = 'owner'
                      and o.auth_user_id <> v_uid and o.account_deleted_at is null);
  if v_blocking is not null then
    raise exception 'sole_owner' using errcode = '22023', detail = v_blocking;
  end if;

  select coalesce(array_agg(id), '{}') into v_members from workspace_members where auth_user_id = v_uid;

  -- Venue records (attendance, leave, chat history) stay with the venue (controller),
  -- but the person is anonymised.
  update workspace_members
     set display_name = 'Διαγραμμένος χρήστης', email = '', avatar_path = null,
         avatar_updated_at = null, last_seen_at = null, account_deleted_at = now()
   where auth_user_id = v_uid;
  delete from chat_participants where member_id = any(v_members);
  delete from push_subscriptions where user_id = v_uid;
  delete from notifications where user_id = v_uid;
  delete from notification_preferences where user_id = v_uid;
  delete from operations_announcement_reads where user_id = v_uid;

  -- Auth: remove login identities and sessions, scrub and lock the user record.
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.mfa_factors where user_id = v_uid;
  update auth.users
     set email = 'deleted-' || v_uid || '@deleted.invalid', phone = null,
         encrypted_password = '', raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', deleted_at = now()
   where id = v_uid;

  return jsonb_build_object('deleted', true, 'at', now());
end $$;
