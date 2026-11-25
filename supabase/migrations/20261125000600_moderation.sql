-- =============================================================================
-- Heimvis: report and block (App Store guideline 1.2, user-generated content)
--
--   * content_reports: a member reports a post or a comment. Rows are written
--     only by report_content() / resolve_report() (SECURITY DEFINER), so the
--     reported author is derived on the server and can never be spoofed.
--   * Who can read a report:
--       - the reporter (their own reports only), and
--       - admins of the household, EXCEPT the reported user. A report about an
--         admin is never visible to that admin (the support address is the
--         escalation path for that case).
--     reporter_id is not in the column grant: admins see what was reported and
--     why, not by whom. In a flat of four people that is the difference
--     between reporting and not reporting.
--   * user_blocks: hides the blocked housemate's posts and comments from the
--     blocker, enforced in RLS so every query (lists, counts, Home) agrees.
--     Both ends reference household_members, so a block can only name a
--     housemate and disappears when either person leaves the household.
--   * Realtime: a household-wide doorbell would tell the reported or blocked
--     user that "something" happened. These tables ring a per-user topic
--     ("user:<uuid>") instead: reports ring the admins who may read them,
--     blocks ring only the blocker. Payloads stay {table, op, id}.
-- =============================================================================

-- Comments need an (id, household_id) key for the composite FK below.
alter table public.post_comments
  add constraint post_comments_id_household_key unique (id, household_id);

-- -------------------------------------------------------------- Reports ----
create table public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  reporter_id      uuid default auth.uid() references auth.users (id) on delete set null,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  post_id          uuid,
  comment_id       uuid,
  reason           text not null
                   check (reason in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'other')),
  details          text check (details is null or char_length(btrim(details)) between 1 and 500),
  status           text not null default 'open' check (status in ('open', 'resolved')),
  resolution       text check (resolution in ('dismissed', 'content_deleted', 'member_removed')),
  resolved_by      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1),
  check ((status = 'open') = (resolution is null)),
  check ((status = 'open') = (resolved_at is null)),
  -- the reported item must live in the report's household; deleting it removes the report
  foreign key (post_id, household_id) references public.posts (id, household_id) on delete cascade,
  foreign key (comment_id, household_id) references public.post_comments (id, household_id) on delete cascade
);
create index content_reports_household_idx on public.content_reports (household_id, status, created_at desc);
create index content_reports_post_idx on public.content_reports (post_id) where post_id is not null;
create index content_reports_comment_idx on public.content_reports (comment_id) where comment_id is not null;
create index content_reports_reporter_idx on public.content_reports (reporter_id, created_at desc);
-- one open report per reporter and item
create unique index content_reports_open_post_uq on public.content_reports (reporter_id, post_id)
  where status = 'open' and post_id is not null;
create unique index content_reports_open_comment_uq on public.content_reports (reporter_id, comment_id)
  where status = 'open' and comment_id is not null;

alter table public.content_reports enable row level security;
alter table public.content_reports force  row level security;

create policy reports_select on public.content_reports for select to authenticated
  using (
    (reporter_id = (select auth.uid()) and (select private.is_member(household_id)))
    or ((select private.is_admin(household_id)) and reported_user_id <> (select auth.uid()))
  );
-- No INSERT/UPDATE/DELETE grants: writes only through the RPCs below.
grant select (id, household_id, reported_user_id, post_id, comment_id, reason, details,
              status, resolution, resolved_by, resolved_at, created_at)
  on public.content_reports to authenticated;

-- --------------------------------------------------------------- Blocks ----
create table public.user_blocks (
  household_id uuid not null,
  blocker_id   uuid not null default auth.uid(),
  blocked_id   uuid not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, blocker_id, blocked_id),
  check (blocker_id <> blocked_id),
  foreign key (household_id, blocker_id)
    references public.household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, blocked_id)
    references public.household_members (household_id, user_id) on delete cascade
);
create index user_blocks_blocked_idx on public.user_blocks (household_id, blocked_id);

alter table public.user_blocks enable row level security;
alter table public.user_blocks force  row level security;

-- Only the blocker ever sees a block: the blocked person is not told.
create policy blocks_select on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()) and (select private.is_member(household_id)));
create policy blocks_delete on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

grant select, delete on public.user_blocks to authenticated;
grant insert (household_id, blocked_id) on public.user_blocks to authenticated;

-- Hide blocked housemates' posts and comments from the blocker.
drop policy posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ((select private.is_member(household_id))
         and not exists (select 1 from public.user_blocks b
                         where b.household_id = posts.household_id
                           and b.blocker_id = (select auth.uid())
                           and b.blocked_id = posts.author_id));

drop policy comments_select on public.post_comments;
create policy comments_select on public.post_comments for select to authenticated
  using ((select private.is_member(household_id))
         and not exists (select 1 from public.user_blocks b
                         where b.household_id = post_comments.household_id
                           and b.blocker_id = (select auth.uid())
                           and b.blocked_id = post_comments.author_id));

-- ----------------------------------------------------------------- RPCs ----
create function public.report_content(p_kind text, p_target uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid    uuid := private.require_uid();
  hh     uuid;
  author uuid;
  det    text := nullif(btrim(coalesce(p_details, '')), '');
  rid    uuid;
begin
  if p_kind = 'post' then
    select household_id, author_id into hh, author from public.posts where id = p_target;
  elsif p_kind = 'comment' then
    select household_id, author_id into hh, author from public.post_comments where id = p_target;
  else
    raise exception 'Ugyldig type' using errcode = '22023';
  end if;
  -- same answer for "does not exist" and "not your household"
  if hh is null or not private.is_member(hh) then
    raise exception 'Fant ikke innholdet' using errcode = 'P0002';
  end if;
  if author = uid then
    raise exception 'Du kan ikke rapportere ditt eget innhold' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'other') then
    raise exception 'Ugyldig grunn' using errcode = '22023';
  end if;
  if char_length(det) > 500 then
    raise exception 'For lang beskrivelse' using errcode = '22023';
  end if;

  -- idempotent: reporting the same item twice returns the open report
  select id into rid from public.content_reports
   where reporter_id = uid and status = 'open'
     and (post_id = p_target or comment_id = p_target);
  if rid is not null then
    return rid;
  end if;

  if (select count(*) from public.content_reports
      where reporter_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Du har sendt mange rapporter i dag. Prøv igjen i morgen.' using errcode = 'P0001';
  end if;

  insert into public.content_reports (household_id, reporter_id, reported_user_id, post_id, comment_id, reason, details)
  values (hh, uid, author,
          case when p_kind = 'post' then p_target end,
          case when p_kind = 'comment' then p_target end,
          p_reason, det)
  returning id into rid;
  -- Deliberately not audited: audit_log is readable by admins and would name the reporter.
  return rid;
end;
$$;

-- p_action: 'dismiss' | 'delete_content' | 'remove_member' (also deletes the content)
create function public.resolve_report(p_report uuid, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  r   public.content_reports;
  res text;
begin
  select * into r from public.content_reports where id = p_report for update;
  -- the reported user cannot act on (or learn about) a report about themselves
  if r.id is null or not private.is_admin(r.household_id) or r.reported_user_id = uid then
    raise exception 'Fant ikke rapporten' using errcode = 'P0002';
  end if;
  if r.status <> 'open' then
    raise exception 'Rapporten er allerede behandlet' using errcode = 'P0001';
  end if;
  res := case p_action
           when 'dismiss'        then 'dismissed'
           when 'delete_content' then 'content_deleted'
           when 'remove_member'  then 'member_removed'
         end;
  if res is null then
    raise exception 'Ugyldig handling' using errcode = '22023';
  end if;

  -- one decision closes every open report on the same item
  update public.content_reports
     set status = 'resolved', resolution = res, resolved_by = uid, resolved_at = now()
   where household_id = r.household_id and status = 'open'
     and (post_id = r.post_id or comment_id = r.comment_id);
  -- target is the report, not the person: the audit log is readable by every admin
  perform private.audit(r.household_id, 'report.resolve', r.id, jsonb_build_object('action', p_action));

  if p_action in ('delete_content', 'remove_member') then
    -- the reports on the item go with it (FK cascade): nothing is kept that we don't need
    if r.post_id is not null then
      delete from public.posts where id = r.post_id;
    else
      delete from public.post_comments where id = r.comment_id;
    end if;
  end if;

  if p_action = 'remove_member' then
    delete from public.household_members
     where household_id = r.household_id and user_id = r.reported_user_id;
    if found then
      perform private.remove_from_rotations(r.household_id, r.reported_user_id);
      perform private.audit(r.household_id, 'member.remove', r.reported_user_id);
    end if;
  end if;
end;
$$;

revoke all on function public.report_content(text, uuid, text, text) from public, anon;
revoke all on function public.resolve_report(uuid, text)             from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.resolve_report(uuid, text)             to authenticated;

-- ------------------------------------------------------------- Realtime ----
-- Per-user topic "user:<uuid>": only that user may subscribe. One policy
-- (not two permissive ones) so the planner and the advisors stay happy.
drop policy household_members_receive on realtime.messages;
create policy household_members_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (select private.is_member(private.topic_household((select realtime.topic()))))
      or (select realtime.topic()) = 'user:' || (select auth.uid())::text
    )
  );

create function private.notify_users()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  u   uuid;
begin
  if tg_table_name = 'user_blocks' then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op, 'id', rec ->> 'blocked_id'),
      'change', 'user:' || (rec ->> 'blocker_id'), true);
  elsif tg_table_name = 'content_reports' then
    for u in
      select m.user_id from public.household_members m
       where m.household_id = (rec ->> 'household_id')::uuid
         and m.status = 'active' and m.role = 'admin'
         and m.user_id is distinct from (rec ->> 'reported_user_id')::uuid
    loop
      perform realtime.send(
        jsonb_build_object('table', tg_table_name, 'op', tg_op, 'id', rec ->> 'id'),
        'change', 'user:' || u::text, true);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_users() from public, anon, authenticated;

create trigger content_reports_notify after insert or update or delete on public.content_reports
  for each row execute function private.notify_users();
create trigger user_blocks_notify after insert or update or delete on public.user_blocks
  for each row execute function private.notify_users();

-- ------------------------------------------------------ GDPR and retention --
-- Art. 15: reports you filed and people you blocked are your data too.
create or replace function public.export_my_data()
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
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('reason', reason, 'details', details,
                                                                   'status', status, 'created_at', created_at))
                      from public.content_reports where reporter_id = uid), '[]'),
    'blocked_users', coalesce((select jsonb_agg(jsonb_build_object('household', h.name, 'user', p.display_name,
                                                                   'created_at', b.created_at))
                      from public.user_blocks b
                      join public.households h on h.id = b.household_id
                      left join public.profiles p on p.id = b.blocked_id
                      where b.blocker_id = uid), '[]'),
    'push_devices', (select count(*) from public.push_tokens where user_id = uid)
  );
end;
$$;

-- Resolved reports are kept 12 months (enough to spot a pattern), then purged.
create or replace function private.purge_old_data()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.invite_attempts   where attempted_at < now() - interval '1 day';
  delete from public.invites           where expires_at   < now() - interval '30 days';
  delete from public.shopping_items    where checked and checked_at < now() - interval '12 months';
  delete from public.chore_completions where completed_at < now() - interval '12 months';
  delete from public.content_reports   where status = 'resolved' and resolved_at < now() - interval '12 months';
  delete from public.audit_log         where created_at   < now() - interval '24 months';
  delete from public.push_tokens       where updated_at   < now() - interval '6 months';
$$;
revoke execute on function private.purge_old_data() from public, anon, authenticated;
