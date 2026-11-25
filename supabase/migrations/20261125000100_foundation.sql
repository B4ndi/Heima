-- =============================================================================
-- Heima: foundation (privileges, helpers, profiles, households, members, audit)
--
-- Security model (see docs/threat-model.md):
--   * The database is the trust boundary. The app is an untrusted client.
--   * Default deny: no table or function is reachable by anon/authenticated
--     unless it is explicitly GRANTed below, and every table has RLS enabled
--     AND forced.
--   * Privileged logic lives in SECURITY DEFINER functions with an empty
--     search_path and explicit auth.uid() checks.
--   * Helpers that policies depend on live in the non-exposed `private` schema.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Default privileges: remove Supabase's "expose everything" defaults so that a
-- forgotten GRANT fails closed, on hosted projects as well as locally.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
-- PostgreSQL grants EXECUTE to PUBLIC on every new function. That built-in
-- default can only be removed globally (not per schema), so do it globally.
alter default privileges for role postgres
  revoke execute on functions from public;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;  -- needed so RLS policies can call helpers

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  avatar_path  text check (avatar_path is null or char_length(avatar_path) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Households and membership
-- -----------------------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  status       text not null default 'active' check (status in ('active', 'pending')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  -- a pending member can never hold admin
  check (not (status = 'pending' and role = 'admin'))
);
create index household_members_user_idx on public.household_members (user_id);

-- -----------------------------------------------------------------------------
-- Audit log (append-only; written only by SECURITY DEFINER functions)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid references public.households (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null check (char_length(action) <= 50),
  target_id    uuid,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_household_idx on public.audit_log (household_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helper functions (private schema, used by RLS policies)
-- SECURITY DEFINER so they can read household_members without recursing
-- through its own RLS policies. STABLE + empty search_path + qualified names.
-- -----------------------------------------------------------------------------
create function private.is_member(hh uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.is_admin(hh uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'admin'
  );
$$;

-- true if the current user and `other` are both active members of a household
create function private.shares_household(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members me
    join public.household_members them
      on them.household_id = me.household_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = other
  );
$$;

-- raise unless the caller is signed in; returns auth.uid()
create function private.require_uid()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Ikke innlogget' using errcode = '28000';
  end if;
  return uid;
end;
$$;

create function private.audit(hh uuid, act text, target uuid default null, m jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (household_id, actor_id, action, target_id, meta)
  values (hh, auth.uid(), act, target, coalesce(m, '{}'::jsonb));
$$;

grant execute on function private.is_member(uuid)        to authenticated;
grant execute on function private.is_admin(uuid)         to authenticated;
grant execute on function private.shares_household(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Generic trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New auth user -> profile. Metadata is user-controlled, so it is trimmed,
-- length-limited, and falls back to a safe default.
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 50);
begin
  if name = '' then
    name := 'Ny beboer';
  end if;
  insert into public.profiles (id, display_name) values (new.id, name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Account deletion: keep every household governable. Runs however the user is
-- deleted (Edge Function, dashboard, SQL).
-- -----------------------------------------------------------------------------
create function private.before_user_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.household_id
    from public.household_members m
    where m.user_id = old.id and m.status = 'active' and m.role = 'admin'
  loop
    -- if they are the only admin, promote the longest-standing active member
    if not exists (
      select 1 from public.household_members o
      where o.household_id = r.household_id and o.user_id <> old.id
        and o.status = 'active' and o.role = 'admin'
    ) then
      update public.household_members
         set role = 'admin'
       where (household_id, user_id) = (
         select o.household_id, o.user_id from public.household_members o
         where o.household_id = r.household_id and o.user_id <> old.id and o.status = 'active'
         order by o.joined_at, o.user_id
         limit 1
       );
    end if;
  end loop;

  -- households where they are the last active member disappear with them
  delete from public.households h
   where exists (select 1 from public.household_members m
                 where m.household_id = h.id and m.user_id = old.id)
     and not exists (select 1 from public.household_members m
                     where m.household_id = h.id and m.user_id <> old.id and m.status = 'active');
  return old;
end;
$$;

create trigger on_auth_user_deleting
  before delete on auth.users
  for each row execute function private.before_user_deleted();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.profiles          force  row level security;
alter table public.households        enable row level security;
alter table public.households        force  row level security;
alter table public.household_members enable row level security;
alter table public.household_members force  row level security;
alter table public.audit_log         enable row level security;
alter table public.audit_log         force  row level security;

-- profiles: you see yourself and people you live with; you edit only yourself
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_household(id)));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- households: members see; admins rename/delete. Creation only via RPC.
create policy households_select on public.households for select to authenticated
  using ((select private.is_member(id)));
create policy households_update on public.households for update to authenticated
  using ((select private.is_admin(id))) with check ((select private.is_admin(id)));

-- members: active members see the roster (incl. pending requests); a pending
-- user sees only their own row. All changes go through RPCs.
create policy members_select on public.household_members for select to authenticated
  using ((select private.is_member(household_id)) or user_id = (select auth.uid()));

-- audit log: admins only
create policy audit_select on public.audit_log for select to authenticated
  using ((select private.is_admin(household_id)));

-- -----------------------------------------------------------------------------
-- Grants (column-level where updates are allowed)
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

grant select on public.households to authenticated;
grant update (name) on public.households to authenticated;

grant select on public.household_members to authenticated;
grant select on public.audit_log to authenticated;

-- =============================================================================
-- Household RPCs
-- =============================================================================

create function public.create_household(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  hh  uuid;
begin
  if (select count(*) from public.household_members where user_id = uid) >= 10 then
    raise exception 'Du kan være med i maks 10 husstander' using errcode = 'P0001';
  end if;
  insert into public.households (name, created_by) values (btrim(p_name), uid) returning id into hh;
  insert into public.household_members (household_id, user_id, role, status)
  values (hh, uid, 'admin', 'active');
  perform private.audit(hh, 'household.create', hh);
  return hh;
end;
$$;

-- internal: drop a user from chore rotations of a household
create function private.remove_from_rotations(hh uuid, uid uuid)
returns void
language sql security definer set search_path = ''
as $$
  select 1;  -- replaced in the chores migration once the table exists
$$;

create function public.leave_household(p_household uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  me  public.household_members;
begin
  select * into me from public.household_members
   where household_id = p_household and user_id = uid for update;
  if not found then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;

  if me.status = 'active' and me.role = 'admin'
     and not exists (select 1 from public.household_members
                     where household_id = p_household and user_id <> uid
                       and status = 'active' and role = 'admin')
     and exists (select 1 from public.household_members
                 where household_id = p_household and user_id <> uid and status = 'active')
  then
    raise exception 'Gjør en annen beboer til admin før du forlater husstanden' using errcode = 'P0001';
  end if;

  delete from public.household_members where household_id = p_household and user_id = uid;
  perform private.remove_from_rotations(p_household, uid);

  if not exists (select 1 from public.household_members
                 where household_id = p_household and status = 'active') then
    delete from public.households where id = p_household;   -- last one out turns off the lights
  else
    perform private.audit(p_household, 'member.leave', uid);
  end if;
end;
$$;

create function public.remove_member(p_household uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  if not private.is_admin(p_household) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  if p_user = uid then
    raise exception 'Bruk «Forlat husstand» for å fjerne deg selv' using errcode = 'P0001';
  end if;
  delete from public.household_members where household_id = p_household and user_id = p_user;
  if not found then
    raise exception 'Ikke medlem' using errcode = 'P0002';
  end if;
  perform private.remove_from_rotations(p_household, p_user);
  perform private.audit(p_household, 'member.remove', p_user);
end;
$$;

create function public.set_member_role(p_household uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_uid();
  if not private.is_admin(p_household) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Ugyldig rolle' using errcode = '22023';
  end if;
  if p_role = 'member' and not exists (
      select 1 from public.household_members
      where household_id = p_household and user_id <> p_user and status = 'active' and role = 'admin') then
    raise exception 'Husstanden må ha minst én admin' using errcode = 'P0001';
  end if;
  update public.household_members set role = p_role
   where household_id = p_household and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Ikke aktivt medlem' using errcode = 'P0002';
  end if;
  perform private.audit(p_household, 'member.role', p_user, jsonb_build_object('role', p_role));
end;
$$;

create function public.approve_member(p_household uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_uid();
  if not private.is_admin(p_household) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  update public.household_members set status = 'active', joined_at = now()
   where household_id = p_household and user_id = p_user and status = 'pending';
  if not found then
    raise exception 'Ingen ventende forespørsel' using errcode = 'P0002';
  end if;
  perform private.audit(p_household, 'member.approve', p_user);
end;
$$;

create function public.delete_household(p_household uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_uid();
  if not private.is_admin(p_household) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  delete from public.households where id = p_household;
end;
$$;

revoke all on function public.create_household(text)                from public, anon;
revoke all on function public.leave_household(uuid)                 from public, anon;
revoke all on function public.remove_member(uuid, uuid)             from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text)     from public, anon;
revoke all on function public.approve_member(uuid, uuid)            from public, anon;
revoke all on function public.delete_household(uuid)                from public, anon;
grant execute on function public.create_household(text)             to authenticated;
grant execute on function public.leave_household(uuid)              to authenticated;
grant execute on function public.remove_member(uuid, uuid)          to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text)  to authenticated;
grant execute on function public.approve_member(uuid, uuid)         to authenticated;
grant execute on function public.delete_household(uuid)             to authenticated;
