-- =============================================================================
-- Heima: invites
--
--   * Codes: 10 chars from a 32-symbol alphabet without look-alikes
--     (0, 1, I, O excluded) = 50 bits of entropy, from gen_random_bytes (CSPRNG).
--     256 is a multiple of 32, so `byte % 32` is unbiased.
--   * Only SHA-256(code) is stored; the plaintext is returned once to the admin.
--   * Codes expire (default 48 h, max 7 days), have a use limit, can be revoked.
--   * Redeeming and previewing are rate limited per user: 5 failures per
--     15 minutes. Failures are recorded by returning (not raising), so the
--     attempt row is committed. All failures look the same to the caller.
-- =============================================================================

create table public.invites (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  code_hash         bytea not null unique,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  max_uses          int not null check (max_uses between 1 and 20),
  uses              int not null default 0 check (uses >= 0),
  requires_approval boolean not null default false,
  revoked_at        timestamptz,
  check (uses <= max_uses),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index invites_household_idx on public.invites (household_id);

create table public.invite_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, attempted_at desc);

alter table public.invites         enable row level security;
alter table public.invites         force  row level security;
alter table public.invite_attempts enable row level security;
alter table public.invite_attempts force  row level security;

-- Admins can list invites (without the hash). invite_attempts: no client access at all.
create policy invites_select on public.invites for select to authenticated
  using ((select private.is_admin(household_id)));
grant select (id, household_id, created_by, created_at, expires_at, max_uses, uses,
              requires_approval, revoked_at)
  on public.invites to authenticated;

-- -----------------------------------------------------------------------------
create function private.normalize_code(p_code text)
returns text
language sql immutable set search_path = ''
as $$
  select left(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 32);
$$;

create function private.hash_code(p_code text)
returns bytea
language sql immutable set search_path = ''
as $$
  select extensions.digest(private.normalize_code(p_code), 'sha256');
$$;

create function private.invite_rate_limited(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select count(*) >= 5
  from public.invite_attempts
  where user_id = uid and not success and attempted_at > now() - interval '15 minutes';
$$;

-- 32 distinct symbols: A-Z without I and O (24) + digits 2-9 (8).
-- Asserted below: a duplicate or missing symbol would bias the modulo mapping.
create function private.invite_alphabet()
returns text
language sql immutable set search_path = ''
as $$ select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'::text $$;

do $$
declare a text := private.invite_alphabet();
begin
  -- 32 chars and no duplicates, otherwise the modulo mapping is biased
  if char_length(a) <> 32
     or (select count(distinct ch) from regexp_split_to_table(a, '') ch) <> 32 then
    raise exception 'invite alphabet must be 32 distinct characters';
  end if;
end $$;

-- -----------------------------------------------------------------------------
create function public.create_invite(
  p_household uuid,
  p_max_uses int default 5,
  p_valid_hours int default 48,
  p_requires_approval boolean default false
)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  raw   bytea;
  c     text := '';
  inv   uuid;
  exp   timestamptz;
begin
  if not private.is_admin(p_household) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 20 then
    raise exception 'Antall bruk må være 1–20' using errcode = '22023';
  end if;
  if p_valid_hours is null or p_valid_hours not between 1 and 168 then
    raise exception 'Gyldighet må være 1–168 timer' using errcode = '22023';
  end if;
  if (select count(*) from public.invites
      where household_id = p_household and revoked_at is null
        and invites.expires_at > now() and uses < max_uses) >= 10 then
    raise exception 'For mange aktive invitasjoner. Trekk tilbake en først.' using errcode = 'P0001';
  end if;

  raw := extensions.gen_random_bytes(10);
  for i in 0..9 loop
    c := c || substr(private.invite_alphabet(), (get_byte(raw, i) % 32) + 1, 1);
  end loop;

  exp := now() + make_interval(hours => p_valid_hours);
  insert into public.invites (household_id, code_hash, created_by, expires_at, max_uses, requires_approval)
  values (p_household, private.hash_code(c), uid, exp, p_max_uses, coalesce(p_requires_approval, false))
  returning id into inv;

  perform private.audit(p_household, 'invite.create', inv,
    jsonb_build_object('max_uses', p_max_uses, 'valid_hours', p_valid_hours,
                       'requires_approval', coalesce(p_requires_approval, false)));

  invite_id := inv;
  code := substr(c, 1, 5) || '-' || substr(c, 6, 5);   -- display form, e.g. K7QXM-3FHRA
  expires_at := exp;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
create function public.revoke_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  hh uuid;
begin
  perform private.require_uid();
  select household_id into hh from public.invites where id = p_invite;
  if hh is null or not private.is_admin(hh) then
    raise exception 'Krever admin' using errcode = '42501';
  end if;
  update public.invites set revoked_at = now() where id = p_invite and revoked_at is null;
  perform private.audit(hh, 'invite.revoke', p_invite);
end;
$$;

-- -----------------------------------------------------------------------------
-- Look up a usable invite by code. Internal.
create function private.find_invite(p_code text, p_lock boolean)
returns public.invites
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites;
begin
  if p_lock then
    select * into inv from public.invites
     where code_hash = private.hash_code(p_code)
       and revoked_at is null and expires_at > now() and uses < max_uses
     for update;
  else
    select * into inv from public.invites
     where code_hash = private.hash_code(p_code)
       and revoked_at is null and expires_at > now() and uses < max_uses;
  end if;
  return inv;
end;
$$;

-- Preview: show which household a code belongs to before the user confirms.
-- Counts as an attempt for rate limiting.
create function public.preview_invite(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  inv public.invites;
begin
  if private.invite_rate_limited(uid) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  inv := private.find_invite(p_code, false);
  if inv.id is null then
    insert into public.invite_attempts (user_id, success) values (uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object(
    'ok', true,
    'household_name', (select name from public.households where id = inv.household_id),
    'member_count', (select count(*) from public.household_members
                     where household_id = inv.household_id and status = 'active'),
    'requires_approval', inv.requires_approval
  );
end;
$$;

create function public.join_household(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid    uuid := private.require_uid();
  inv    public.invites;
  st     text;
begin
  if private.invite_rate_limited(uid) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  inv := private.find_invite(p_code, true);
  if inv.id is null then
    insert into public.invite_attempts (user_id, success) values (uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.invite_attempts (user_id, success) values (uid, true);

  if exists (select 1 from public.household_members
             where household_id = inv.household_id and user_id = uid) then
    select status into st from public.household_members
     where household_id = inv.household_id and user_id = uid;
    return jsonb_build_object('ok', true, 'household_id', inv.household_id, 'status', st);
  end if;

  if (select count(*) from public.household_members where user_id = uid) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_households');
  end if;
  if (select count(*) from public.household_members where household_id = inv.household_id) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'household_full');
  end if;

  st := case when inv.requires_approval then 'pending' else 'active' end;
  insert into public.household_members (household_id, user_id, role, status)
  values (inv.household_id, uid, 'member', st);
  update public.invites set uses = uses + 1 where id = inv.id;

  insert into public.audit_log (household_id, actor_id, action, target_id, meta)
  values (inv.household_id, uid, 'member.join', uid,
          jsonb_build_object('invite_id', inv.id, 'status', st));

  return jsonb_build_object('ok', true, 'household_id', inv.household_id, 'status', st);
end;
$$;

-- -----------------------------------------------------------------------------
revoke all on function public.create_invite(uuid, int, int, boolean) from public, anon;
revoke all on function public.revoke_invite(uuid)                     from public, anon;
revoke all on function public.preview_invite(text)                    from public, anon;
revoke all on function public.join_household(text)                    from public, anon;
grant execute on function public.create_invite(uuid, int, int, boolean) to authenticated;
grant execute on function public.revoke_invite(uuid)                     to authenticated;
grant execute on function public.preview_invite(text)                    to authenticated;
grant execute on function public.join_household(text)                    to authenticated;
