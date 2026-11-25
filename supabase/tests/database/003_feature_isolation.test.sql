-- Feature tables: cross-household isolation (IDOR), author spoofing,
-- immutable columns, anonymous polls, chores rotation, realtime and storage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'anne@test.no'),   -- admin, household A
  ('b0000000-0000-0000-0000-00000000000b', 'bjorn@test.no'),  -- member, household A
  ('c0000000-0000-0000-0000-00000000000c', 'cato@test.no');   -- admin, household B (attacker)

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

-- ---------------------------------------------------------------- fixtures --
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('hhA', public.create_household('A-gården'));
insert into ids select 'code', null;   -- placeholder
create temp table codeA as select code from public.create_invite((select v from ids where k = 'hhA'));
grant select on codeA to authenticated;
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.join_household((select code from codeA));

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
with p as (insert into posts (household_id, body) values ((select v from ids where k = 'hhA'), 'Husmøte søndag') returning id)
  insert into ids select 'post', id from p;
insert into ids values ('poll', public.create_poll((select v from ids where k = 'hhA'), 'Kjøpe ny sofa?',
                                                   array['Ja', 'Nei'], false, true, null));
with l as (insert into shopping_lists (household_id, name) values ((select v from ids where k = 'hhA'), 'Ukeshandel') returning id)
  insert into ids select 'list', id from l;
with i as (insert into shopping_items (list_id, household_id, text)
           values ((select v from ids where k = 'list'), (select v from ids where k = 'hhA'), 'Melk') returning id)
  insert into ids select 'item', id from i;
with e as (insert into events (household_id, title, starts_at, ends_at)
           values ((select v from ids where k = 'hhA'), 'Fest', now() + interval '1 day', now() + interval '1 day 4 hours') returning id)
  insert into ids select 'event', id from e;
with c as (insert into chores (household_id, title, recurrence, rotation)
           values ((select v from ids where k = 'hhA'), 'Vaske bad', 'weekly',
                   array['a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b']::uuid[]) returning id)
  insert into ids select 'chore', id from c;

select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
insert into ids values ('hhB', public.create_household('B-loftet'));

-- ==================================================== attacker (household B) --
select is((select count(*)::int from posts), 0, 'B cannot read A posts');
select is((select count(*)::int from polls), 0, 'B cannot read A polls');
select is((select count(*)::int from poll_options), 0, 'B cannot read A poll options');
select is((select count(*)::int from shopping_lists), 0, 'B cannot read A lists');
select is((select count(*)::int from shopping_items), 0, 'B cannot read A items');
select is((select count(*)::int from events), 0, 'B cannot read A events');
select is((select count(*)::int from chores), 0, 'B cannot read A chores');
select is((select count(*)::int from profiles), 1, 'B sees only own profile');
select is((select count(*)::int from household_members), 1, 'B sees only own membership');

select throws_ok($$ insert into posts (household_id, body) values ((select v from ids where k = 'hhA'), 'spam') $$,
                 '42501', null, 'B cannot post into A');
select throws_ok($$ insert into post_comments (post_id, household_id, body)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'), 'x') $$,
                 '42501', null, 'B cannot comment in A');
-- composite FK: A's post cannot be referenced while claiming household B
select throws_ok($$ insert into post_comments (post_id, household_id, body)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhB'), 'x') $$,
                 '23503', null, 'cross-household parent reference blocked by composite FK');
select throws_ok($$ insert into shopping_items (list_id, household_id, text)
                    values ((select v from ids where k = 'list'), (select v from ids where k = 'hhB'), 'x') $$,
                 '23503', null, 'cannot add item to A list via own household id');

-- updates / deletes silently affect 0 rows under RLS
update shopping_items set checked = true where id = (select v from ids where k = 'item');
update events set title = 'hacked' where id = (select v from ids where k = 'event');
delete from chores where id = (select v from ids where k = 'chore');
delete from posts where id = (select v from ids where k = 'post');

select throws_ok($$ select public.cast_vote((select v from ids where k = 'poll'),
                    array(select id from poll_options)) $$, 'P0002', null, 'B cannot vote in A poll');
select throws_ok($$ select * from public.poll_results((select v from ids where k = 'poll')) $$,
                 'P0002', null, 'B cannot read A poll results');
select throws_ok($$ select public.complete_chore((select v from ids where k = 'chore')) $$,
                 'P0002', null, 'B cannot complete A chore');
select throws_ok($$ insert into chores (household_id, title, rotation)
                    values ((select v from ids where k = 'hhB'), 'x',
                            array['a0000000-0000-0000-0000-00000000000a']::uuid[]) $$,
                 '23514', null, 'cannot put outsiders in a chore rotation');

-- realtime: B cannot subscribe to A's topic
select set_config('realtime.topic', 'household:' || (select v from ids where k = 'hhA'), true);
select is((select private.is_member(private.topic_household(current_setting('realtime.topic')))),
          false, 'B not authorised for A realtime topic');

select pg_temp.as_admin();
select is((select checked from shopping_items where id = (select v from ids where k = 'item')), false,
          'B update of A item had no effect');
select is((select title from events where id = (select v from ids where k = 'event')), 'Fest',
          'B update of A event had no effect');
select is((select count(*)::int from chores), 1, 'B delete of A chore had no effect');
select is((select count(*)::int from posts), 1, 'B delete of A post had no effect');

-- ========================================================= member (Bjørn, A) --
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from posts), 1, 'member reads household posts');
select is((select count(*)::int from profiles), 2, 'member sees housemates profiles');

-- author spoofing: author_id is not insertable
select throws_ok($$ insert into posts (household_id, author_id, body)
                    values ((select v from ids where k = 'hhA'), 'a0000000-0000-0000-0000-00000000000a', 'fake') $$,
                 '42501', null, 'cannot spoof post author');
-- identity columns are not updatable
select throws_ok($$ update posts set household_id = (select v from ids where k = 'hhB') $$,
                 '42501', null, 'cannot move post to another household');
select throws_ok($$ update posts set pinned = true $$, '42501', null, 'member cannot pin directly');
select throws_ok($$ select public.set_post_pinned((select v from ids where k = 'post'), true) $$,
                 '42501', null, 'member cannot pin via RPC');
-- editing someone else's post affects nothing
update posts set body = 'endret' where id = (select v from ids where k = 'post');
select is((select body from posts where id = (select v from ids where k = 'post')), 'Husmøte søndag',
          'member cannot edit others post');

-- shopping: server stamps who checked
update shopping_items set checked = true where id = (select v from ids where k = 'item');
select is((select checked_by from shopping_items where id = (select v from ids where k = 'item')),
          'b0000000-0000-0000-0000-00000000000b'::uuid, 'checked_by set by server');

-- anonymous poll: votes of others are invisible, tallies are visible
select public.cast_vote((select v from ids where k = 'poll'),
                        array[(select id from poll_options where position = 0)]);
select throws_ok($$ select public.cast_vote((select v from ids where k = 'poll'),
                    array(select id from poll_options)) $$, '22023', null, 'single-choice poll rejects 2 options');
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select public.cast_vote((select v from ids where k = 'poll'),
                        array[(select id from poll_options where position = 1)]);
select is((select count(*)::int from poll_votes), 1, 'anonymous poll: only own vote visible');
select is((select array_agg(votes::int order by votes) from public.poll_results((select v from ids where k = 'poll'))),
          array[1, 1], 'tallies visible');

-- chores: rotation advances, history recorded
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.complete_chore((select v from ids where k = 'chore'));
select is((select rotation_index from chores), 1, 'rotation advanced');
select is((select completed_by from chore_completions), 'b0000000-0000-0000-0000-00000000000b'::uuid,
          'completion attributed to caller');
select throws_ok($$ update chores set rotation_index = 0 $$, '42501', null, 'rotation_index not client-writable');

-- leaving removes you from rotations and access
select public.leave_household((select v from ids where k = 'hhA'));
select is((select count(*)::int from posts), 0, 'ex-member loses access immediately');
select pg_temp.as_admin();
select is((select rotation from chores), array['a0000000-0000-0000-0000-00000000000a']::uuid[],
          'ex-member removed from rotation');

-- storage: cannot write into someone else's avatar folder
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'a0000000-0000-0000-0000-00000000000a/avatar.png', auth.uid()::text) $$,
                 '42501', null, 'cannot upload into another user''s avatar folder');

select * from finish();
rollback;
