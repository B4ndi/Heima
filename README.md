# Heima

App som gjør bokollektiv enklere: oppslagstavle, avstemninger, felles handlelister, kalender og vaskeliste for husstanden. Inviter beboere med en kode eller lenke.

**Stack:** Expo (React Native, TypeScript) · Supabase (Postgres, Auth, Realtime, Storage) in the EU · TanStack Query · zod

**Security first.** Every authorisation rule lives in Postgres (RLS + grants + RPCs) and is covered by automated tests. See [docs/threat-model.md](docs/threat-model.md), [docs/architecture.md](docs/architecture.md) and [SECURITY.md](SECURITY.md).

## Features

| Tab | What |
|---|---|
| Oppslag | Message board with comments; admins can pin |
| Avstemninger | Polls, single or multiple choice, optionally anonymous, with a deadline |
| Handleliste | Shared lists; tick off in the shop; shows who bought what |
| Kalender | Shared events |
| Vaskeliste | Recurring chores that rotate between members |
| Innstillinger | Members and roles, invites (code/link, optional approval), switch household, data export, account deletion |

## Local development

Requires Node 22 and Docker.

```bash
npm ci
npx supabase start              # local Postgres/Auth/Realtime/Storage
cp .env.example .env.local      # fill in the publishable key from `npx supabase status`
npm start                       # Expo dev server (press i / a / w)
```

Sign-in codes from the local stack appear in Mailpit (http://127.0.0.1:54324).

## Tests

```bash
npm run typecheck && npm run lint && npm test    # app
npx supabase test db                             # 79 pgTAP security tests
npx supabase db lint --fail-on warning
npx supabase db advisors --fail-on warn
node e2e/smoke.mjs                               # two-user E2E against `npm run web`
```

CI runs all of these except E2E on every PR, plus CodeQL, gitleaks and `npm audit`.

## Deploying

The schema reaches staging and production only through the **Deploy database** workflow (manual, with approval for production). Before launch, work through [docs/production.md](docs/production.md).
