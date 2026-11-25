-- =============================================================================
-- Heima: reactions on posts
--
-- Same patterns as the other feature tables: household_id on every row,
-- composite FK to the parent, user_id defaults to auth.uid() and is not in the
-- INSERT grant, a fixed emoji allowlist (no free text = nothing to moderate).
-- =============================================================================

create table public.post_reactions (
  post_id      uuid not null,
  household_id uuid not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji        text not null check (emoji in ('👍', '❤️', '😂', '🎉', '😮', '🙏')),
  created_at   timestamptz not null default now(),
  primary key (post_id, user_id, emoji),
  foreign key (post_id, household_id) references public.posts (id, household_id) on delete cascade
);
create index post_reactions_household_idx on public.post_reactions (household_id);

alter table public.post_reactions enable row level security;
alter table public.post_reactions force  row level security;

create policy reactions_select on public.post_reactions for select to authenticated
  using ((select private.is_member(household_id)));
create policy reactions_insert on public.post_reactions for insert to authenticated
  with check ((select private.is_member(household_id)) and user_id = (select auth.uid()));
create policy reactions_delete on public.post_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member(household_id)));

grant select on public.post_reactions to authenticated;
grant insert (post_id, household_id, emoji) on public.post_reactions to authenticated;
grant delete on public.post_reactions to authenticated;

-- Realtime doorbell: for reactions the interesting id is the post
create or replace function private.notify_household()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec  jsonb := to_jsonb(coalesce(new, old));
  hh   uuid;
  rid  text;
begin
  hh := (rec ->> 'household_id')::uuid;
  rid := case tg_table_name
           when 'poll_votes'        then rec ->> 'poll_id'
           when 'post_reactions'    then rec ->> 'post_id'
           when 'household_members' then rec ->> 'user_id'
           else rec ->> 'id'
         end;
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op, 'id', rid),
    'change',
    'household:' || hh::text,
    true
  );
  return null;
end;
$$;
revoke execute on function private.notify_household() from public, anon, authenticated;

create trigger post_reactions_notify after insert or update or delete on public.post_reactions
  for each row execute function private.notify_household();
