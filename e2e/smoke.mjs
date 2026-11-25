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
  await page.getByText('Velkommen til Heimvis').waitFor();
  await page.getByRole('textbox').first().fill(email);
  await page.getByRole('button', { name: 'Send engangskode', exact: true }).click();
  await page.getByText('Vi har sendt en kode').waitFor();
  await page.getByRole('textbox').first().fill(await otpFor(email));
  await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
}

const shot = async (page, name) => {
  // every screen we capture must fit a 390 px phone without sideways scrolling
  const overflow = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right)) - window.innerWidth,
  );
  if (overflow > 1) throw new Error(`FAIL: ${name} overflows horizontally by ${Math.round(overflow)}px`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
};

const browser = await chromium.launch();
const viewport = { width: 390, height: 844 };
const locale = 'nb-NO'; // the app follows the device language
const anne = await (await browser.newContext({ viewport, locale })).newPage();
const bjorn = await (await browser.newContext({ viewport, locale })).newPage();
for (const p of [anne, bjorn]) p.on('pageerror', (e) => console.log('pageerror:', e.message));

try {
  // Visited tabs stay mounted (just hidden), so after switching we wait for the
  // URL to change instead of trusting that some text is on screen.
  const PATHS = { Hjem: '/', Oppslag: '/oppslag', Avstemning: '/avstemninger', Handleliste: '/handleliste', Kalender: '/kalender', Vaskeliste: '/vaskeliste' };
  const tab = async (page, name) => {
    const byRole = page.getByRole('tab', { name, exact: false });
    if (await byRole.count()) await byRole.first().click();
    else await page.getByRole('link', { name }).last().click();
    await page.waitForURL((u) => new URL(u).pathname === PATHS[name]);
  };
  const visible = (loc) => loc.filter({ visible: true }).first();

  // --- Anne: sign up, create household -> lands on Home
  await signIn(anne, `anne-${run}@heimvis.test`);
  await visible(anne.getByText('Opprett en husstand')).waitFor();
  await anne.getByPlaceholder('Visningsnavn').fill('Anne');
  await anne.getByPlaceholder('F.eks.').fill('Kollektivet Testgata 1');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await visible(anne.getByText('Hei, Anne!')).waitFor();
  check(true, 'Anne created a household and sees Home');
  await shot(anne, '00-home-empty');

  // --- Anne: create invite in settings (opened from her avatar)
  await visible(anne.getByLabel('Innstillinger', { exact: true })).click();
  await anne.getByRole('button', { name: 'Inviter beboer', exact: true }).last().click();
  const codeEl = anne.getByText(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  await codeEl.waitFor();
  const code = (await codeEl.textContent()).trim();
  check(true, `invite code shown once (${code.slice(0, 2)}…)`);
  await shot(anne, '01-settings');
  await anne.goBack();

  // --- Bjørn: sign up, preview + confirm join
  await signIn(bjorn, `bjorn-${run}@heimvis.test`);
  await bjorn.getByPlaceholder('Visningsnavn').fill('Bjørn');
  await bjorn.getByPlaceholder('XXXXX-XXXXX').fill(code.toLowerCase());
  await bjorn.getByRole('button', { name: 'Fortsett', exact: true }).click();
  await visible(bjorn.getByText('Vil du bli med i «Kollektivet Testgata 1»?')).waitFor();
  await bjorn.getByRole('button', { name: 'Bli med', exact: true }).click();
  await visible(bjorn.getByText('Hei, Bjørn!')).waitFor();
  check(true, 'Bjørn joined');

  // --- Oppslag: Anne posts, Bjørn reacts, Anne edits
  await tab(anne, 'Oppslag');
  await anne.getByPlaceholder('Skriv et oppslag').fill('Husmøte søndag kl. 18!');
  await anne.getByRole('button', { name: 'Publiser', exact: true }).click();
  await tab(bjorn, 'Oppslag');
  await visible(bjorn.getByText('Husmøte søndag kl. 18!')).waitFor({ timeout: 10000 });
  check(true, 'post appears for Bjørn (realtime)');
  await bjorn.getByRole('button', { name: 'Reager', exact: true }).first().click();
  await bjorn.getByRole('button', { name: '❤️', exact: true }).click();
  await anne.getByRole('button', { name: /^❤️ 1\./ }).waitFor({ timeout: 10000 });
  check(true, 'reaction shows up for Anne (realtime)');
  await anne.getByRole('button', { name: 'Rediger', exact: true }).last().click(); // last = the active tab's
  await anne.getByLabel('Rediger oppslag', { exact: true }).fill('Husmøte søndag kl. 19!');
  await anne.getByRole('button', { name: 'Lagre', exact: true }).click();
  await visible(bjorn.getByText('Husmøte søndag kl. 19!')).waitFor({ timeout: 10000 });
  check(true, 'edited post updates for Bjørn');
  await anne.goBack();
  await shot(bjorn, '02-board');

  // --- Handleliste
  await tab(bjorn, 'Handleliste');
  await bjorn.getByRole('button', { name: '+ Ny liste', exact: true }).click();
  await bjorn.getByPlaceholder('Navn på liste').fill('Ukeshandel');
  await bjorn.getByRole('button', { name: 'Opprett', exact: true }).click();
  await bjorn.getByPlaceholder('Legg til vare').fill('Havremelk');
  await bjorn.getByRole('button', { name: 'Legg til', exact: true }).click();
  await bjorn.getByRole('checkbox', { name: 'Havremelk' }).waitFor();
  await tab(anne, 'Handleliste');
  await anne.getByRole('checkbox', { name: 'Havremelk' }).click({ timeout: 10000 });
  await visible(bjorn.getByText('Kjøpt av Anne')).waitFor({ timeout: 10000 });
  check(true, 'shopping item shared and ticked off (realtime)');
  await shot(bjorn, '03-shopping');

  // --- Avstemning (anonymous)
  await tab(anne, 'Avstemning');
  await anne.getByRole('button', { name: 'Ny avstemning', exact: true }).click();
  await anne.getByLabel('Spørsmål', { exact: true }).fill('Skal vi kjøpe ny sofa?');
  await anne.getByLabel('Alternativ 1', { exact: true }).fill('Ja');
  await anne.getByLabel('Alternativ 2', { exact: true }).fill('Nei');
  await anne.getByRole('switch', { name: 'Anonym avstemning' }).click();
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await tab(bjorn, 'Avstemning');
  await visible(bjorn.getByText('Skal vi kjøpe ny sofa?')).waitFor({ timeout: 10000 });
  await bjorn.getByRole('radio', { name: 'Ja' }).click();
  await bjorn.getByRole('button', { name: 'Stem', exact: true }).click();
  await visible(anne.getByText('100%')).waitFor({ timeout: 10000 });
  check(true, 'anonymous poll tallies update');
  await shot(anne, '04-polls');

  // --- Kalender: create, then edit
  await tab(anne, 'Kalender');
  await anne.getByRole('button', { name: 'Ny hendelse', exact: true }).click();
  await anne.getByLabel('Tittel', { exact: true }).fill('Dugnad');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await tab(bjorn, 'Kalender');
  await visible(bjorn.getByText('Dugnad')).waitFor({ timeout: 10000 });
  await anne.getByRole('button', { name: 'Rediger', exact: true }).last().click(); // last = the active tab's
  await anne.getByLabel('Tittel', { exact: true }).fill('Dugnad i hagen');
  await anne.getByRole('button', { name: 'Lagre', exact: true }).click();
  await visible(bjorn.getByText('Dugnad i hagen')).waitFor({ timeout: 10000 });
  check(true, 'calendar event created and edited (month view)');
  await shot(bjorn, '05-calendar');

  // --- Vaskeliste
  await tab(anne, 'Vaskeliste');
  await anne.getByRole('button', { name: 'Ny oppgave', exact: true }).click();
  await anne.getByLabel('Oppgave', { exact: true }).fill('Vaske bad');
  await anne.getByRole('button', { name: 'Opprett', exact: true }).click();
  await visible(anne.getByText('Din tur!')).waitFor();
  await anne.getByRole('button', { name: 'Ferdig', exact: true }).last().click();
  await tab(bjorn, 'Vaskeliste');
  await visible(bjorn.getByText('Din tur!')).waitFor({ timeout: 10000 });
  check(true, 'chore rotation advances to Bjørn');
  await shot(bjorn, '06-chores');

  // --- Home shows Bjørn's chore and the event
  await tab(bjorn, 'Hjem');
  await visible(bjorn.getByText('Vaske bad')).waitFor({ timeout: 10000 });
  await visible(bjorn.getByText('Dugnad i hagen')).waitFor({ timeout: 10000 });
  check(true, 'Home summarises chores and events');
  await shot(bjorn, '07-home');

  // --- Report and block (App Store guideline 1.2)
  const gone = async (page, text) => {
    for (let i = 0; i < 40; i++) {
      if ((await page.getByText(text).filter({ visible: true }).count()) === 0) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`FAIL: "${text}" still visible`);
  };
  // Hidden tabs stay mounted, so several copies of a header button exist; click the one on top.
  const clickTop = async (loc) => {
    for (const el of await loc.all()) {
      try {
        await el.click({ trial: true, timeout: 500 });
        return el.click();
      } catch {
        // covered by another screen; try the next copy
      }
    }
    throw new Error('FAIL: no clickable element');
  };
  const settings = async (page) => {
    await clickTop(page.getByLabel('Innstillinger', { exact: true }));
    await page.waitForURL((u) => new URL(u).pathname === '/innstillinger');
  };
  const report = async (page, author, reason, details) => {
    await clickTop(page.getByRole('button', { name: `Flere valg: ${author}`, exact: true }));
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/rapporter');
    await page.getByRole('button', { name: reason, exact: true }).click();
    if (details) await page.getByLabel('Fortell mer (valgfritt)', { exact: true }).fill(details);
    await page.getByRole('button', { name: 'Send rapport', exact: true }).click();
    await visible(page.getByText('Takk! Rapporten er sendt')).waitFor();
  };

  await tab(bjorn, 'Oppslag');
  await bjorn.getByPlaceholder('Skriv et oppslag').fill('Selger billige klokker!');
  await bjorn.getByRole('button', { name: 'Publiser', exact: true }).click();
  await tab(anne, 'Oppslag');
  await visible(anne.getByText('Selger billige klokker!')).waitFor({ timeout: 10000 });
  await report(anne, 'Bjørn', 'Spam', 'Reklame i oppslagene');
  await shot(anne, '08-report');
  await anne.getByRole('button', { name: 'Lukk', exact: true }).click();
  check(true, 'Anne reported Bjørn\'s post');

  // Bjørn reports Anne (the only admin): she must never see that report
  await report(bjorn, 'Anne', 'Trakassering eller mobbing');
  await bjorn.getByRole('button', { name: 'Lukk', exact: true }).click();
  check(true, 'Bjørn reported Anne\'s post');

  await settings(bjorn);
  check((await bjorn.getByText('Rapportert innhold').filter({ visible: true }).count()) === 0, 'members do not see the reports view');
  check(await bjorn.getByText('Tidssone: Europe/Oslo').filter({ visible: true }).count(), 'members see the household time zone');
  check(await bjorn.getByRole('button', { name: 'Kontakt support', exact: true }).count(), 'support contact is in Settings');
  await bjorn.goBack();

  await settings(anne);
  check((await anne.getByLabel('Tidssone', { exact: true }).inputValue()) === 'Europe/Oslo', 'admin sees the time zone (default Europe/Oslo)');
  await visible(anne.getByText('«Reklame i oppslagene»')).waitFor({ timeout: 10000 });
  check((await anne.getByText('Trakassering eller mobbing').filter({ visible: true }).count()) === 0,
    'the reported admin does not see the report about herself');
  await shot(anne, '09-reports-admin');
  await anne.getByRole('button', { name: 'Slett innhold', exact: true }).click();
  await visible(anne.getByText('Ingen åpne rapporter.')).waitFor({ timeout: 10000 });
  await gone(bjorn, 'Selger billige klokker!');
  check(true, 'admin deleted the reported post; gone for Bjørn too (realtime)');
  await anne.goBack();

  // Block: Anne stops seeing Bjørn's posts; Bjørn still sees them
  await bjorn.getByPlaceholder('Skriv et oppslag').fill('Hei igjen fra Bjørn');
  await bjorn.getByRole('button', { name: 'Publiser', exact: true }).click();
  await visible(anne.getByText('Hei igjen fra Bjørn')).waitFor({ timeout: 10000 });
  await clickTop(anne.getByRole('button', { name: 'Flere valg: Bjørn', exact: true }));
  await anne.getByRole('button', { name: 'Blokker Bjørn', exact: true }).click();
  await anne.getByRole('button', { name: 'Blokker', exact: true }).click();
  await gone(anne, 'Hei igjen fra Bjørn');
  await bjorn.waitForTimeout(500);
  check(await bjorn.getByText('Hei igjen fra Bjørn').filter({ visible: true }).count(), 'blocked: hidden for Anne, still there for Bjørn');

  await settings(anne);
  await anne.getByRole('button', { name: 'Opphev blokkering av Bjørn', exact: true }).click();
  await visible(anne.getByText('Du har ikke blokkert noen.')).waitFor({ timeout: 10000 });
  await shot(anne, '10-unblocked');
  await anne.goBack();
  await visible(anne.getByText('Hei igjen fra Bjørn')).waitFor({ timeout: 10000 });
  check(true, 'unblock from Settings shows the posts again');

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
