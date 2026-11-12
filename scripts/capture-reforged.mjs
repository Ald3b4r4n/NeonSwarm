import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = process.env.TEST_BASE_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 4189, strictPort: true } });
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4189/';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const out = 'docs/reforged';
mkdirSync(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  const fetched = new Set();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Unable to compile effect')) {
      errors.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.ok() && /\.glb(?:\?|$)/.test(response.url())) fetched.add(new URL(response.url()).pathname.split('/').pop());
  });
  const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
  const shot = name => page.screenshot({ path: out + '/' + name + '.jpg', quality: 88, scale: 'css' });
  await page.goto(base);
  await button('JOGAR').tap();
  const arena = page.getByTestId('arena');
  await expect(arena).toBeVisible({ timeout: 30000 });
  await expect.poll(() => [...fetched].sort()).toEqual(['drone.glb', 'vesper.glb']);
  await expect(arena).toHaveAttribute('data-renderer', 'babylon-webgl');
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
  await shot('babylon-landscape-915x412');
  await arena.evaluate(canvas => {
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    window.reforgedCapture = () => new Promise(resolve => {
      recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);
      recorder.stop();
    });
    window.reforgedClips = new Set();
    new MutationObserver(() => window.reforgedClips.add(canvas.dataset.playerClip))
      .observe(canvas, { attributes:true, attributeFilter:['data-player-clip'] });
    recorder.start();
  });
  for (const key of ['ArrowRight','ArrowUp','ArrowLeft']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(800);
    await page.keyboard.up(key);
  }
  const panel = page.getByRole('dialog', { name: 'Painel de desenvolvimento' });
  const open = async () => {
    await page.locator('.touch-actions button[aria-label="Pausar"]').tap();
    await page.keyboard.press('Control+Shift+D');
    await page.getByLabel('Senha', { exact: true }).fill('Aldebaran');
    await button('Desbloquear').tap();
    await expect(panel).toBeVisible();
  };
  const resume = async () => {
    await button('Fechar painel', panel).first().tap();
    await button('Retomar').last().tap();
  };
  await open();
  const initialHp = Number((await page.getByTestId('health').textContent()).split('/')[0]);
  for (let i = 0; i < 12; i++) await button('Drone', panel).tap();
  await resume();
  await expect.poll(async () => {
    const upgrade = page.locator('.upgrades button').first();
    if (await upgrade.isVisible()) await upgrade.tap();
    return Number((await page.getByTestId('health').textContent()).split('/')[0]);
  }, { timeout: 20000 }).toBeLessThan(initialHp);
  await expect.poll(() => page.evaluate(() => [...window.reforgedClips])).toContain('hurt');
  for (let rank=1; rank<=5; rank++) {
    if (await page.getByRole('heading', { name: 'Escolha sua evolução' }).isVisible()) await page.locator('.upgrades button').first().tap();
    await open();
    const invincible = panel.getByRole('checkbox', { name: /invencibilidade/i });
    if (!await invincible.isChecked()) await invincible.check();
    const levels = panel.getByRole('group', { name: /rank de/i });
    await button(String(rank), levels).tap();
    for (let i=0; i<4; i++) await button('Drone', panel).tap();
    await resume();
    await page.waitForTimeout(700);
    const upgrade = page.locator('.upgrades button').first();
    if (await upgrade.isVisible()) await upgrade.tap();
    await shot('bobina-' + rank);
  }
  writeFileSync(out + '/babylon-bobina.webm', Buffer.from(await page.evaluate(() => window.reforgedCapture())));
  if (await page.getByRole('heading', { name: 'Escolha sua evolução' }).isVisible()) await page.locator('.upgrades button').first().tap();
  await open();
  await panel.getByRole('checkbox', { name: /congelar inimigos/i }).check();
  await button('Remover arma', panel).tap();
  for (let i=0; i<52; i++) await button('Drone', panel).tap();
  const count = await panel.getByText(/^INIMIGOS \d+$/).textContent();
  if (Number(count.match(/\d+/)?.[0]) < 50) throw new Error('Menos de 50 inimigos');
  await resume();
  await shot('babylon-stress-50');
  const measured = await page.evaluate(() => new Promise(resolve => {
    const frames = []; let start = 0, last = 0;
    const tick = now => {
      start ||= now;
      if (last) frames.push(now-last);
      last = now;
      if (now-start<3000) requestAnimationFrame(tick);
      else resolve({fps: +(frames.length*1000/(now-start)).toFixed(1),p95Ms:+frames.sort((a,b)=>a-b)[Math.floor(frames.length*.95)].toFixed(1)});
    };
    requestAnimationFrame(tick);
  }));
  expect(errors).toEqual([]);
  console.log(JSON.stringify({fetched:[...fetched],count,measured,hurt:true,clips:await page.evaluate(()=>[...window.reforgedClips]),telemetry:await arena.evaluate(c=>({...c.dataset}))}));
} finally {
  await browser.close();
  if(server)await new Promise(resolve=>server.httpServer.close(resolve));
}
