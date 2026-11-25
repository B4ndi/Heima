-- Report and block: who can file, read and resolve reports; spoofing;
-- cross-household isolation; blocks hide content for the blocker only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'anne@test.no'),   -- admin, household A
  ('b0000000-0000-0000-0000-00000000000b', 'bjorn@test.no'),  -- member, household A
  ('d0000000-0000-0000-0000-00000000000d', 'dina@test.no'),   -- member, household A
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
grant select, insert, update on ids to authenticated;
create temp table codeA (code text);
grant select, insert on codeA to authenticated;
create function pg_temp.id(key text) returns uuid language sql stable as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to authenticated;

-- ---------------------------------------------------------------- fixtures --
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('hhA', public.create_household('A'));
insert into codeA select code from public.create_invite(pg_temp.id('hhA'), 5);
with p as (insert into posts (household_id, body) values (pg_temp.id('hhA'), 'Annes oppslag') returning id)
  insert into ids select 'postA', id from p;

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.join_household((select code from codeA));
with p as (insert into posts (household_id, body) values (pg_temp.id('hhA'), 'Bjørns spam') returning id)
  insert into ids select 'postB', id from p;
with c as (insert into post_comments (post_id, household_id, body)
           values (pg_temp.id('postA'), pg_temp.id('hhA'), 'Bjørns kommentar') returning id)
  insert into ids select 'commentB', id from c;

select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select public.join_household((select code from codeA));

select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
insert into ids values ('hhB', public.create_household('B'));
with p as (insert into posts (household_id, body) values (pg_temp.id('hhB'), 'Catos oppslag') returning id)
  insert into ids select 'postC', id from p;

-- ======================================================= filing a report ----
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
insert into ids values ('rD', public.report_content('post', pg_temp.id('postB'), 'spam', '  kjøp klokker  '));
select ok(pg_temp.id('rD') is not null, 'member can report a housemate''s post');
select is(public.report_content('post', pg_temp.id('postB'), 'spam'), pg_temp.id('rD'),
          'reporting the same item twice returns the open report');
select throws_ok($$ select public.report_content('comment', pg_temp.id('commentB'), 'nonsense') $$,
                 '22023', null, 'reason outside the fixed list rejected');
select throws_ok($$ select public.report_content('post', pg_temp.id('postB'), 'other', repeat('x', 501)) $$,
                 '22023', null, 'details longer than 500 rejected');
select throws_ok($$ select public.report_content('user', pg_temp.id('postB'), 'spam') $$,
                 '22023', null, 'unknown target kind rejected');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.report_content('post', pg_temp.id('postB'), 'spam') $$,
                 'P0001', null, 'cannot report own content');
insert into ids values ('rB', public.report_content('post', pg_temp.id('postA'), 'harassment'));

-- spoofing: there is no direct write path, reporter and target come from the server
select throws_ok($$ insert into content_reports (household_id, reported_user_id, post_id, reason)
                    values (pg_temp.id('hhA'), 'a0000000-0000-0000-0000-00000000000a', pg_temp.id('postA'), 'spam') $$,
                 '42501', null, 'reports cannot be inserted directly');
select throws_ok($$ update content_reports set status = 'resolved' $$,
                 '42501', null, 'reports cannot be updated directly');
select throws_ok($$ delete from content_reports $$, '42501', null, 'reports cannot be deleted directly');
select throws_ok($$ select reporter_id from content_reports $$, '42501', null,
                 'reporter_id is not selectable (admins do not learn who reported)');
select is((select reported_user_id from content_reports where id = pg_temp.id('rB')),
          'a0000000-0000-0000-0000-00000000000a'::uuid, 'reported user is derived from the content author');

-- ================================================= who can read a report ----
select is((select array_agg(id) from content_reports), array[pg_temp.id('rB')],
          'reporter sees only their own report, not other reporters''');
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select is((select array_agg(id) from content_reports), array[pg_temp.id('rD')],
          'second reporter sees only their own report');

-- the reported admin never sees the report about her; she sees the one she may act on
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select array_agg(id) from content_reports), array[pg_temp.id('rD')],
          'admin sees reports in her household except those about herself');
select throws_ok($$ select public.resolve_report(pg_temp.id('rB'), 'dismiss') $$,
                 'P0002', null, 'reported admin cannot resolve a report about herself');
select is((select details from content_reports where id = pg_temp.id('rD')), 'kjøp klokker',
          'details are trimmed');

-- =================================================== cross-household ----
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from content_reports), 0, 'outsider sees no reports');
select throws_ok($$ select public.report_content('post', pg_temp.id('postA'), 'spam') $$,
                 'P0002', null, 'outsider cannot report another household''s post');
select throws_ok($$ select public.resolve_report(pg_temp.id('rD'), 'delete_content') $$,
                 'P0002', null, 'admin of another household cannot resolve');
select pg_temp.as_admin();
select is((select count(*)::int from posts where id = pg_temp.id('postB')), 1, 'outsider resolve had no effect');
select is((select count(*)::int from content_reports where status = 'open'), 2, 'both reports still open');

-- a member (not admin) cannot resolve
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.resolve_report(pg_temp.id('rD'), 'dismiss') $$,
                 'P0002', null, 'non-admin cannot resolve');

-- ============================================================ resolving ----
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.resolve_report(pg_temp.id('rD'), 'ban_forever') $$,
                 '22023', null, 'unknown action rejected');
select public.resolve_report(pg_temp.id('rD'), 'dismiss');
select is((select status || '/' || resolution from content_reports where id = pg_temp.id('rD')), 'resolved/dismissed',
          'admin can dismiss');
select throws_ok($$ select public.resolve_report(pg_temp.id('rD'), 'delete_content') $$,
                 'P0001', null, 'a resolved report cannot be resolved again');
select is((select action from audit_log where action = 'report.resolve'), 'report.resolve',
          'resolution is audited');
select is((select count(*)::int from audit_log
           where action like 'report.%'
             and (actor_id = 'd0000000-0000-0000-0000-00000000000d'
                  or target_id = 'd0000000-0000-0000-0000-00000000000d'
                  or meta::text like '%d0000000-0000-0000-0000-00000000000d%')), 0,
          'audit log does not reveal the reporter');

-- report the comment, then delete it via the report
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
insert into ids values ('rC', public.report_content('comment', pg_temp.id('commentB'), 'hate'));
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select public.resolve_report(pg_temp.id('rC'), 'delete_content');
select is((select count(*)::int from post_comments where id = pg_temp.id('commentB')), 0,
          'delete_content removes the reported comment');
select pg_temp.as_admin();
select is((select count(*)::int from content_reports where id = pg_temp.id('rC')), 0,
          'report goes with the deleted content');

-- report again and remove the member
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
update ids set v = public.report_content('post', pg_temp.id('postB'), 'spam') where k = 'rD';
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select public.resolve_report(pg_temp.id('rD'), 'remove_member');
select is((select count(*)::int from posts where id = pg_temp.id('postB')), 0, 'remove_member deletes the content');
select is((select count(*)::int from household_members
           where household_id = pg_temp.id('hhA') and user_id = 'b0000000-0000-0000-0000-00000000000b'), 0,
          'remove_member removes the reported member');
select pg_temp.as_admin();
select is((select count(*)::int from content_reports where id = pg_temp.id('rB')), 1,
          'reports filed by a removed member stay for the admins');

-- ex-member loses sight of their own reports
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from content_reports), 0, 'ex-member no longer sees their reports');

-- ================================================================ blocks ----
-- re-join Bjørn and give him fresh content
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.join_household((select code from codeA));
with p as (insert into posts (household_id, body) values (pg_temp.id('hhA'), 'Bjørn igjen') returning id)
  update ids set v = (select id from p) where k = 'postB';
with c as (insert into post_comments (post_id, household_id, body)
           values (pg_temp.id('postA'), pg_temp.id('hhA'), 'ny kommentar') returning id)
  update ids set v = (select id from c) where k = 'commentB';

select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select throws_ok($$ insert into user_blocks (household_id, blocker_id, blocked_id)
                    values (pg_temp.id('hhA'), 'a0000000-0000-0000-0000-00000000000a',
                            'b0000000-0000-0000-0000-00000000000b') $$,
                 '42501', null, 'cannot block on behalf of someone else');
select throws_ok($$ insert into user_blocks (household_id, blocked_id)
                    values (pg_temp.id('hhA'), 'd0000000-0000-0000-0000-00000000000d') $$,
                 '23514', null, 'cannot block yourself');
select throws_ok($$ insert into user_blocks (household_id, blocked_id)
                    values (pg_temp.id('hhA'), 'c0000000-0000-0000-0000-00000000000c') $$,
                 '23503', null, 'can only block a housemate');
select throws_ok($$ insert into user_blocks (household_id, blocked_id)
                    values (pg_temp.id('hhB'), 'c0000000-0000-0000-0000-00000000000c') $$,
                 '42501', null, 'cannot create blocks in another household');

insert into user_blocks (household_id, blocked_id) values (pg_temp.id('hhA'), 'b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from posts where author_id = 'b0000000-0000-0000-0000-00000000000b'), 0,
          'blocker no longer sees the blocked user''s posts');
select is((select count(*)::int from post_comments where author_id = 'b0000000-0000-0000-0000-00000000000b'), 0,
          'blocker no longer sees the blocked user''s comments');
select is((select count(*)::int from posts where author_id = 'a0000000-0000-0000-0000-00000000000a'), 1,
          'other housemates'' posts still visible');
select throws_ok($$ update user_blocks set blocked_id = 'a0000000-0000-0000-0000-00000000000a' $$,
                 '42501', null, 'blocks are not updatable');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from user_blocks), 0, 'blocked user cannot see that they are blocked');
select is((select count(*)::int from posts where author_id = 'b0000000-0000-0000-0000-00000000000b'), 1,
          'blocked user still sees own posts');
delete from user_blocks;
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from posts where author_id = 'b0000000-0000-0000-0000-00000000000b'), 1,
          'block only affects the blocker');

select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from user_blocks), 0, 'outsider sees no blocks');

-- unblock
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
delete from user_blocks where blocked_id = 'b0000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from posts where author_id = 'b0000000-0000-0000-0000-00000000000b'), 1,
          'unblocking shows the posts again (blocked user could not delete the block)');

-- leaving the household removes blocks in both directions
insert into user_blocks (household_id, blocked_id) values (pg_temp.id('hhA'), 'b0000000-0000-0000-0000-00000000000b');
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select public.leave_household(pg_temp.id('hhA'));
select pg_temp.as_admin();
select is((select count(*)::int from user_blocks), 0, 'blocks disappear when the blocked user leaves');

-- ============================================================== realtime ----
-- Reports and blocks never ring the household-wide doorbell.
select pg_temp.as_admin();
select is((select count(*)::int from realtime.messages
           where topic like 'household:%' and payload ->> 'table' in ('content_reports', 'user_blocks')), 0,
          'reports and blocks are never broadcast to the whole household');
select ok(exists (select 1 from realtime.messages
                  where topic = 'user:d0000000-0000-0000-0000-00000000000d' and payload ->> 'table' = 'user_blocks'),
          'a block rings only the blocker');
select ok(exists (select 1 from realtime.messages
                  where topic = 'user:a0000000-0000-0000-0000-00000000000a' and payload ->> 'table' = 'content_reports'),
          'a report rings the admin who may read it');
select is((select count(*)::int from realtime.messages
           where topic = 'user:a0000000-0000-0000-0000-00000000000a' and payload ->> 'id' = pg_temp.id('rB')::text), 0,
          'the reported admin gets no doorbell for the report about her');

-- per-user topic "user:<uuid>": only that user may subscribe
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select set_config('realtime.topic', 'user:d0000000-0000-0000-0000-00000000000d', true);
select ok((select count(*) from realtime.messages) > 0, 'own user topic is authorised');
select set_config('realtime.topic', 'user:a0000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from realtime.messages), 0, 'cannot subscribe to another user''s topic');

select * from finish();
rollback;
