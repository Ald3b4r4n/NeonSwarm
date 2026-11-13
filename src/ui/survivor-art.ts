import type { Vec2 } from '../game/contracts.js';

export function drawSurvivor(ctx: CanvasRenderingContext2D, art: HTMLImageElement, pos: Vec2,
  direction: Vec2, time: number, moving: boolean, firing: boolean, hurt: boolean, fall: number) {
  const step = moving ? Math.sin(time * 17) : 0;
  const height = 72;
  const width = height * art.naturalWidth / art.naturalHeight;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.fillStyle = '#070d15a8';
  ctx.beginPath();
  ctx.ellipse(2, 8, 21, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(-direction.x * (firing ? 3 : 0), step * 2 - direction.y * (firing ? 3 : 0));
  ctx.scale(direction.x < -.08 ? -1 : 1, 1);
  ctx.rotate(step * .035 + fall * 1.25);
  ctx.globalAlpha *= 1 - fall * .46;
  if (hurt) ctx.filter = 'brightness(1.6) sepia(.35)';
  ctx.drawImage(art, -width / 2, 12 - height, width, height);
  ctx.restore();
}
