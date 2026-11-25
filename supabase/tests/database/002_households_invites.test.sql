-- Households, roles and invites: privilege escalation, brute force, lifecycle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'anne@test.no',  '{"display_name":"Anne"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'bjorn@test.no', '{"display_name":"Bjørn"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'cato@test.no',  '{}'),
  ('d0000000-0000-0000-0000-00000000000d', 'dina@test.no',  '{"display_name":"   "}');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;
-- functions get no PUBLIC execute by default in this project (see foundation migration)
grant execute on function pg_temp.as_user(uuid), pg_temp.as_admin() to anon, authenticated;

-- profile trigger sanitises metadata
select is((select display_name from profiles where id = 'c0000000-0000-0000-0000-00000000000c'),
          'Ny beboer', 'missing display_name falls back');
select is((select display_name from profiles where id = 'd0000000-0000-0000-0000-00000000000d'),
          'Ny beboer', 'blank display_name falls back');

-- --------------------------------------------------------- anon is locked out --
set local role anon;
select throws_ok($$ select * from public.households $$, '42501', null, 'anon cannot read households');
select throws_ok($$ select public.create_household('x') $$, '42501', null, 'anon cannot call RPCs');
select pg_temp.as_admin();

-- ---------------------------------------------------------- create household --
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
create temp table ctx as select public.create_household('Kollektivet') as hh;
grant select on ctx to authenticated;

select is((select role from household_members where user_id = auth.uid()), 'admin', 'creator is admin');
select is((select count(*)::int from households), 1, 'creator sees their household');

-- direct writes to membership are impossible
select throws_ok(
  $$ insert into household_members (household_id, user_id, role)
     values ((select hh from ctx), 'b0000000-0000-0000-0000-00000000000b', 'admin') $$,
  '42501', null, 'cannot insert membership rows directly');
select throws_ok(
  $$ insert into households (name) values ('Sneaky') $$,
  '42501', null, 'cannot insert households directly');

-- ----------------------------------------------------------------- invites --
create temp table inv as select * from public.create_invite((select hh from ctx), 2, 48, false);
grant select on inv to authenticated;
select matches((select code from inv), '^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$', 'code format');
select throws_ok($$ select code_hash from invites $$, '42501', null, 'admin cannot read code hashes');

-- outsider cannot see the household or create invites for it
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from households), 0, 'outsider sees no households');
select is((select count(*)::int from invites), 0, 'outsider sees no invites');
select throws_ok($$ select public.create_invite((select hh from ctx)) $$, '42501', null,
                 'outsider cannot create invite');

-- preview + join (code is case/format-insensitive)
select is((public.preview_invite(lower(replace((select code from inv), '-', ' '))) ->> 'household_name'),
          'Kollektivet', 'preview shows household name');
select is((public.join_household(lower((select code from inv))) ->> 'status'), 'active', 'join works');
select is((select count(*)::int from households), 1, 'member now sees household');
select is((select role from household_members where user_id = auth.uid()), 'member', 'joins as member');

-- members cannot escalate
select throws_ok($$ select public.set_member_role((select hh from ctx), auth.uid(), 'admin') $$,
                 '42501', null, 'member cannot make self admin');
select throws_ok($$ update household_members set role = 'admin' where user_id = auth.uid() $$,
                 '42501', null, 'member cannot update role directly');
select throws_ok($$ select public.remove_member((select hh from ctx), 'a0000000-0000-0000-0000-00000000000a') $$,
                 '42501', null, 'member cannot remove admin');

-- --------------------------------------------------- brute-force protection --
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select is((public.join_household('AAAAA-AAAAA') ->> 'error'), 'invalid', 'wrong code rejected generically');
select public.join_household('BBBBB-BBBBB'), public.join_household('CCCCC-CCCCC'),
       public.join_household('DDDDD-DDDDD'), public.preview_invite('EEEEE-EEEEE');
select is((public.join_household((select code from inv)) ->> 'error'), 'rate_limited',
          'valid code refused after 5 failures (rate limit)');
select is((select count(*)::int from household_members where user_id = auth.uid()), 0, 'not joined');

-- ---------------------------------------------- use limit, revoke, approval --
select pg_temp.as_admin();
delete from invite_attempts;
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select is((public.join_household((select code from inv)) ->> 'ok'), 'true', 'second use ok');
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select is((public.join_household((select code from inv)) ->> 'error'), 'invalid', 'max_uses enforced');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
create temp table inv2 as select * from public.create_invite((select hh from ctx), 5, 1, true);
grant select on inv2 to authenticated;
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
select is((public.join_household((select code from inv2)) ->> 'status'), 'pending', 'approval invite -> pending');
select is((select count(*)::int from households), 0, 'pending member cannot read household');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select public.revoke_invite((select invite_id from inv2));
select pg_temp.as_admin();
delete from invite_attempts;
insert into auth.users (id, email) values ('e0000000-0000-0000-0000-00000000000e', 'eva@test.no');
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e');
select is((public.join_household((select code from inv2)) ->> 'error'), 'invalid', 'revoked code rejected');

-- ------------------------------------------------------ last admin protection --
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.leave_household((select hh from ctx)) $$, 'P0001', null,
                 'last admin cannot leave while others remain');
select throws_ok($$ select public.set_member_role((select hh from ctx), auth.uid(), 'member') $$, 'P0001', null,
                 'last admin cannot demote self');

-- account deletion promotes a successor instead of orphaning the household
select pg_temp.as_admin();
delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000a';
select is((select role from household_members
           where household_id = (select hh from ctx) and user_id = 'b0000000-0000-0000-0000-00000000000b'),
          'admin', 'longest-standing member promoted when admin deletes account');

select * from finish();
rollback;
