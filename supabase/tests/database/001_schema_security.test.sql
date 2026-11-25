-- Schema-wide security invariants. These fail the build if a future migration
-- forgets RLS, leaks a grant to anon, or adds an unsafe SECURITY DEFINER function.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- 1. Every table in public has RLS enabled AND forced
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  null,
  'every public table has RLS enabled and forced'
);

-- 2. anon has no table privileges anywhere in public
select is(
  (select array_agg(distinct table_name::text) from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  null,
  'anon has no table grants in public'
);

-- 3. ... nor column privileges
select is(
  (select array_agg(distinct table_name::text) from information_schema.column_privileges
   where grantee = 'anon' and table_schema = 'public'),
  null,
  'anon has no column grants in public'
);

-- 4. anon cannot execute any function in public or private
select is(
  (select array_agg(p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and has_function_privilege('anon', p.oid, 'execute')),
  null,
  'anon cannot execute any public/private function'
);

-- 5. Every SECURITY DEFINER function pins its search_path
select is(
  (select array_agg(p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                     where cfg like 'search_path=%')),
  null,
  'every SECURITY DEFINER function sets search_path'
);

-- 6. authenticated can execute only the intended private helpers
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['is_member', 'is_admin', 'shares_household', 'topic_household', 'avatar_owner'],
  'authenticated may only call the RLS helper functions in private'
);

-- 7. Tables that must only change through RPCs have no write grants
select is(
  (select array_agg(distinct table_name::text || ':' || privilege_type::text)
   from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('household_members', 'invites', 'invite_attempts', 'audit_log',
                        'polls', 'poll_options', 'poll_votes', 'chore_completions', 'households',
                        'content_reports')
     and privilege_type in ('INSERT', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  null,
  'RPC-only tables have no direct INSERT grants'
);
select is(
  (select array_agg(distinct table_name::text || '.' || column_name::text)
   from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
     and column_name in ('household_id', 'author_id', 'created_by', 'added_by', 'user_id',
                         'role', 'status', 'created_at', 'checked_by', 'checked_at', 'pinned',
                         'rotation_index', 'completed_by', 'id')),
  null,
  'identity / ownership columns are never client-updatable'
);

-- 8. invite code hashes are never readable by clients
select ok(
  not has_column_privilege('authenticated', 'public.invites', 'code_hash', 'select'),
  'invites.code_hash is not selectable'
);

select * from finish();
rollback;
