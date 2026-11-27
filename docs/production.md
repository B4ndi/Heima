# Production checklist

What is in the repo is enforced automatically. The items below are settings on hosted services that code cannot set. Tick them off before the first real users.

## GitHub (`B4ndi/Heima`)
- [ ] Branch protection on `main`: PR required, required checks `App`, `Database`, `Secret scan`, `CodeQL`, no force-push, no deletion
- [ ] Secret scanning + **push protection** on
- [ ] Dependabot alerts + security updates on
- [ ] Private vulnerability reporting on (Settings → Security)
- [ ] Environments `staging` and `production`; `production` with required reviewer
- [ ] Environment secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`

## Supabase (two projects: `heima-staging`, `heima-prod`, both **EU region**)
- [ ] MFA on every Supabase dashboard account; least-privilege org roles
- [ ] Deploy schema only via the `Deploy database` workflow
- [ ] Auth → URL configuration: Site URL `heimvis://`, redirect allowlist exactly `heimvis://auth-callback` (no wildcards)
- [ ] Auth → Email: confirm email ON, OTP length 8, expiry 900 s, secure email change ON
- [ ] Auth → Email templates: paste `supabase/templates/otp.html` into *Confirm signup* and *Magic link* (code only, no link)
- [ ] Auth → Bot protection: Cloudflare Turnstile ON (add the site key to the app when enabled)
- [ ] Auth → Sessions: inactivity timeout 30 days; refresh token reuse detection ON
- [ ] Auth → Providers: disable every provider not in use (phone, anonymous, OAuth)
- [ ] Auth → Rate limits: review defaults (OTP send / verify)
- [ ] Custom SMTP (e.g. Postmark/Resend EU) with SPF, DKIM and DMARC (`p=quarantine` or stricter) on the sending domain
- [ ] Database → Network restrictions: restrict direct DB access to known IPs (API traffic is unaffected)
- [ ] Database → SSL enforcement ON
- [ ] Database → pg_cron enabled (retention job `heima-purge-old-data`)
- [ ] Realtime → "Allow public access" OFF (private channels only)
- [ ] Backups: PITR (Pro) or daily backups verified with a restore test
- [ ] Advisors (Security + Performance) show no warnings
- [ ] Sign the Supabase DPA; list Supabase (and the SMTP provider) as data processors in the privacy policy

## App / EAS
- [ ] `eas.json` profiles with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` per environment (publishable key only)
- [ ] EAS Update **code signing** (`npx expo-updates codesigning:generate`), private key kept outside the repo
- [x] Universal links (iOS): `site/.well-known/apple-app-site-association` and `associatedDomains` in `app.json`
- [ ] App Links (Android): `assetlinks.json` with the Play signing certificate fingerprint, and `intentFilters` in `app.json`
- [ ] Fill in controller name and contact in `src/app/personvern.tsx`
- [ ] App Store / Play privacy labels: e-mail (account), user content; no tracking

## Ongoing
- Review Dependabot PRs weekly; Expo SDK upgrades at least twice a year
- Re-run the threat model when adding a feature that adds a table, RPC or external integration
