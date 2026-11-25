-- =============================================================================
-- Heima: features (message board, polls, shopping lists, calendar, chores)
--
-- Patterns used on every table:
--   * household_id on every row; child rows use a composite FK
--     (parent_id, household_id) -> parent(id, household_id), so a row can
--     never point at another household's parent while claiming to be in yours.
--   * Authorship columns default to auth.uid() and are NOT in the INSERT
--     column grant, so they cannot be spoofed. WITH CHECK repeats the rule.
--   * UPDATE is granted per column; identity columns (household_id, author,
--     created_at) are never updatable.
--   * Multi-row or state-machine operations (polls, votes, chore completion)
--     are RPCs, not direct writes.
-- =============================================================================

-- ---------------------------------------------------------------- Oppslag ----
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  unique (id, household_id)
);
create index posts_household_idx on public.posts (household_id, created_at desc);

create table public.post_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null,
  household_id uuid not null,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at   timestamptz not null default now(),
  foreign key (post_id, household_id) references public.posts (id, household_id) on delete cascade
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

-- ----------------------------------------------------------- Avstemninger ----
create table public.polls (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  question        text not null check (char_length(btrim(question)) between 1 and 300),
  multiple_choice boolean not null default false,
  anonymous       boolean not null default false,
  closes_at       timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, household_id)
);
create index polls_household_idx on public.polls (household_id, created_at desc);

create table public.poll_options (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null,
  household_id uuid not null,
  label        text not null check (char_length(btrim(label)) between 1 and 100),
  position     smallint not null check (position between 0 and 9),
  unique (poll_id, position),
  unique (id, poll_id),
  foreign key (poll_id, household_id) references public.polls (id, household_id) on delete cascade
);

create table public.poll_votes (
  poll_id      uuid not null,
  option_id    uuid not null,
  household_id uuid not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (option_id, user_id),
  foreign key (option_id, poll_id) references public.poll_options (id, poll_id) on delete cascade,
  foreign key (poll_id, household_id) references public.polls (id, household_id) on delete cascade
);
create index poll_votes_poll_idx on public.poll_votes (poll_id);

-- ------------------------------------------------------------ Handleliste ----
create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  archived     boolean not null default false,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (id, household_id)
);
create index shopping_lists_household_idx on public.shopping_lists (household_id);

create table public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null,
  household_id uuid not null,
  text         text not null check (char_length(btrim(text)) between 1 and 120),
  quantity     text check (quantity is null or char_length(quantity) <= 30),
  checked      boolean not null default false,
  checked_by   uuid references auth.users (id) on delete set null,
  checked_at   timestamptz,
  added_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (list_id, household_id) references public.shopping_lists (id, household_id) on delete cascade
);
create index shopping_items_list_idx on public.shopping_items (list_id, checked, created_at);

-- ---------------------------------------------------------------- Kalender ----
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  description  text check (description is null or char_length(description) <= 1000),
  location     text check (location is null or char_length(location) <= 120),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_at >= starts_at and ends_at <= starts_at + interval '31 days')
);
create index events_household_idx on public.events (household_id, starts_at);

-- -------------------------------------------------------------- Vaskeliste ----
create table public.chores (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 100),
  recurrence     text not null default 'weekly'
                 check (recurrence in ('once', 'daily', 'weekly', 'biweekly', 'monthly')),
  rotation       uuid[] not null default '{}' check (cardinality(rotation) <= 30),
  rotation_index int not null default 0 check (rotation_index >= 0),
  next_due       date not null default current_date,
  archived       boolean not null default false,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (id, household_id)
);
create index chores_household_idx on public.chores (household_id, next_due);

create table public.chore_completions (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null,
  household_id uuid not null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz not null default now(),
  foreign key (chore_id, household_id) references public.chores (id, household_id) on delete cascade
);
create index chore_completions_chore_idx on public.chore_completions (chore_id, completed_at desc);

-- =============================================================================
-- Integrity triggers
-- =============================================================================

-- posts: stamp edits
create function private.posts_before_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger posts_before_update before update on public.posts
  for each row execute function private.posts_before_update();

-- shopping items: server decides who checked and when
create function private.shopping_items_stamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.checked := false;
    new.checked_by := null;
    new.checked_at := null;
  elsif new.checked is distinct from old.checked then
    new.checked_by := case when new.checked then auth.uid() end;
    new.checked_at := case when new.checked then now() end;
  end if;
  return new;
end;
$$;
create trigger shopping_items_stamp before insert or update on public.shopping_items
  for each row execute function private.shopping_items_stamp();

-- chores: rotation may only contain active members of the household; keep
-- rotation_index in range when the rotation changes
create function private.chores_validate()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- de-duplicate, keeping first occurrence order
  new.rotation := array(
    select u from (
      select u, min(o) as o from unnest(new.rotation) with ordinality t(u, o) group by u
    ) x order by o
  );
  if exists (
    select 1 from unnest(new.rotation) r(u)
    where not exists (select 1 from public.household_members m
                      where m.household_id = new.household_id and m.user_id = r.u and m.status = 'active')
  ) then
    raise exception 'Rotasjonen kan bare inneholde beboere i husstanden' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.rotation is distinct from old.rotation then
    if cardinality(new.rotation) = 0 then
      new.rotation_index := 0;
    else
      new.rotation_index := new.rotation_index % cardinality(new.rotation);
    end if;
  end if;
  return new;
end;
$$;
create trigger chores_validate before insert or update on public.chores
  for each row execute function private.chores_validate();

-- Now that chores exists, implement rotation clean-up used by leave/remove
create or replace function private.remove_from_rotations(hh uuid, uid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.chores
     set rotation = array_remove(rotation, uid)
   where household_id = hh and uid = any (rotation);
$$;

-- =============================================================================
-- RLS
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'polls', 'poll_options', 'poll_votes',
                           'shopping_lists', 'shopping_items', 'events', 'chores', 'chore_completions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- posts
create policy posts_select on public.posts for select to authenticated
  using ((select private.is_member(household_id)));
create policy posts_insert on public.posts for insert to authenticated
  with check ((select private.is_member(household_id)) and author_id = (select auth.uid()));
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and (select private.is_member(household_id)))
  with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated
  using ((author_id = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));

-- comments
create policy comments_select on public.post_comments for select to authenticated
  using ((select private.is_member(household_id)));
create policy comments_insert on public.post_comments for insert to authenticated
  with check ((select private.is_member(household_id)) and author_id = (select auth.uid()));
create policy comments_update on public.post_comments for update to authenticated
  using (author_id = (select auth.uid()) and (select private.is_member(household_id)))
  with check (author_id = (select auth.uid()));
create policy comments_delete on public.post_comments for delete to authenticated
  using ((author_id = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));

-- polls (writes via RPC; delete by creator or admin)
create policy polls_select on public.polls for select to authenticated
  using ((select private.is_member(household_id)));
create policy polls_delete on public.polls for delete to authenticated
  using ((created_by = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));
create policy poll_options_select on public.poll_options for select to authenticated
  using ((select private.is_member(household_id)));
-- votes: in anonymous polls you only see your own vote rows; tallies come from poll_results()
create policy poll_votes_select on public.poll_votes for select to authenticated
  using ((select private.is_member(household_id))
         and (user_id = (select auth.uid())
              or not exists (select 1 from public.polls p where p.id = poll_id and p.anonymous)));

-- shopping: everyone in the flat can add, tick off, edit and remove items
create policy lists_select on public.shopping_lists for select to authenticated
  using ((select private.is_member(household_id)));
create policy lists_insert on public.shopping_lists for insert to authenticated
  with check ((select private.is_member(household_id)) and created_by = (select auth.uid()));
create policy lists_update on public.shopping_lists for update to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));
create policy lists_delete on public.shopping_lists for delete to authenticated
  using ((created_by = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));

create policy items_select on public.shopping_items for select to authenticated
  using ((select private.is_member(household_id)));
create policy items_insert on public.shopping_items for insert to authenticated
  with check ((select private.is_member(household_id)) and added_by = (select auth.uid()));
create policy items_update on public.shopping_items for update to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));
create policy items_delete on public.shopping_items for delete to authenticated
  using ((select private.is_member(household_id)));

-- events
create policy events_select on public.events for select to authenticated
  using ((select private.is_member(household_id)));
create policy events_insert on public.events for insert to authenticated
  with check ((select private.is_member(household_id)) and created_by = (select auth.uid()));
create policy events_update on public.events for update to authenticated
  using ((created_by = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)))
  with check ((select private.is_member(household_id)));
create policy events_delete on public.events for delete to authenticated
  using ((created_by = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));

-- chores: shared responsibility, any member can create/edit; delete by creator/admin
create policy chores_select on public.chores for select to authenticated
  using ((select private.is_member(household_id)));
create policy chores_insert on public.chores for insert to authenticated
  with check ((select private.is_member(household_id)) and created_by = (select auth.uid()));
create policy chores_update on public.chores for update to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));
create policy chores_delete on public.chores for delete to authenticated
  using ((created_by = (select auth.uid()) and (select private.is_member(household_id)))
         or (select private.is_admin(household_id)));
create policy completions_select on public.chore_completions for select to authenticated
  using ((select private.is_member(household_id)));

-- =============================================================================
-- Grants (column-level)
-- =============================================================================
grant select on public.posts to authenticated;
grant insert (household_id, body) on public.posts to authenticated;
grant update (body) on public.posts to authenticated;
grant delete on public.posts to authenticated;

grant select on public.post_comments to authenticated;
grant insert (post_id, household_id, body) on public.post_comments to authenticated;
grant update (body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;

grant select on public.polls, public.poll_options, public.poll_votes to authenticated;
grant delete on public.polls to authenticated;

grant select on public.shopping_lists to authenticated;
grant insert (household_id, name) on public.shopping_lists to authenticated;
grant update (name, archived) on public.shopping_lists to authenticated;
grant delete on public.shopping_lists to authenticated;

grant select on public.shopping_items to authenticated;
grant insert (list_id, household_id, text, quantity) on public.shopping_items to authenticated;
grant update (text, quantity, checked) on public.shopping_items to authenticated;
grant delete on public.shopping_items to authenticated;

grant select on public.events to authenticated;
grant insert (household_id, title, description, location, starts_at, ends_at, all_day)
  on public.events to authenticated;
grant update (title, description, location, starts_at, ends_at, all_day)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant select on public.chores to authenticated;
grant insert (household_id, title, recurrence, rotation, next_due) on public.chores to authenticated;
grant update (title, recurrence, rotation, next_due, archived) on public.chores to authenticated;
grant delete on public.chores to authenticated;

grant select on public.chore_completions to authenticated;

-- =============================================================================
-- RPCs
-- =============================================================================

create function public.set_post_pinned(p_post uuid, p_pinned boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare hh uuid;
begin
  perform private.require_uid();
  select household_id into hh from public.posts where id = p_post;
  if hh is null or not private.is_admin(hh) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  update public.posts set pinned = coalesce(p_pinned, false) where id = p_post;
end;
$$;

create function public.create_poll(
  p_household uuid,
  p_question text,
  p_options text[],
  p_multiple_choice boolean default false,
  p_anonymous boolean default false,
  p_closes_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid  uuid := private.require_uid();
  pid  uuid;
  opts text[];
begin
  if not private.is_member(p_household) then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  opts := array(select btrim(o) from unnest(p_options) o where btrim(o) <> '');
  if cardinality(opts) not between 2 and 10 then
    raise exception 'En avstemning trenger 2–10 alternativer' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'Frist må være i fremtiden' using errcode = '22023';
  end if;

  insert into public.polls (household_id, created_by, question, multiple_choice, anonymous, closes_at)
  values (p_household, uid, btrim(p_question), coalesce(p_multiple_choice, false),
          coalesce(p_anonymous, false), p_closes_at)
  returning id into pid;

  for i in 1..cardinality(opts) loop
    insert into public.poll_options (poll_id, household_id, label, position)
    values (pid, p_household, opts[i], i - 1);
  end loop;
  return pid;
end;
$$;

create function public.cast_vote(p_poll uuid, p_option_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.polls;
  n   int := coalesce(cardinality(p_option_ids), 0);
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null or not private.is_member(p.household_id) then
    raise exception 'Fant ikke avstemningen' using errcode = 'P0002';
  end if;
  if p.closed_at is not null or (p.closes_at is not null and p.closes_at <= now()) then
    raise exception 'Avstemningen er avsluttet' using errcode = 'P0001';
  end if;
  if n = 0 or (not p.multiple_choice and n > 1) then
    raise exception 'Ugyldig antall valg' using errcode = '22023';
  end if;
  if (select count(*) from public.poll_options
      where poll_id = p_poll and id = any (p_option_ids)) <> (select count(distinct x) from unnest(p_option_ids) x) then
    raise exception 'Ugyldig alternativ' using errcode = '22023';
  end if;

  delete from public.poll_votes where poll_id = p_poll and user_id = uid;
  insert into public.poll_votes (poll_id, option_id, household_id, user_id)
  select p_poll, o, p.household_id, uid from (select distinct unnest(p_option_ids) as o) s;
end;
$$;

create function public.close_poll(p_poll uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null or not (private.is_admin(p.household_id)
                          or (p.created_by = uid and private.is_member(p.household_id))) then
    raise exception 'Ikke tillatt' using errcode = '42501';
  end if;
  update public.polls set closed_at = coalesce(closed_at, now()) where id = p_poll;
end;
$$;

-- Tallies without revealing who voted (works for anonymous and open polls)
create function public.poll_results(p_poll uuid)
returns table (option_id uuid, votes bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare hh uuid;
begin
  perform private.require_uid();
  select household_id into hh from public.polls where id = p_poll;
  if hh is null or not private.is_member(hh) then
    raise exception 'Fant ikke avstemningen' using errcode = 'P0002';
  end if;
  return query
    select o.id, count(v.user_id)
    from public.poll_options o
    left join public.poll_votes v on v.option_id = o.id
    where o.poll_id = p_poll
    group by o.id, o.position
    order by o.position;
end;
$$;

create function public.complete_chore(p_chore uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  c   public.chores;
  nxt date;
begin
  select * into c from public.chores where id = p_chore for update;
  if c.id is null or not private.is_member(c.household_id) then
    raise exception 'Fant ikke oppgaven' using errcode = 'P0002';
  end if;
  if c.archived then
    raise exception 'Oppgaven er arkivert' using errcode = 'P0001';
  end if;

  insert into public.chore_completions (chore_id, household_id, completed_by)
  values (c.id, c.household_id, uid);

  nxt := greatest(c.next_due, current_date) + case c.recurrence
           when 'daily'    then interval '1 day'
           when 'weekly'   then interval '7 days'
           when 'biweekly' then interval '14 days'
           when 'monthly'  then interval '1 month'
           else interval '0 days'
         end;

  update public.chores
     set rotation_index = case when cardinality(rotation) = 0 then 0
                               else (rotation_index + 1) % cardinality(rotation) end,
         next_due = nxt,
         archived = (recurrence = 'once')
   where id = c.id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_post_pinned(uuid, boolean)',
    'public.create_poll(uuid, text, text[], boolean, boolean, timestamptz)',
    'public.cast_vote(uuid, uuid[])',
    'public.close_poll(uuid)',
    'public.poll_results(uuid)',
    'public.complete_chore(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
