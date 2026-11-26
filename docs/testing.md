# Testing on a phone (no local setup)

Every merge to `main` publishes the app to the EAS Update channel **`preview`**
(`.eas/workflows/publish-preview.yml`, run by Expo through the Expo GitHub app).
The preview build talks to the **staging** Supabase project.

## One-time setup (done)
- Expo project `b4ndi/heima` (slug `heima`; the app is still named Heimvis) linked to this GitHub repository.
- EAS environment **preview** on expo.dev: `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_KEY` (staging URL and **publishable** key only).
- Staging Supabase auth: OTP length 8, expiry 900 s, `supabase/templates/otp.html`
  in *Confirm signup* and *Magic link* (see `docs/production.md`).

## Open the latest version
1. Install **Expo Go** on the phone.
2. expo.dev → project **heima** → **Updates** → newest update on the `preview` branch.
3. Scan its QR code with the phone camera; it opens in Expo Go.

Expo Go only loads updates whose runtime matches its SDK (`runtimeVersion.policy`
is `sdkVersion` for this reason). If Expo Go says the project is incompatible,
the App Store version of Expo Go has moved to a newer SDK: test with an internal
build (`eas build --profile preview`) or TestFlight instead (ROADMAP 1.6).

## Notes
- Updates are not code-signed yet. Code signing and a build-based
  `runtimeVersion` policy come with the first native build (ROADMAP 1.6).
- Never put a `sb_secret_` / service-role key in an EAS environment variable:
  `EXPO_PUBLIC_*` values are inlined into the bundle, and `src/lib/env.ts`
  refuses to start with one.
