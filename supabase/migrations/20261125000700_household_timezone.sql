-- =============================================================================
-- Heimvis: household time zone
--
-- "Today" for chores used to be the server's current_date (UTC). In Norway
-- that is one hour behind in winter and two in summer, so a chore completed
-- at 00:30 counted for yesterday and its next due date came out a day early.
-- Every household now has an IANA time zone (default Europe/Oslo) and chore
-- logic uses the household's local date.
-- =============================================================================

alter table public.households
  add column timezone text not null default 'Europe/Oslo'
  check (char_length(timezone) between 1 and 64 and timezone ~ '^[A-Za-z0-9_+/-]+$');

-- A CHECK constraint cannot look up pg_timezone_names, so a trigger validates.
-- Also rejects names `at time zone` would accept but that are not zones
-- (POSIX strings such as 'UTC+3' or '<+05>-5').
create function private.households_validate_timezone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Ugyldig tidssone' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger households_validate_timezone
  before insert or update of timezone on public.households
  for each row execute function private.households_validate_timezone();

-- Admins change it (households_update policy is admin-only).
grant update (timezone) on public.households to authenticated;

-- The date at `p_at` in time zone `p_tz`. Pure, so the midnight edge cases are testable.
create function private.local_date(p_tz text, p_at timestamptz)
returns date
language sql stable set search_path = ''
as $$
  select (p_at at time zone p_tz)::date;
$$;

create function private.household_today(p_household uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select private.local_date(h.timezone, now()) from public.households h where h.id = p_household;
$$;

-- New chores without a due date start "today" in the household, not in UTC.
-- NOT NULL is checked after BEFORE triggers, so the default can move here.
alter table public.chores alter column next_due drop default;

create function private.chores_default_due()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.next_due is null then
    new.next_due := private.household_today(new.household_id);
  end if;
  return new;
end;
$$;
create trigger chores_default_due before insert on public.chores
  for each row execute function private.chores_default_due();

create or replace function public.complete_chore(p_chore uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  c     public.chores;
  today date;
  nxt   date;
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

  today := private.household_today(c.household_id);
  nxt := greatest(c.next_due, today) + case c.recurrence
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

revoke execute on function private.households_validate_timezone() from public, anon, authenticated;
revoke execute on function private.local_date(text, timestamptz)  from public, anon, authenticated;
revoke execute on function private.household_today(uuid)          from public, anon, authenticated;
revoke execute on function private.chores_default_due()           from public, anon, authenticated;
