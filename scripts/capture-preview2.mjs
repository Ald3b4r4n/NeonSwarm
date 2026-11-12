import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = await preview({ preview: { host: '127.0.0.1', port: 4188, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const out = 'docs/preview2';
mkdirSync(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 896, height: 414 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const base = 'http://127.0.0.1:4188/';
  const shot = name => page.screenshot({ path: out + '/' + name + '.jpg', quality: 85, scale: 'css' });
  await page.goto(base);
  const play = page.getByRole('button', { name: /^jogar$/i });
  await play.waitFor();
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))));
  await shot('menu');
  await play.tap();
  const arena = page.getByTestId('arena');
  await arena.waitFor();
  await page.waitForTimeout(2200);
  for (const [width, height] of [[780, 360], [896, 414], [915, 412]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await shot('landscape-' + width + 'x' + height);
  }
  const openPanel = async () => {
    await page.locator('.touch-actions button[aria-label="Pausar"]').tap();
    await page.keyboard.press('Control+Shift+D');
    await page.getByLabel('Senha', { exact: true }).fill('Aldebaran');
    await page.getByRole('button', { name: 'Desbloquear' }).tap();
    return page.getByRole('dialog', { name: 'Painel de desenvolvimento' });
  };
  const resume = async panel => {
    await panel.getByRole('button', { name: 'Fechar painel' }).first().tap();
    await page.getByRole('button', { name: 'Retomar', exact: true }).last().tap();
  };
  const panel = await openPanel();
  await panel.getByRole('checkbox', { name: /invencibilidade/i }).check();
  await panel.locator('select').filter({ has: page.locator('option', { hasText: 'Onda 8' }) }).selectOption('8');
  await panel.getByRole('group', { name: /rank de/i }).getByRole('button', { name: '1', exact: true }).tap();
  await shot('painel');
  for (let i = 0; i < 12; i++) await panel.getByRole('button', { name: 'Bruto', exact: true }).tap();
  await resume(panel);
  const record = arena.evaluate(canvas => {
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    window.endPreviewRecording = () => recorder.stop();
    recorder.start();
    return new Promise(resolve => {
      recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);
    });
  });
  await page.waitForTimeout(2800);
  await shot('bobina-rank-1');
  const advanced = await openPanel();
  await advanced.getByRole('group', { name: /rank de/i }).getByRole('button', { name: '5', exact: true }).tap();
  await advanced.getByRole('button', { name: 'Rainha', exact: true }).tap();
  await resume(advanced);
  await page.waitForTimeout(1700);
  const upgrade = page.getByRole('heading', { name: 'Escolha sua evolução' });
  if (await upgrade.isVisible()) {
    await shot('upgrade');
    await page.locator('.upgrades button').first().tap();
  }
  await shot('bobina-rank-5-rainha');
  const measured = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    let start = 0, last = 0;
    const sample = now => {
      if (!start) start = now;
      if (last) frames.push(now - last);
      last = now;
      if (now - start < 4500) return requestAnimationFrame(sample);
      frames.sort((a, b) => a - b);
      resolve({ count: frames.length, seconds: (now - start) / 1000, fps: +(frames.length * 1000 / (now - start)).toFixed(1), p95FrameMs: +frames[Math.floor(frames.length * .95)].toFixed(1), enemies: document.querySelector('[data-testid="enemy-count"]')?.textContent ?? null });
    };
    requestAnimationFrame(sample);
  }));
  console.log(JSON.stringify(measured));
  await page.evaluate(() => window.endPreviewRecording());
  writeFileSync(out + '/evolucao-bobina.webm', Buffer.from(await record));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
