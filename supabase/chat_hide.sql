-- Per-person chat hide. NOT APPLIED.
-- Platon reviews this file before anyone runs it. Do not apply it from the app or CI.
-- Delete chat hides the conversation for that member only and clears history
-- up to hidden_at. Shared messages stay. A newer message shows the chat again.
-- Until this table exists, the app keeps the same record in localStorage.

create table if not exists public.chat_conversation_hides (
  member_id uuid not null references public.workspace_members (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  workspace_id uuid not null,
  cleared_at timestamptz not null default now(),
  hidden_at timestamptz not null default now(),
  primary key (member_id, conversation_id)
);

alter table public.chat_conversation_hides enable row level security;

create policy chat_hides_select_own
  on public.chat_conversation_hides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where id = chat_conversation_hides.member_id
        and auth_user_id = auth.uid()
    )
  );

create policy chat_hides_insert_own
  on public.chat_conversation_hides
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members
      where id = chat_conversation_hides.member_id
        and auth_user_id = auth.uid()
    )
  );

create policy chat_hides_update_own
  on public.chat_conversation_hides
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where id = chat_conversation_hides.member_id
        and auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where id = chat_conversation_hides.member_id
        and auth_user_id = auth.uid()
    )
  );

create policy chat_hides_delete_own
  on public.chat_conversation_hides
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where id = chat_conversation_hides.member_id
        and auth_user_id = auth.uid()
    )
  );
