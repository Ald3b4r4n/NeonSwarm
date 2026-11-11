import { ARENA_WIDTH as W, ARENA_HEIGHT as H, type GameState } from '../game/contracts.js';

export function drawArena(ctx: CanvasRenderingContext2D, state: GameState, time: number, attract: boolean, reduced: boolean) {
  const scaleX = ctx.canvas.width / W, scaleY = ctx.canvas.height / H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.fillStyle = '#050910'; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 550);
  glow.addColorStop(0, '#102032'); glow.addColorStop(1, '#05070d');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1; ctx.strokeStyle = '#163040'; ctx.beginPath();
  const offset = reduced ? 0 : (time * 6) % 48;
  for (let x = -48 + offset; x < W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -48 + offset; y < H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke(); ctx.strokeStyle = '#287080'; ctx.strokeRect(18, 18, W - 36, H - 36);
  function shape(x: number, y: number, r: number, color: string, sides: number, angle = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.strokeStyle = color; ctx.fillStyle = color + '25';
    ctx.shadowColor = color; ctx.shadowBlur = reduced ? 0 : 12; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) { const a = i * Math.PI * 2 / sides; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  if (attract) {
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4 + (reduced ? 0 : time * .08), radius = 150 + (i % 5) * 63;
      shape(W / 2 + Math.cos(a) * radius, H / 2 + Math.sin(a) * radius * .75, 10 + i % 3 * 4, i % 2 ? '#b283ff' : '#ff4faf', i % 2 ? 4 : 3, a);
    }
  }
  for (const orb of state.orbs) shape(orb.pos.x, orb.pos.y, orb.radius, '#b283ff', 4, Math.PI / 4);
  for (const enemy of state.enemies) shape(enemy.pos.x, enemy.pos.y, enemy.radius, enemy.hitFlash > 0 ? '#ffffff' : enemy.kind === 'brute' ? '#b283ff' : enemy.kind === 'shooter' ? '#ffb85c' : '#ff4faf', enemy.kind === 'brute' ? 6 : enemy.kind === 'shooter' ? 4 : 3, Math.atan2(enemy.vel.y, enemy.vel.x));
  for (const p of state.projectiles) shape(p.pos.x, p.pos.y, p.radius + 1, p.owner === 'player' ? '#68f6ff' : '#ff4faf', 4);
  const player = state.player;
  shape(player.pos.x, player.pos.y, player.radius + 6, player.invuln > 0 ? '#ffffff' : '#68f6ff', 6, reduced ? 0 : time * .4);
  shape(player.pos.x, player.pos.y, player.radius, '#c9fcff', 3, Math.atan2(player.aim.y, player.aim.x));
  if (!reduced) for (const impact of state.impacts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, impact.ttl / impact.maxTtl));
    shape(impact.pos.x, impact.pos.y, 8 + (1 - impact.ttl / impact.maxTtl) * (impact.kind === 'pulse' ? 160 : 36), impact.kind === 'playerHurt' ? '#ff4faf' : '#68f6ff', 12);
  }
  ctx.globalAlpha = 1;
}
