# Architecture

```
┌──────────────── Expo app (React Native, TypeScript strict) ────────────────┐
│ src/app/            routes (Expo Router), screens only                      │
│ src/features/       data hooks per feature (TanStack Query + zod)           │
│ src/providers/      Auth (session), Household (active household, realtime)  │
│ src/lib/            supabase client, encrypted storage, env, errors         │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ HTTPS, JWT (anon key + user session)
┌───────────────▼──────────────── Supabase (EU region) ───────────────────────┐
│ Auth (email OTP)   PostgREST (public schema)   Realtime   Storage (avatars) │
│                              │                                              │
│            Postgres ── RLS on every table (default deny)                    │
│                     ── column-level grants                                  │
│                     ── SECURITY DEFINER RPCs for multi-step/privileged ops  │
│                     ── private schema: helpers, never exposed               │
│                     ── pg_cron retention job                                │
│ Edge Function: delete-account (service role stays server-side)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Principles

1. **The database is the trust boundary.** UI checks (hiding a delete button) are UX only. Every rule is enforced in Postgres and covered by pgTAP tests.
2. **Default deny.** Default privileges are revoked, so a new table or function is unreachable until a migration grants it explicitly. A schema-wide test fails the build if any table lacks forced RLS, if anon has any grant, or if a definer function lacks a pinned `search_path`.
3. **Least privilege per column.** INSERT/UPDATE grants list columns; ownership and identity columns are never client-writable.
4. **Writes that span rows or encode rules are RPCs**: create household, invites, join, roles, polls/votes, completing chores.
5. **Realtime is a doorbell, not a data channel.** Triggers broadcast `{table, op, id}` to a private per-household topic; the app re-fetches through RLS.
6. **Schema as code.** Migrations in `supabase/migrations/` are applied by CI (`deploy-db.yml`), never by hand in the dashboard.
7. **Privacy by design.** Minimal data (email, display name), EU hosting, export and deletion built in, automatic retention.

## Data flow examples

**Joining a household**: the admin calls `create_invite`, which returns the plaintext code once and stores SHA-256(code). The invitee enters or opens the code; `preview_invite` returns the household name (rate limited), the invitee confirms, and `join_household` re-checks the hash, expiry, uses and rate limit atomically (`FOR UPDATE`). The new member is inserted as `member`, either `active` or `pending`.

**Ticking off a shopping item**: an optimistic UI update, then `UPDATE shopping_items SET checked`. A trigger stamps `checked_by = auth.uid()`, and RLS checks membership. A broadcast trigger notifies `household:<id>`, and the other devices invalidate `['shopping_items', listId]` and re-fetch.

## Repository layout

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, RLS, grants, RPCs (4 files, ordered) |
| `supabase/tests/database/` | pgTAP security tests |
| `supabase/functions/delete-account/` | GDPR erasure (Deno) |
| `supabase/templates/` | Norwegian code-only auth email |
| `src/` | App |
| `e2e/smoke.mjs` | Two-user Playwright smoke test (web build) |
| `docs/` | This file, threat model, production checklist |
