import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function startGame(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /^jogar$/i }).tap();
  await expect(page.getByTestId('arena')).toBeVisible();
}

test('mobile landscape keeps a full-width 3D arena and compact touch HUD at target sizes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 780, height: 360 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.clock.install();
    await startGame(page);

    for (const viewport of [{ width: 780, height: 360 }, { width: 896, height: 414 }, { width: 915, height: 412 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => window.matchMedia('(orientation: landscape) and (pointer: coarse)').matches)).toBe(true);
      const dimensions = await page.evaluate(() => {
        const arena = document.querySelector<HTMLElement>('#arena')!.getBoundingClientRect();
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="arena"]')!.getBoundingClientRect();
        return { arenaHeight: arena.height, canvasWidth: canvas.width, canvasHeight: canvas.height, viewportHeight: innerHeight, viewportWidth: innerWidth, pageWidth: document.documentElement.scrollWidth };
      });
      expect(dimensions.arenaHeight).toBeGreaterThanOrEqual(dimensions.viewportHeight * .75);
      expect(dimensions.canvasHeight).toBeGreaterThanOrEqual(dimensions.viewportHeight * .75);
      expect(dimensions.canvasWidth).toBeGreaterThanOrEqual(dimensions.viewportWidth * .95);
      expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      await expect(page.getByTestId('virtual-controls')).toBeVisible();
      await expect(page.locator('.virtual-joystick')).toBeVisible();
      await expect(page.locator('.touch-actions button[aria-label="Pulso"]')).toBeVisible();
      await expect(page.locator('.touch-actions button[aria-label="Pausar"]')).toBeVisible();
    }

    const joystick = page.locator('.virtual-joystick');
    const bounds = await joystick.boundingBox();
    if (!bounds) throw new Error('Joystick virtual não visível.');
    const session = await context.newCDPSession(page);
    const initial = Number(await page.locator('#arena').getAttribute('data-player-x'));
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + bounds.width * .4, y, id: 0 }] });
    await page.clock.runFor(650);
    const beforeSecondFinger = Number(await page.locator('#arena').getAttribute('data-player-x'));
  const right = x + bounds.width * .4;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right, y, id: 0 }, { x: 450, y: 204, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: right, y, id: 0 }, { x: 390, y: 204, id: 1 }] });
  await page.clock.runFor(240);
  expect(Number(await page.locator('#arena').getAttribute('data-player-x'))).toBeGreaterThan(beforeSecondFinger + 12);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(Number(await page.locator('#arena').getAttribute('data-player-x'))).toBeGreaterThan(initial + 12);

    await page.locator('.touch-actions button[aria-label="Pulso"]').tap();
    await page.locator('.touch-actions button[aria-label="Pausar"]').tap();
    await expect(page.getByRole('heading', { name: 'Pausado' })).toBeVisible();
    await page.getByRole('button', { name: 'Retomar' }).last().tap();
    await expect(page.getByRole('heading', { name: 'Pausado' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('portrait touch offers a rotate prompt and lets the player continue', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.clock.install();
    await startGame(page);
    await expect(page.getByText('MELHOR EM LANDSCAPE')).toBeVisible();
    const prompt = page.getByRole('status');
    await expect(prompt).toContainText('Gire o aparelho');
    await prompt.getByRole('button', { name: 'Seguir no retrato' }).tap();
    await expect(page.getByText('MELHOR EM LANDSCAPE')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
