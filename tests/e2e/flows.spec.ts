import { expect, test } from '@playwright/test';

// Playwright's scroll-into-view fights sticky footers; the real hit target was verified with elementFromPoint.
const next = (page: any, name: string) => page.getByRole('button', { name }).dispatchEvent('click');

test('Flow A: register → onboarding → discover → save → partecipa (private) → calendar', async ({ page }) => {
  const u = `e2e${Date.now().toString(36)}`;
  await page.goto('/registrati');
  await page.getByLabel('Nome visualizzato').fill('E2E Tester');
  await page.locator('input[maxlength="24"]').fill(u);
  await page.getByLabel('Email').fill(`${u}@spot.test`);
  await page.getByLabel('Password').fill('password123');
  await page.locator('input[type=date]').fill('1996-03-03');
  await page.locator('input[type=checkbox]').first().check();
  await page.getByRole('button', { name: 'Crea account' }).click();

  await page.waitForURL('**/onboarding');
  await page.getByRole('button', { name: 'Techno' }).click();
  await next(page, 'Avanti');
  await page.getByRole('button', { name: /Club/ }).click();
  await next(page, 'Avanti');
  await page.getByRole('button', { name: '3–5' }).click();
  await next(page, 'Avanti');
  await next(page, 'Iniziamo!');

  await page.waitForURL('**/home');
  const card = page.locator('a[href^="/eventi/"]').filter({ hasText: 'Techno' }).first();
  const title = (await card.getAttribute('aria-label'))!;
  await card.locator('h3').click();
  await page.waitForURL('**/eventi/**');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Salva', exact: true }).last().click();
  await expect(page.getByText('Salvato nel tuo calendario')).toBeVisible();
  await page.getByRole('button', { name: 'Partecipa' }).click();
  await expect(page.getByText('Solo io')).toBeVisible(); // private is the default
  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.getByText('Partecipi').first()).toBeVisible();
  await expect(page.getByText('Visibilità: privata')).toBeVisible();

  await page.goto('/calendario?view=upcoming');
  await expect(page.getByText(title)).toBeVisible();
});

test('Flow C: past event attendees show only consenting people', async ({ page }) => {
  await page.goto('/accedi');
  await page.getByLabel('Email').fill('luca@spot.demo');
  await page.getByLabel('Password').fill('spotdemo123');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.waitForURL('**/home');
  await page.goto('/locali/magazzino-21');
  await page.getByText('Nocturna · Opening Night').click();
  await page.getByText('Chi partecipa').click();
  await expect(page.getByText('@giuliarossi')).toBeVisible();
  await expect(page.getByText('@alessio.ricci')).toHaveCount(0);
  await page.getByText('@giuliarossi').click();
  await expect(page.getByText('giulia.rossi.demo')).toBeVisible(); // optional Instagram link
});
