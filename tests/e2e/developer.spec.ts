import { expect, test } from '@playwright/test';

test('painel bloqueia senha inválida e isola a partida de teste dos recordes', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('neonswarm.v1', '{"version":1,"highScore":10,"bestWave":1}'));
  await page.reload();
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByTestId('arena')).toBeVisible();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByRole('dialog', { name: 'Acesso do operador' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('alert')).toHaveText('Senha inválida.');
  await page.getByLabel('Senha', { exact: true }).fill('Aldebaran');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  const panel = page.getByRole('dialog', { name: 'Painel de desenvolvimento' });
  await panel.getByRole('combobox', { name: /avançar para uma onda/i }).selectOption('8');
  await panel.getByRole('group', { name: /rank de/i }).getByRole('button', { name: '5' }).click();
  await expect(panel.getByRole('group', { name: /rank de/i }).getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'true');
  const health = Number((await page.getByTestId('health').innerText()).split('/')[0]);
  for (let i = 0; i < Math.ceil(health / 10); i++) {
    await panel.getByRole('button', { name: '−10' }).click();
  }
  await panel.getByRole('button', { name: 'Fechar painel' }).first().click();
  await expect(page.getByText('MODO TESTE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Fim de jogo' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('neonswarm.v1')!))).toEqual({ version: 1, highScore: 10, bestWave: 1 });
  await page.getByRole('button', { name: 'Jogar novamente' }).click();
  await expect(page.getByText('MODO TESTE', { exact: true })).toHaveCount(0);
});

test('cinco toques no logotipo abrem o painel em landscape', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 896, height: 414 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('./');
    for (let i = 0; i < 5; i++) await page.locator('#rebirth-title').tap();
    await page.getByLabel('Senha', { exact: true }).fill('Aldebaran');
    await page.getByRole('button', { name: 'Desbloquear' }).tap();
    const panel = page.getByRole('dialog', { name: 'Painel de desenvolvimento' });
    await panel.getByRole('button', { name: 'Drone', exact: true }).tap();
    await expect(panel.getByText('INIMIGOS 1')).toBeVisible();
    await panel.getByRole('button', { name: 'Fechar painel' }).first().tap();
    await expect(page.getByText('MODO TESTE', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(896);
  } finally {
    await context.close();
  }
});
