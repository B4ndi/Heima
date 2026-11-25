-- Reactions: isolation, spoofing, allowlist, own-only delete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'anne@test.no'),
  ('b0000000-0000-0000-0000-00000000000b', 'bjorn@test.no'),
  ('c0000000-0000-0000-0000-00000000000c', 'cato@test.no');

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

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('hhA', public.create_household('A'));
insert into codeA select code from public.create_invite((select v from ids where k = 'hhA'));
with p as (insert into posts (household_id, body) values ((select v from ids where k = 'hhA'), 'hei') returning id)
  insert into ids select 'post', id from p;
insert into post_reactions (post_id, household_id, emoji)
  values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'), '👍');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.join_household((select code from codeA));
insert into post_reactions (post_id, household_id, emoji)
  values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'), '❤️');
select is((select count(*)::int from post_reactions where post_id = (select v from ids where k = 'post')), 2,
          'member sees all reactions on household post');
select throws_ok($$ insert into post_reactions (post_id, household_id, emoji)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'), '💩') $$,
                 '23514', null, 'emoji outside allowlist rejected');
select throws_ok($$ insert into post_reactions (post_id, household_id, user_id, emoji)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'),
                            'a0000000-0000-0000-0000-00000000000a', '🎉') $$,
                 '42501', null, 'cannot react on behalf of someone else');
delete from post_reactions where user_id = 'a0000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from post_reactions where post_id = (select v from ids where k = 'post')), 2,
          'cannot delete someone else''s reaction');
select throws_ok($$ update post_reactions set emoji = '🎉' $$, '42501', null, 'reactions are not updatable');

select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
insert into ids values ('hhC', public.create_household('C'));
select is((select count(*)::int from post_reactions), 0, 'outsider sees no reactions');
select throws_ok($$ insert into post_reactions (post_id, household_id, emoji)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhA'), '👍') $$,
                 '42501', null, 'outsider cannot react');
select throws_ok($$ insert into post_reactions (post_id, household_id, emoji)
                    values ((select v from ids where k = 'post'), (select v from ids where k = 'hhC'), '👍') $$,
                 '23503', null, 'cannot attach reaction to another household''s post');

select * from finish();
rollback;
