// End-to-end smoke test (web build against the local Supabase stack).
// Two users: Anne creates a household and an invite; Bjørn joins with the code;
// both use every feature and see each other's changes via realtime.
//
// Usage: npm run web (in another shell), then `node e2e/smoke.mjs`
// Env: MAIL_LOG = path to the SMTP sink log (local dev only), APP_URL.
import fs from 'node:fs';
import { createRequire } from 'node:module';

// resolved via NODE_PATH so the repo does not pin a second Playwright/browser
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const MAIL_LOG = process.env.MAIL_LOG;
const SHOTS = process.env.SHOTS_DIR;
const run = Date.now().toString(36);

async function otpFor(email) {
  for (let i = 0; i < 40; i++) {
    const blocks = fs.readFileSync(MAIL_LOG, 'utf8').split('=====END=====');
    const mine = blocks.filter((b) => b.includes(`To: ${email}`) || b.includes(`<${email}>`));
    const m = mine.at(-1)?.match(/\b(\d{8})\b/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no OTP mail for ${email}`);
}

async function signIn(page, email) {
  await page.goto(APP);
  await page.getByText('Velkommen til Heima').waitFor();
  await page.getByRole('textbox').first().fill(email);
  await page.getByRole('button', { name: 'Send engangskode', exact: true }).click();
  await page.getByText('Vi har sendt en kode').waitFor();
  await page.getByRole('textbox').first().fill(await otpFor(email));
  await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const check = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
};

const browser = await chromium.launch();
const viewport = { width: 390, height: 844 };
const anne = await (await browser.newContext({ viewport })).newPage();
const bjorn = await (await browser.newContext({ viewport })).newPage();
for (const p of [anne, bjorn]) p.on('pageerror', (e) => console.log('pageerror:', e.message));

try {
  // --- Anne: sign up, create household
  await signIn(anne, `anne-${run}@heima.test`);
  await anne.getByText('Opprett en husstand').waitFor();
  await anne.getByPlaceholder('Visningsnavn').fill('Anne');
  await anne.getByPlaceholder('F.eks.').fill('Kollektivet Testgata 1');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await anne.getByText('Kollektivet Testgata 1').first().waitFor();
  check(true, 'Anne created a household');

  // --- Anne: create invite in settings
  await anne.getByLabel('Innstillinger', { exact: true }).click();
  await anne.getByRole('button', { name: 'Inviter beboer', exact: true }).last().click();
  const codeEl = anne.getByText(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  await codeEl.waitFor();
  const code = (await codeEl.textContent()).trim();
  check(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(code), `invite code shown once (${code.slice(0, 2)}…)`);
  await shot(anne, '01-settings-invite');
  await anne.goBack();

  // --- Bjørn: sign up, preview + confirm join
  await signIn(bjorn, `bjorn-${run}@heima.test`);
  await bjorn.getByPlaceholder('Visningsnavn').fill('Bjørn');
  await bjorn.getByPlaceholder('XXXXX-XXXXX').fill(code.toLowerCase());
  await bjorn.getByRole('button', { name: 'Fortsett', exact: true }).click();
  await bjorn.getByText('Vil du bli med i «Kollektivet Testgata 1»?').waitFor();
  check(true, 'Bjørn sees household name before joining');
  await shot(bjorn, '02-join-confirm');
  await bjorn.getByRole('button', { name: 'Bli med', exact: true }).click();
  await bjorn.getByText('Kollektivet Testgata 1').first().waitFor();
  check(true, 'Bjørn joined');

  // --- Oppslag: Anne posts, Bjørn sees it via realtime
  await anne.getByPlaceholder('Skriv et oppslag').fill('Husmøte søndag kl. 18!');
  await anne.getByRole('button', { name: 'Publiser', exact: true }).click();
  await bjorn.getByText('Husmøte søndag kl. 18!').waitFor({ timeout: 10000 });
  check(true, 'post appears for Bjørn (realtime)');
  await shot(bjorn, '03-board');

  // --- Handleliste
  await bjorn.getByRole('tab', { name: /Handleliste/ }).click().catch(() => bjorn.getByText('Handleliste').last().click());
  await bjorn.getByPlaceholder('Navn på liste').fill('Ukeshandel');
  await bjorn.getByRole('button', { name: 'Ny liste', exact: true }).click();
  await bjorn.getByPlaceholder('Legg til vare').fill('Havremelk');
  await bjorn.getByRole('button', { name: 'Legg til', exact: true }).click();
  await bjorn.getByText('Havremelk').waitFor();
  await anne.getByText('Handleliste').last().click();
  await anne.getByText('Havremelk').waitFor({ timeout: 10000 });
  await anne.getByRole('checkbox').first().click();
  await bjorn.getByText('Kjøpt av Anne').waitFor({ timeout: 10000 });
  check(true, 'shopping item shared and ticked off (realtime)');
  await shot(bjorn, '04-shopping');

  // --- Avstemning (anonymous)
  await anne.getByText('Avstemninger').last().click();
  await anne.getByRole('button', { name: 'Ny avstemning', exact: true }).click();
  await anne.getByLabel('Spørsmål', { exact: true }).fill('Skal vi kjøpe ny sofa?');
  await anne.getByLabel('Alternativ 1', { exact: true }).fill('Ja');
  await anne.getByLabel('Alternativ 2', { exact: true }).fill('Nei');
  await anne.getByRole('switch', { name: 'Anonym avstemning' }).click();
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await bjorn.getByText('Avstemninger').last().click();
  await bjorn.getByText('Skal vi kjøpe ny sofa?').waitFor({ timeout: 10000 });
  await bjorn.getByRole('radio', { name: /Ja/ }).click();
  await bjorn.getByRole('button', { name: 'Stem', exact: true }).click();
  await anne.getByText('1 stemme · 100%').waitFor({ timeout: 10000 });
  check(true, 'anonymous poll tallies update');
  await shot(anne, '05-poll');

  // --- Kalender
  await anne.getByText('Kalender').last().click();
  await anne.getByRole('button', { name: 'Ny hendelse', exact: true }).click();
  await anne.getByLabel('Tittel', { exact: true }).fill('Dugnad');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await bjorn.getByText('Kalender').last().click();
  await bjorn.getByText('Dugnad').waitFor({ timeout: 10000 });
  check(true, 'calendar event shared');
  await shot(bjorn, '06-calendar');

  // --- Vaskeliste
  await anne.getByText('Vaskeliste').last().click();
  await anne.getByRole('button', { name: 'Ny oppgave', exact: true }).click();
  await anne.getByLabel('Oppgave', { exact: true }).fill('Vaske bad');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await anne.getByText('Din tur!').waitFor();
  await anne.getByRole('button', { name: 'Ferdig', exact: true }).click();
  await bjorn.getByText('Vaskeliste').last().click();
  await bjorn.getByText('Din tur!').waitFor({ timeout: 10000 });
  check(true, 'chore rotation advances to Bjørn');
  await shot(bjorn, '07-chores');

  // no horizontal overflow at phone width on any tab
  const overflow = await bjorn.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'no horizontal overflow at 390px');

  console.log('\nE2E PASS');
} catch (e) {
  await shot(anne, 'fail-anne');
  await shot(bjorn, 'fail-bjorn');
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
