# heimvis.no

Static website (no build step, no JavaScript) served by **Cloudflare Pages**.

Pages: home, `/personvern/` (privacy), `/vilkar/` (terms), `/support/`, `/.well-known/security.txt`.

Universal links: `/.well-known/apple-app-site-association` (served as `application/json` by `_headers`) lets the iOS app open `https://heimvis.no/bli-med/CODE`. Without the app, `_redirects` rewrites those URLs to the fallback page `/bli-med/` (noindex, not cached). The AASA must be served from the apex without redirects.
Security headers are in `_headers` (strict CSP, HSTS, no framing).

## Setup (once)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `B4ndi/heimvis`.
2. Production branch `main`, framework preset *None*, build command empty, **build output directory `site`**.
3. The domain is registered at **Domeneshop**. Cloudflare Pages can only serve the apex (`heimvis.no`) when the zone's DNS is on Cloudflare, so:
   - Cloudflare → Add a domain → `heimvis.no` (Free plan). Cloudflare imports the existing records; check them.
   - Domeneshop → Mine domener → heimvis.no → Navnetjenere: replace with the two Cloudflare nameservers. The registration stays at Domeneshop.
   - Email: if Domeneshop forwarded mail, recreate it with Cloudflare Email Routing (free) for `support@` and `security@`. Keep the SPF/DKIM/DMARC records for Resend (`docs/production.md`).
4. Pages project → Custom domains → add `heimvis.no` and `www.heimvis.no`.
5. Every push to `main` deploys; PRs get preview URLs.

## Before App Store submission

- Fill in the `[...]` placeholders in `personvern/` and `vilkar/` (ROADMAP 1.4, 1.5). Keep the privacy text in sync with `src/app/personvern.tsx`.
- Make `support@heimvis.no` and `security@heimvis.no` real mailboxes.
- Renew `Expires` in `security.txt` before it lapses.
- Android App Links: add `.well-known/assetlinks.json` (needs the Play signing certificate fingerprint).
