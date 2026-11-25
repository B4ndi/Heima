# Threat model: Heimvis

Method: STRIDE per component and trust boundary. Baselines: OWASP MASVS L1 (app), OWASP API Security Top 10 2023 (backend), GDPR (data).

## Assets

| Asset | Why it matters |
|---|---|
| Household content (posts, comments, lists, events, chores) | Private life of people living together |
| Membership & roles | Control who can read the household and moderate it |
| Who voted what in anonymous polls | Social harm if revealed to housemates |
| Invite codes | Grant access to a household |
| Session tokens (access + refresh) | Full account takeover |
| E-mail addresses | Personal data (GDPR) |

## Actors

- **Member**: honest user; may be curious about anonymous votes or try to become admin.
- **Ex-member / removed member**: still holds a session and old IDs.
- **Outsider with an account**: anyone can sign up; tries to read or join other households (IDOR, brute force).
- **Anonymous internet**: no account; holds the public anon key (it is in the app bundle).
- **Device thief / malware on device**: tries to read the stored session.
- **Supply-chain attacker**: compromises a dependency or CI action.

## Trust boundaries

```
 Device (untrusted client)  ──TLS──▶  Supabase API gateway  ──▶  PostgREST / Realtime / Auth / Storage
                                                                     │  (runs as role anon / authenticated)
                                                                     ▼
                                                    Postgres: RLS + grants + RPCs  ◀── trust boundary
                                                                     ▲
                                Edge Function (service role) ────────┘  only: delete-account
```

The **database is the only place authorisation is decided**. Every request from the app is treated as hostile.

## STRIDE

| # | Threat | Component | Mitigation | Verified by |
|---|---|---|---|---|
| S1 | Account takeover via phished/intercepted sign-in link | Auth | One-time **codes** instead of magic links: no token in any URL or deep link. 8 digits, 15 min TTL, single use, Auth rate limits, CAPTCHA on hosted | config.jsonc, email template |
| S2 | Session theft from device storage | App | Session encrypted with AES-256-GCM; key in Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, excluded from backups); tampered data discarded | `src/lib/secureStorage.ts` |
| S3 | Long-lived stolen refresh token | Auth | Refresh-token rotation + reuse detection, 1 h JWT, 30-day inactivity timeout | config.jsonc |
| S4 | Spoofing another user as author | DB | `author_id`/`created_by` default `auth.uid()`, **not in INSERT grant**, WITH CHECK repeats it | pgTAP 003 "cannot spoof post author" |
| T1 | Moving rows to another household / editing identity columns | DB | Column-level UPDATE grants exclude `household_id`, authors, `role`, timestamps | pgTAP 001 #8, 003 |
| T2 | Child row attached to another household's parent | DB | Composite FKs `(parent_id, household_id)` | pgTAP 003 "composite FK" |
| T5 | Abuse via reactions (spoofing, spam, free text) | DB | `user_id` = `auth.uid()` (not insertable), fixed 6-emoji allowlist, one row per user+emoji, own-only delete | pgTAP 004 |
| T3 | Tampered chore rotation (non-members, index jumps) | DB | Trigger validates rotation ⊆ active members; `rotation_index` not client-writable | pgTAP 003 |
| T4 | Malicious OTA update | App | EAS Update code signing | `docs/production.md` |
| R1 | Admin abuses moderation without trace | DB | Append-only `audit_log` written only by SECURITY DEFINER code; admins can read | migration 0100 |
| I1 | **IDOR: reading another household's data** | DB | RLS (enabled **and forced**) on every table via `private.is_member()`; anon has zero grants | pgTAP 001 #1–3, 003 (14 cross-household checks), curl abuse tests |
| I2 | Revealing anonymous votes | DB/Realtime | RLS hides other users' rows in anonymous polls; tallies only via `poll_results()`; realtime sends **no row data** | pgTAP 003 "anonymous poll" |
| I3 | Leaking data over Realtime | Realtime | Private channels; `realtime.messages` policy requires membership; payload = `{table, op, id}` only | pgTAP 003 realtime check |
| I4 | Reading invite codes from DB/backups | DB | Only SHA-256 hash stored; hash column not selectable | pgTAP 001 #9, 002 |
| I5 | Error messages leak schema | App | `userMessage()` maps DB errors to generic Norwegian messages | unit test `errors.test.ts` |
| I6 | Secret key shipped in app | App/CI | `env.ts` refuses `sb_secret_`/service-role JWT at startup; gitleaks in CI; push protection | `src/lib/env.ts` |
| I7 | Avatar enumeration | Storage | Private bucket, signed URLs, readable only by housemates | storage policies |
| I8 | Location leak via photo metadata | App | Avatars re-encoded to a 512 px JPEG on the phone before upload, which strips EXIF (GPS, device serial) | `pickAndUploadAvatar` |
| D1 | Brute-forcing invite codes | DB | 50-bit codes; 5 failures / 15 min / user then lockout (failures are committed, not rolled back); expiry ≤ 7 d; use limits | pgTAP 002, curl test 6 |
| D2 | Resource abuse (huge payloads, many rows) | DB/API | Length CHECKs on all text; max 10 households/user, 30 members/household, 10 active invites, 10 poll options; `max_rows` 500 | constraints |
| D3 | Sign-up / OTP flooding | Auth | Supabase Auth rate limits + Turnstile CAPTCHA (hosted) | `docs/production.md` |
| E1 | Member makes self admin | DB | No grants on `household_members`; role changes only via `set_member_role()` which requires admin | pgTAP 002 |
| E2 | Last admin leaves → ungoverned household | DB | RPCs refuse; account-deletion trigger promotes successor | pgTAP 002 |
| E3 | `SECURITY DEFINER` search_path hijack | DB | Every definer function has `set search_path = ''` and qualified names | pgTAP 001 #5 (schema-wide invariant) |
| E4 | Calling internal helpers via API | DB | Helpers in non-exposed `private` schema; EXECUTE revoked from PUBLIC globally | pgTAP 001 #4, #6; curl test 3 |
| E5 | Ex-member keeps access | DB | Access is evaluated per query from `household_members`; removed from rotations | pgTAP 003 "ex-member loses access" |
| E6 | Compromised CI action / dependency | CI | Actions pinned by SHA; `permissions: contents: read`; Dependabot; `npm audit`; CodeQL; prod deploy needs environment approval | `.github/` |

## Accepted risks / out of scope

- **No certificate pinning.** Pinning in an Expo app breaks on certificate rotation by the hosting provider and needs native config. TLS + platform trust store covers MASVS L1. Revisit for L2.
- **Root/jailbreak detection**: not required at L1; a compromised OS defeats Keychain anyway.
- **Insider at Supabase / DB superuser**: can read everything. Mitigated contractually (DPA) and by EU hosting; end-to-end encryption is out of scope for v1.
- **Housemates screenshotting content**: inherent to sharing.
- **PostgREST error hints** (e.g. "GRANT SELECT ON …") reveal table names to authenticated clients. The schema is not secret (open design); no data is exposed.
- **Web build** is for development only and keeps the session in `sessionStorage`.
