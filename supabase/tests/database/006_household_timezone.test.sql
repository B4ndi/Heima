-- Household time zone: validation, who may change it, and that chore dates
-- follow the household's local date (midnight edge cases) instead of UTC.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'anne@test.no'),   -- admin, household A
  ('b0000000-0000-0000-0000-00000000000b', 'bjorn@test.no'),  -- member, household A
  ('c0000000-0000-0000-0000-00000000000c', 'cato@test.no');   -- admin, household B

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_admin() to anon, authenticated;
create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated;
create temp table codeA (code text);
grant select, insert on codeA to authenticated;
create function pg_temp.id(key text) returns uuid language sql stable as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to authenticated;

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('hhA', public.create_household('A'));
insert into codeA select code from public.create_invite(pg_temp.id('hhA'));
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.join_household((select code from codeA));
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
insert into ids values ('hhB', public.create_household('B'));

-- ============================================================ the column ----
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select timezone from households where id = pg_temp.id('hhA')), 'Europe/Oslo', 'default is Europe/Oslo');
select throws_ok($$ update households set timezone = 'Mars/Olympus_Mons' where id = pg_temp.id('hhA') $$,
                 '22023', null, 'unknown time zone rejected');
select throws_ok($$ update households set timezone = 'UTC+3' where id = pg_temp.id('hhA') $$,
                 '22023', null, 'POSIX offset strings rejected');
select throws_ok($$ update households set timezone = '' where id = pg_temp.id('hhA') $$,
                 '22023', null, 'empty time zone rejected');
update households set timezone = 'America/New_York' where id = pg_temp.id('hhA');
select is((select timezone from households where id = pg_temp.id('hhA')), 'America/New_York', 'admin can change it');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
update households set timezone = 'Asia/Tokyo' where id = pg_temp.id('hhA');
select is((select timezone from households where id = pg_temp.id('hhA')), 'America/New_York',
          'member cannot change it');
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
update households set timezone = 'Asia/Tokyo' where id = pg_temp.id('hhA');
select pg_temp.as_admin();
select is((select timezone from households where id = pg_temp.id('hhA')), 'America/New_York',
          'admin of another household cannot change it');
select ok(not has_function_privilege('authenticated', 'private.household_today(uuid)', 'execute'),
          'household_today is not callable by clients');

-- =================================================== midnight edge cases ----
select is(private.local_date('Europe/Oslo', '2026-11-25 22:59:59+00'), '2026-11-25'::date,
          'winter: 23:59:59 in Oslo is still the same day');
select is(private.local_date('Europe/Oslo', '2026-11-25 23:00:00+00'), '2026-11-26'::date,
          'winter: 00:00 in Oslo is the next day while UTC is still on the 25th');
select is(private.local_date('Europe/Oslo', '2026-06-30 22:30:00+00'), '2026-07-01'::date,
          'summer (UTC+2): 00:30 in Oslo is the next day');
select is(private.local_date('Europe/Oslo', '2026-03-29 00:30:00+00'), '2026-03-29'::date,
          'DST switch night: 01:30 local is still the 29th');

-- complete_chore uses the household's date, not UTC current_date.
-- Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart, so at any
-- moment their dates differ by one or two days; with UTC both would be equal.
update households set timezone = 'Pacific/Kiritimati' where id = pg_temp.id('hhA');
update households set timezone = 'Pacific/Pago_Pago'  where id = pg_temp.id('hhB');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
with c as (insert into chores (household_id, title, recurrence) values (pg_temp.id('hhA'), 'Støvsuge', 'weekly') returning id)
  insert into ids select 'choreA', id from c;
select is((select next_due from chores where id = pg_temp.id('choreA')),
          (now() at time zone 'Pacific/Kiritimati')::date, 'new chore defaults to the household''s today');
-- overdue chore: next due date is counted from the household's today
update chores set next_due = '2000-01-01' where id = pg_temp.id('choreA');
select public.complete_chore(pg_temp.id('choreA'));
select is((select next_due from chores where id = pg_temp.id('choreA')),
          (now() at time zone 'Pacific/Kiritimati')::date + 7, 'overdue chore: next due = local today + 7 (UTC+14)');

select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
with c as (insert into chores (household_id, title, recurrence, next_due)
           values (pg_temp.id('hhB'), 'Vaske', 'weekly', '2000-01-01') returning id)
  insert into ids select 'choreB', id from c;
select public.complete_chore(pg_temp.id('choreB'));
select is((select next_due from chores where id = pg_temp.id('choreB')),
          (now() at time zone 'Pacific/Pago_Pago')::date + 7, 'overdue chore: next due = local today + 7 (UTC-11)');

select pg_temp.as_admin();
select ok((select a.next_due - b.next_due from chores a, chores b
           where a.id = pg_temp.id('choreA') and b.id = pg_temp.id('choreB')) between 1 and 2,
          'same instant, different households: dates follow each household''s time zone');

-- a chore due in the future keeps its schedule
update chores set next_due = (now() at time zone 'Pacific/Kiritimati')::date + 3 where id = pg_temp.id('choreA');
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.complete_chore(pg_temp.id('choreA'));
select is((select next_due from chores where id = pg_temp.id('choreA')),
          (now() at time zone 'Pacific/Kiritimati')::date + 10, 'early completion keeps the schedule');

select * from finish();
rollback;
