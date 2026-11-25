-- =============================================================================
-- Heima: realtime, avatars storage, push tokens, GDPR export, retention
-- =============================================================================

-- ------------------------------------------------------------------ Realtime --
-- Private broadcast channel per household: topic "household:<uuid>".
-- Payloads are notification-only ({table, op, id}); clients re-fetch through
-- RLS. Row data is never broadcast, so anonymous votes, invites and other
-- RLS-restricted columns cannot leak over the socket.

create function private.topic_household(topic text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when topic ~ '^household:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(topic, 11)::uuid
  end;
$$;
grant execute on function private.topic_household(text) to authenticated;

create policy household_members_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.is_member(private.topic_household((select realtime.topic()))))
  );
-- no INSERT policy: clients cannot broadcast into a household channel

create function private.notify_household()
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

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'polls', 'poll_votes', 'shopping_lists',
                           'shopping_items', 'events', 'chores', 'chore_completions',
                           'household_members']
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.notify_household()', t || '_notify', t);
  end loop;
end $$;

-- ------------------------------------------------------------------- Avatars --
-- Private bucket, 2 MB, images only. Path: "<user_id>/<file>". Owners write
-- their own folder; housemates can read (via short-lived signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.avatar_owner(object_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;
grant execute on function private.avatar_owner(text) to authenticated;

create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and (private.avatar_owner(name) = (select auth.uid())
              or (select private.shares_household(private.avatar_owner(name)))));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()))
  with check (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));

-- profiles.avatar_path must point into the user's own folder
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or private.avatar_owner(avatar_path) = id);

-- --------------------------------------------------------------- Push tokens --
create table public.push_tokens (
  token      text primary key check (char_length(token) between 10 and 200),
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
alter table public.push_tokens force  row level security;

create policy push_tokens_own_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_own_delete on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.push_tokens to authenticated;

-- A device token belongs to whoever is signed in on that device now.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_uid();
begin
  if (select count(*) from public.push_tokens where user_id = uid and token <> p_token) >= 10 then
    delete from public.push_tokens
     where token = (select token from public.push_tokens where user_id = uid
                    order by updated_at limit 1);
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, uid, p_platform)
  on conflict (token) do update set user_id = uid, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- --------------------------------------------------------------- GDPR export --
-- Art. 15/20: everything stored about the caller, as JSON. Runs as the caller's
-- identity; reads only rows the caller authored or that are about them.
create function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object(
                      'household', h.name, 'role', m.role, 'status', m.status, 'joined_at', m.joined_at))
                    from public.household_members m join public.households h on h.id = m.household_id
                    where m.user_id = uid), '[]'),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('body', body, 'created_at', created_at))
              from public.posts where author_id = uid), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('body', body, 'created_at', created_at))
                 from public.post_comments where author_id = uid), '[]'),
    'poll_votes', coalesce((select jsonb_agg(jsonb_build_object('poll', p.question, 'option', o.label,
                                                                'created_at', v.created_at))
                   from public.poll_votes v
                   join public.poll_options o on o.id = v.option_id
                   join public.polls p on p.id = v.poll_id
                   where v.user_id = uid), '[]'),
    'events_created', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'starts_at', starts_at))
                       from public.events where created_by = uid), '[]'),
    'shopping_items_added', coalesce((select jsonb_agg(jsonb_build_object('text', text, 'created_at', created_at))
                             from public.shopping_items where added_by = uid), '[]'),
    'chore_completions', coalesce((select jsonb_agg(jsonb_build_object('chore', c.title, 'at', cc.completed_at))
                          from public.chore_completions cc join public.chores c on c.id = cc.chore_id
                          where cc.completed_by = uid), '[]'),
    'push_devices', (select count(*) from public.push_tokens where user_id = uid)
  );
end;
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ----------------------------------------------------------------- Retention --
create function private.purge_old_data()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.invite_attempts   where attempted_at < now() - interval '1 day';
  delete from public.invites           where expires_at   < now() - interval '30 days';
  delete from public.shopping_items    where checked and checked_at < now() - interval '12 months';
  delete from public.chore_completions where completed_at < now() - interval '12 months';
  delete from public.audit_log         where created_at   < now() - interval '24 months';
  delete from public.push_tokens       where updated_at   < now() - interval '6 months';
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('heima-purge-old-data', '17 3 * * *', 'select private.purge_old_data()');
exception when others then
  raise notice 'pg_cron unavailable (%), schedule private.purge_old_data() manually', sqlerrm;
end $$;

-- ------------------------------------------------------- Final privilege sweep --
-- Belt and braces: nothing in private is callable except the RLS helpers.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid)         to authenticated;
grant execute on function private.is_admin(uuid)          to authenticated;
grant execute on function private.shares_household(uuid)  to authenticated;
grant execute on function private.topic_household(text)   to authenticated;
grant execute on function private.avatar_owner(text)      to authenticated;
