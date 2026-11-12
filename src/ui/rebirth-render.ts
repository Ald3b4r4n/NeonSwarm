import { ARENA_WIDTH as W, ARENA_HEIGHT as H, type GameState, type Vec2, type WeaponId } from '../game/contracts.js';
import { makeWeaponAttack } from '../game/rebirth-weapons.js';
import { BIOMES, bossPattern } from '../game/rebirth-encounters.js';
import type { ArenaArt } from './rebirth-art.js';

const weaponColors: Record<WeaponId, string> = {
  coil: '#75f6ff', scatter: '#ffd291', lance: '#a8f9ff',
  orbit: '#83ffc5', mine: '#ff9850', arc: '#c4a7ff',
};

function halo(ctx: CanvasRenderingContext2D, pos: Vec2, radius: number, color: string, width: number) {
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function sprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement, pos: Vec2, height: number, time: number, velocity: Vec2, hurt: boolean) {
  const width = height * image.naturalWidth / image.naturalHeight;
  const motion = Math.min(1, Math.hypot(velocity.x, velocity.y) / 65);
  const stride = Math.sin(time * 15) * motion;
  ctx.fillStyle = '#06090bb0';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + height * .26, width * .37, height * .12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(pos.x, pos.y + stride * 2);
  ctx.rotate(stride * .045);
  if (velocity.x < -8) ctx.scale(-1, 1);
  if (hurt) ctx.globalAlpha = .62;
  ctx.drawImage(image, -width / 2, -height * .65, width, height);
  ctx.restore();
}

export function drawRebirth(ctx: CanvasRenderingContext2D, state: GameState, art: ArenaArt, reduced: boolean) {
  const { run, player } = state;
  if (!run) return;
  const time = reduced ? 0 : state.time;
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  ctx.drawImage(art.terrain, 0, 0, W, H);
  ctx.fillStyle = '#080d1870';
  ctx.fillRect(0, 0, W, H);
  for (const obstacle of BIOMES[run.biome].obstacles) {
    const { x, y, radius } = obstacle;
    ctx.fillStyle = '#09131a';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    halo(ctx, obstacle, radius - 1, run.biome === 'station' ? '#70c9d7a0' : '#f99d74a0', 2);
    halo(ctx, obstacle, radius - 6, '#edffff30', 1);
    ctx.fillStyle = run.biome === 'station' ? '#3b666e' : '#765445';
    ctx.fillRect(x - radius * .48, y - 2, radius * .96, 4);
  }

  ctx.fillStyle = '#91ffb7';
  ctx.beginPath();
  for (const { pos } of state.orbs) {
    ctx.moveTo(pos.x + 4, pos.y);
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const mine of run.mines) {
    halo(ctx, mine.pos, 12, '#ffc691', 3);
    halo(ctx, mine.pos, mine.radius, '#ffc69148', 1);
  }

  for (const enemy of state.enemies) {
    const kind = enemy.variant ?? enemy.kind;
    if (kind === 'queen') {
      const pattern = bossPattern(state.time, enemy.hp / enemy.maxHp);
      const warning = enemy.fireCooldown < pattern.telegraphTime;
      halo(ctx, enemy.pos, enemy.radius + 17 + Math.sin(time * 6) * 7, warning ? '#ffc491' : '#e55c9eaa', 3);
      if (warning && pattern.telegraph === 'line') {
        ctx.strokeStyle = '#ffc49199';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(enemy.pos.x, enemy.pos.y);
        ctx.lineTo(player.pos.x, player.pos.y);
        ctx.stroke();
      }
    }
    sprite(ctx, art.sprites[kind], enemy.pos, enemy.radius * (kind === 'queen' ? 3.7 : 3.3), time + enemy.id, enemy.vel, enemy.hitFlash > 0);
  }

  if (run.ranks.orbit) {
    const orbit = makeWeaponAttack('orbit', run.ranks.orbit, 0, time);
    if (orbit.type === 'rotating') {
      halo(ctx, player.pos, orbit.orbitRadius, '#83ffc544', 1);
      for (const angle of orbit.orbAngles) {
        const x = player.pos.x + Math.cos(angle) * orbit.orbitRadius;
        const y = player.pos.y + Math.sin(angle) * orbit.orbitRadius;
        ctx.strokeStyle = '#83ffc5';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - Math.sin(angle) * 8, y + Math.cos(angle) * 8);
        ctx.lineTo(x + Math.sin(angle) * 8, y - Math.cos(angle) * 8);
        ctx.stroke();
      }
    }
  }
  halo(ctx, player.pos, player.radius + 8, '#71f8ff80', 2);
  sprite(ctx, art.sprites[run.character], player.pos, 65, time, run.move, player.invuln > 0 && Math.sin(state.time * 31) > 0);
  for (const bolt of state.projectiles) {
    const color = bolt.owner === 'enemy' ? '#ff82a6' : weaponColors[bolt.weapon ?? 'coil'];
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, bolt.radius * .8);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bolt.pos.x - bolt.vel.x * .025, bolt.pos.y - bolt.vel.y * .025);
    ctx.lineTo(bolt.pos.x, bolt.pos.y);
    ctx.stroke();
  }
  for (const impact of state.impacts) {
    const progress = 1 - impact.ttl / impact.maxTtl;
    if (reduced && impact.kind !== 'blast' && impact.kind !== 'pulse' && impact.kind !== 'arc') continue;
    ctx.globalAlpha = Math.max(0, 1 - progress);
    if (impact.kind === 'arc' && impact.from) {
      const dx = impact.pos.x - impact.from.x;
      const dy = impact.pos.y - impact.from.y;
      ctx.strokeStyle = '#e0c4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(impact.from.x, impact.from.y);
      ctx.lineTo(impact.from.x + dx * .4 - dy * .15, impact.from.y + dy * .4 + dx * .15);
      ctx.lineTo(impact.pos.x, impact.pos.y);
      ctx.stroke();
    } else {
      halo(ctx, impact.pos, 5 + progress * (impact.radius ?? (impact.kind === 'pulse' ? 160 : 28)),
        impact.kind === 'playerHurt' ? '#ff557c' : impact.kind === 'blast' ? '#ffd391' : '#83f4ff', 2.5);
    }
  }
  ctx.globalAlpha = 1;
}
