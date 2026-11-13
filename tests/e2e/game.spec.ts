import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.location().url + ' ' + message.text()); });
  return errors;
}

async function playerX(page: Page) {
  const raw = await page.locator('[data-player-x]').first().getAttribute('data-player-x');
  if (raw === null || !Number.isFinite(Number(raw))) throw new Error('Posição do jogador ausente.');
  return Number(raw);
}

test('a câmera acompanha Vesper pelo mundo além dos limites da estação anterior', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByTestId('world-name')).toHaveText('Ermos de Íon');
  const initial = await playerX(page);
  await page.keyboard.down('ArrowRight');
  await page.clock.runFor(12000);
  await page.keyboard.up('ArrowRight');
  expect(await playerX(page)).toBeGreaterThan(initial + 1920);
});

test('desktop abre a arena, move com teclado e pausa o relógio', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /neon swarm/i })).toBeVisible();
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByTestId('arena')).toBeVisible();
  const initial = await playerX(page);
  await page.keyboard.down('ArrowRight');
  await page.clock.runFor(650);
  await page.keyboard.up('ArrowRight');
  expect(await playerX(page)).toBeGreaterThan(initial + 15);

  await page.getByRole('button', { name: /pulso/i }).click();
  const afterPulse = await playerX(page);
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(450);
  await page.keyboard.up('ArrowLeft');
  expect(await playerX(page)).toBeLessThan(afterPulse - 15);

  await page.getByRole('button', { name: /pausar/i }).click();
  const paused = await page.getByTestId('time').innerText();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('time')).toHaveText(paused);
  await page.getByRole('button', { name: /retomar/i }).first().click();
  await page.clock.runFor(2200);
  await expect(page.getByTestId('time')).not.toHaveText(paused);
  expect(errors).toEqual([]);
});

test('touch move o jogador numa viewport de 320 px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.clock.install();
    await page.goto('./');
    await page.getByRole('button', { name: /rook/i }).tap();
    await page.getByRole('button', { name: /viveiro rubro/i }).tap();
    await expect(page.getByRole('button', { name: /rook/i })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /viveiro rubro/i })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('button', { name: /^jogar$/i }).tap();
    const arena = page.getByTestId('arena');
    await expect(arena).toBeVisible();
    await page.getByRole('button', { name: 'Seguir no retrato' }).tap();
    const box = await arena.boundingBox();
    if (!box) throw new Error('Arena móvel não visível.');
    const initial = await playerX(page);
    const session = await context.newCDPSession(page);
    const x = box.x + box.width * 0.24;
    const y = box.y + box.height * 0.72;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 64, y, id: 0 }] });
    await page.clock.runFor(600);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await playerX(page)).toBeGreaterThan(initial + 15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('a partida progride, oferece upgrades, causa dano e salva o recorde após a derrota', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.clock.install({ time: new Date('2026-11-11T00:00:00Z') });
  await page.goto('./');
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByTestId('arena')).toBeVisible();
  const startHealth = Number((await page.getByTestId('health').innerText()).split('/')[0]);
  const restart = page.getByRole('button', { name: /jogar novamente/i });
  const upgrades = page.locator('.upgrades button');
  const directions = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  let sawDamage = false;
  let sawUpgrade = false;
  let wave = 1;

  for (let turn = 0; turn < 325 && !(await restart.isVisible()); turn++) {
    const direction = turn < 46 ? directions[Math.floor(turn / 2) % directions.length] : undefined;
    if (direction) await page.keyboard.down(direction);
    await page.clock.runFor(1250);
    if (direction) await page.keyboard.up(direction);
    const health = Number((await page.getByTestId('health').innerText()).split('/')[0]);
    sawDamage ||= health < startHealth;
    wave = Math.max(wave, Number(await page.getByTestId('wave').innerText()));
    if (await upgrades.count()) {
      await expect(upgrades).toHaveCount(3);
      await upgrades.first().click();
      sawUpgrade = true;
    }
  }
  expect(sawDamage).toBe(true);
  expect(sawUpgrade).toBe(true);
  expect(wave).toBeGreaterThan(1);
  await expect(restart).toBeVisible();
  if (process.env.REBIRTH_CAPTURE === "1") await page.screenshot({ path: "docs/screenshots/resultado.jpg", fullPage: true, quality: 88 });
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('neonswarm.v1') ?? 'null'));
  expect(record.highScore).toBeGreaterThan(0);
  await restart.click();
  await expect(page.getByTestId('wave')).toHaveText('01');
  await expect(page.getByTestId('level')).toHaveText('01');
  await page.reload();
  await expect(page.getByTestId('record')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('a seleção informa falha de asset e permite tentar novamente', async ({ page }) => {
  await page.goto('./');
  await page.route('**/art/animated/queen.webp', route => route.abort(), { times: 1 });
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByRole('alert')).toContainText('Falha ao carregar a arena');
  await expect(page.getByTestId('arena')).toBeHidden();
  await page.getByRole('button', { name: /^jogar$/i }).click();
  await expect(page.getByTestId('arena')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
