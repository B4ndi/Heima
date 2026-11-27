# Roadmap: to the App Store

Goal: Heimvis in the App Store as soon as possible, at the lowest cost that keeps it up.

## 0. Decisions for the owner (before the first App Store build)

These are hard or impossible to change later.

- [x] **App name**: **Heimvis** (2026-11-25). "Heima" was taken by two household apps. Still to do: reserve the name by creating the app in App Store Connect, and search Patentstyret for "heimvis".
- [x] **Bundle ID**: `no.heimvis.app` (deep-link scheme `heimvis://`). Permanent once registered.
- [ ] **Apple account type**: personal (your name shown as seller) or organisation (needs an org. number and a D-U-N-S number, 1–2 weeks).
- [x] **Domain**: `heimvis.no`. Used for the email sender, the website, invite links (universal links) and `security.txt`.
- [x] **Age limit**: **13+** (2026-11-27), the GDPR consent age in Norway.

## 1. Required before App Store submission

| # | Item | Why | Size |
|---|---|---|---|
| 1.1 | ✅ **Report and block** (posts and comments; block a housemate) | Apple guideline 1.2 for user-generated content | M (migration, RLS, tests, UI) |
| 1.2 | **App Review login** | Reviewers cannot read your inbox for the OTP | S–M |
| 1.3 | **Website**: home, privacy, terms, support; `security.txt`; AASA/assetlinks | Apple needs privacy and support URLs; GDPR; ehandelsloven § 8 | M |
| 1.4 | **Privacy policy completed**: controller, processors (Supabase, Resend, Expo, Sentry), transfer basis, age | GDPR art. 13 | S |
| 1.5 | **Terms of use** | Content rules, account termination, liability | S |
| 1.6 | **EAS setup**: `eas.json` profiles (dev/preview/prod), env per profile, update code signing, `runtimeVersion` policy | Signing must be in the first build | M |
| 1.7 | **Universal links** on the domain (`associatedDomains`) | Invite links that can't be hijacked by other apps | S |
| 1.8 | **App Store assets**: icon, screenshots, description (nb/en), privacy labels, age rating (13+; the "Zoot"/"Påfyll" chore easter egg is a neutral cloud card with no drug references) | Store listing | M |
| 1.9 | **TestFlight** round with real flatmates | Find bugs before review | — |

Done: 1.1 (2026-11-25). Report reasons are a fixed list; admins see reports (not the reporter), except reports about themselves; support contact is `support@heimvis.no` in `src/constants/support.ts` (placeholder until the mailbox exists, see 1.3).

## 2. Cheap now, expensive later

| # | Item | Why now |
|---|---|---|
| 2.1 | ✅ `households.timezone` (default `Europe/Oslo`); "today" for chores computed in it | The DB uses UTC today, so completing a chore just after midnight counts for the wrong day. Needed for reminders. |
| 2.2 | Separate environments: dev (local), staging (free Supabase org), prod (Supabase Pro) | Prod must never contain test data |
| 2.3 | Crash reporting (Sentry, EU, no PII, `sendDefaultPii: false`) | Otherwise we're blind after launch |
| 2.4 | `export_my_data` includes reactions and avatar path | GDPR art. 15 completeness |
| 2.5 | Date and time pickers instead of typed `YYYY-MM-DD` | UX; affects every form |

In progress: 1.6. `eas.json` (preview/production), EAS Update with a `preview` channel published from `main` (see `docs/testing.md`). Still to do: update code signing, build-based `runtimeVersion` policy, first native build.

Done: 2.1 (2026-11-25). Admins change the zone in Settings; the app's "overdue" uses the same zone.

## 3. After launch / when needed

- Push notifications (new post/poll/event, chore reminders, per-user preferences)
- Sign in with Apple and Google (optional; not required with email-only login)
- Android in Google Play
- Shared expenses
- Organisation-level analytics (privacy-friendly, cookieless)

## Running costs (minimum that stays up)

| Service | Cost |
|---|---|
| Apple Developer Program | ~1 100 kr/year |
| Supabase Pro (prod only; staging in a free org) | $25/month |
| EAS free tier (builds and updates) | 0 |
| Resend free tier (3 000 emails/month) | 0 |
| Domain | ~150–200 kr/year |
| Cloudflare Pages (website) | 0 |
| Sentry free tier | 0 |
| Google Play (optional) | $25 once |

**About 300 kr/month plus about 1 300 kr/year.** Note: free Supabase projects pause after a week of inactivity, so prod must be on Pro.
