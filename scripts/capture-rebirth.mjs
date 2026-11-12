import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const server = await createServer({ server: { host: '127.0.0.1', port: 4186, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = 'http://127.0.0.1:4186';
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1260, height: 1040 } });
  await page.goto(base);
  await page.getByRole('button', { name: 'JOGAR', exact: true }).waitFor();
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await page.screenshot({ path: out + '/menu.jpg', fullPage: true, quality: 88 });
  await page.getByRole('button', { name: 'JOGAR', exact: true }).click();
  await page.getByTestId('arena').waitFor();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(820);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: out + '/inicio.jpg', fullPage: true, quality: 88 });
  await page.route('**/__capture', route => route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta charset=utf-8><body style="background:#080c12;color:white;font:20px sans-serif;margin:22px;text-align:center"><h1 id=caption></h1><canvas width=960 height=720></canvas>'}));
  for (const [name, file, label] of [
    ['horda','horde-123','Horda avançada · Estação Íon'],
    ['rainha','boss-123','Rainha de Cromo · Estação Íon'],
  ]) {
    const state = JSON.parse(readFileSync('.hivemind/rebirth-capture/' + file + '.json','utf8'));
    await page.goto(base + '/__capture');
    await page.evaluate(async ({ state, label }) => {
      const { loadArenaArt } = await import('/src/ui/rebirth-art.ts');
      const { drawRebirth } = await import('/src/ui/rebirth-render.ts');
      const art = await loadArenaArt(state.run.biome);
      document.querySelector('h1').textContent = label + ' · ' + Math.floor(state.time) + ' s';
      drawRebirth(document.querySelector('canvas').getContext('2d'), state, art, false);
    }, { state, label });
    await page.screenshot({ path: out + '/' + name + '.jpg', quality: 88 });
  }
  const clip = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  await clip.goto(base);
  await clip.getByRole('button', { name: 'JOGAR', exact: true }).click();
  await clip.getByTestId('arena').waitFor();
  const recording = clip.getByTestId('arena').evaluate(async canvas => {
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 8500));
    recorder.stop();
    await done;
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  for (const direction of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']) {
    await clip.keyboard.down(direction);
    await clip.waitForTimeout(1700);
    await clip.keyboard.up(direction);
  }
  await clip.keyboard.press('Space');
  writeFileSync(out + '/partida.webm', Buffer.from(await recording));
} finally {
  await browser.close();
  await server.close();
}
