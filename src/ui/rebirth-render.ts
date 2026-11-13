import { ARENA_WIDTH as W, ARENA_HEIGHT as H, type GameState, type Vec2, type WeaponId } from '../game/contracts.js';
import { makeWeaponAttack } from '../game/rebirth-weapons.js';
import { BIOMES, bossPattern } from '../game/rebirth-encounters.js';
import type { ArenaArt } from './rebirth-art.js';
import { drawOpenWorld } from './ion-terrain.js';
import { drawSurvivor } from './survivor-art.js';

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

function explosion(ctx: CanvasRenderingContext2D, pos: Vec2, size: number, age: number, id: number, electric: boolean) {
  const heat = electric ? '#8ceaff' : '#ff9b53';
  const radius = size * (.15 + age * .72);
  const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
  glow.addColorStop(0, '#fff4c9');
  glow.addColorStop(.28, heat + 'a0');
  glow.addColorStop(1, heat + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
  halo(ctx, pos, size * (.23 + age * .77), heat, 2.8 * (1 - age) + 1);
  ctx.strokeStyle = heat;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = i * 2.39996 + id;
    const travel = radius * (.46 + (i % 5) * .13);
    const x = Math.cos(angle), y = Math.sin(angle);
    ctx.moveTo(pos.x + x * travel, pos.y + y * travel);
    ctx.lineTo(pos.x + x * (travel + 7), pos.y + y * (travel + 7));
  }
  ctx.stroke();
}

function sprite(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, pos: Vec2, size: number,
  time: number, velocity: Vec2, row: number, progress?: number) {
  const cell = 96;
  const index = progress === undefined ? Math.floor(time * (row === 1 ? 12 : 8)) % 4
    : Math.min(3, Math.max(0, Math.floor(progress * 4)));
  ctx.fillStyle = '#06090bb0';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + size * .22, size * .25, size * .095, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(pos.x, pos.y);
  if (velocity.x < -8) ctx.scale(-1, 1);
  ctx.drawImage(atlas, index * cell, row * cell, cell, cell, -size / 2, -size * .64, size, size);
  ctx.restore();
}

function streak(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number,
  rank: number, color: string, type: WeaponId | undefined, reduced: boolean) {
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length, py = dx / length;
  ctx.strokeStyle = color;
  ctx.lineWidth = type === 'lance' ? 3.5 : 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  if (type === 'coil' && rank >= 2) ctx.lineTo(x - dx * .5 + px * 5, y - dy * .5 + py * 5);
  if (type === 'lance' && rank >= 2) {
    ctx.lineTo(x - dx * .2, y - dy * .2);
    ctx.moveTo(x - dx * .5 + px * 3, y - dy * .5 + py * 3);
  }
  ctx.lineTo(x, y);
  if (rank >= 3) {
    ctx.moveTo(x - dx * .72, y - dy * .72);
    ctx.lineTo(x - dx * .35 - px * 8, y - dy * .35 - py * 8);
    if (rank >= 4) {
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * .55 + px * (reduced ? 6 : 10), y - dy * .55 + py * (reduced ? 6 : 10));
    }
  }
  ctx.stroke();
  if (rank === 5) halo(ctx, { x, y }, type === 'scatter' ? 4 : 6, '#efffff', 1.3);
}

export function drawRebirth(ctx: CanvasRenderingContext2D, state: GameState, art: ArenaArt, reduced: boolean, deathProgress = 1) {
  const { run, player } = state;
  if (!run) return;
  const time = reduced ? 0 : state.time;
  const bounds = state.bounds;
  const scale = Math.max(ctx.canvas.height / 560, ctx.canvas.width / 1440);
  const w = ctx.canvas.width / scale;
  const h = ctx.canvas.height / scale;
  const view = {
    x: Math.max(0, Math.min(bounds.w - w, player.pos.x - w / 2)),
    y: Math.max(0, Math.min(bounds.h - h, player.pos.y - h / 2)),
    w, h,
  };
  const visible = (pos: Vec2, pad = 70) => pos.x >= view.x - pad && pos.x <= view.x + view.w + pad &&
    pos.y >= view.y - pad && pos.y <= view.y + view.h + pad;
  if (run.expedition) {
    ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
    drawOpenWorld(ctx, run.biome, view);
  } else {
    ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
    ctx.drawImage(art.terrain, 0, 0, W, H);
    ctx.fillStyle = '#080d1870';
    ctx.fillRect(0, 0, W, H);
  }
  for (const obstacle of run.expedition ? [] : BIOMES[run.biome].obstacles) {
    const { x, y, radius } = obstacle;
    halo(ctx, obstacle, radius - 1, run.biome === 'station' ? '#70c9d780' : '#f99d7480', 1.5);
    const tile = Math.floor(time * 4 + x) % 4;
    ctx.drawImage(art.decoration, tile * 96, 0, 96, 96, x - radius * 1.45, y - radius * 1.55, radius * 2.9, radius * 2.9);
  }

  ctx.fillStyle = '#91ffb7';
  ctx.beginPath();
  for (const { pos } of state.orbs) {
    if (run.expedition && !visible(pos)) continue;
    ctx.moveTo(pos.x + 4, pos.y);
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const mine of run.mines) {
    halo(ctx, mine.pos, 12, '#ffc691', 3);
    halo(ctx, mine.pos, mine.radius, '#ffc69148', 1);
  }

  for (const enemy of state.enemies) {
    if (run.expedition && !visible(enemy.pos, enemy.radius * 3)) continue;
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
      } else if (warning) {
        ctx.setLineDash([5, 7]);
        halo(ctx, enemy.pos, enemy.radius + 34, '#ffc491', 2);
        ctx.setLineDash([]);
      }
    }
    const pattern = kind === 'queen' ? bossPattern(state.time, enemy.hp / enemy.maxHp) : undefined;
    const age = state.time - (enemy.spawnedAt ?? state.time - 2);
    const arrival = pattern && age < 1;
    const warning = pattern && enemy.fireCooldown < pattern.telegraphTime;
    const firing = (enemy.attackUntil ?? 0) > state.time;
    const row = arrival ? 6 : enemy.hitFlash > 0 ? 3 : warning ? 7
      : firing ? pattern && pattern.telegraph !== 'line' ? 5 : 2 : Math.hypot(enemy.vel.x, enemy.vel.y) > 10 ? 1 : 0;
    sprite(ctx, art.animation[kind], enemy.pos, enemy.radius * (kind === 'queen' ? 4.7 : 4.2),
      state.time + enemy.id * .077, enemy.vel, row, arrival ? age : undefined);
  }

  if (run.ranks.orbit) {
    const orbit = makeWeaponAttack('orbit', run.ranks.orbit, 0, state.time);
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
  const casting = state.impacts.some(effect => effect.kind === 'pulse' && effect.ttl > .2);
  if (!run.expedition || casting) halo(ctx, player.pos, player.radius + 8, '#71f8ff80', 2);
  const attacking = state.projectiles.some(shot => shot.owner === 'player' &&
    Math.abs(shot.pos.x - player.pos.x) + Math.abs(shot.pos.y - player.pos.y) < 38);
  const motion = Math.hypot(run.move.x, run.move.y);
  const playerRow = state.phase === 'gameover' ? 4 : player.invuln > .62 && player.invuln < 2 ? 3 : casting ? 5 : attacking ? 2 : motion > 8 ? 1 : 0;
  if (run.expedition) {
    drawSurvivor(ctx, art.survivors[run.character], player.pos, player.aim, time, motion > 8, attacking,
      playerRow === 3, playerRow === 4 ? deathProgress : 0);
  } else {
    sprite(ctx, art.animation[run.character], player.pos, 96, state.time, motion > 8 ? run.move : { x: player.aim.x * 40, y: 0 },
      playerRow, playerRow === 4 ? deathProgress : undefined);
  }
  for (const bolt of state.projectiles) {
    if (run.expedition && !visible(bolt.pos)) continue;
    const color = bolt.owner === 'enemy' ? '#ff82a6' : weaponColors[bolt.weapon ?? 'coil'];
    streak(ctx, bolt.pos.x, bolt.pos.y, bolt.vel.x * .026, bolt.vel.y * .026,
      bolt.rank ?? 1, color, bolt.weapon, reduced);
  }
  for (const impact of state.impacts) {
    const progress = 1 - impact.ttl / impact.maxTtl;
    if (reduced && impact.kind !== 'kill' && impact.kind !== 'blast' && impact.kind !== 'pulse' && impact.kind !== 'arc') continue;
    ctx.globalAlpha = Math.max(0, 1 - progress);
    const rank = impact.rank ?? 1;
    if (!reduced && (impact.kind === 'kill' || impact.kind === 'blast' || impact.kind === 'pulse')) {
      const size = impact.radius ?? (impact.variant === 'queen' ? 126 : impact.kind === 'kill' ? 45 : 95);
      if (!run.expedition || visible(impact.pos, size)) {
        explosion(ctx, impact.pos, size, progress, impact.id, impact.kind === 'pulse');
      }
    }
    if (impact.kind === 'kill' && impact.variant) {
      sprite(ctx, art.animation[impact.variant], impact.pos, impact.variant === 'queen' ? 170 : 59,
        time, { x: 0, y: 0 }, 4, progress);
    }
    if (impact.kind === 'arc' && impact.from) {
      const dx = impact.pos.x - impact.from.x;
      const dy = impact.pos.y - impact.from.y;
      ctx.strokeStyle = impact.weapon === 'coil' ? '#9dffff' : '#e0c4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(impact.from.x, impact.from.y);
      ctx.lineTo(impact.from.x + dx * .4 - dy * .15, impact.from.y + dy * .4 + dx * .15);
      ctx.lineTo(impact.pos.x, impact.pos.y);
      if (rank >= 2) {
        ctx.lineTo(impact.pos.x + dy * .045, impact.pos.y - dx * .045);
        ctx.lineTo(impact.pos.x, impact.pos.y);
      }
      if (rank >= 3 && !reduced) {
        ctx.moveTo(impact.from.x + dx * .4 - dy * .15, impact.from.y + dy * .4 + dx * .15);
        ctx.lineTo(impact.from.x + dx * .7 + dy * .18, impact.from.y + dy * .7 - dx * .18);
      }
      ctx.stroke();
      if (rank >= 4) halo(ctx, impact.pos, 6 + progress * 12, '#caa1ff', 2);
      if (rank >= 5) halo(ctx, impact.pos, 11 + progress * 22, '#f6e6ff', 1);
    } else {
      halo(ctx, impact.pos, 5 + progress * (impact.radius ?? (impact.kind === 'pulse' ? 160 : 28)),
        impact.kind === 'playerHurt' ? '#ff557c' : impact.kind === 'blast' ? '#ffd391' : '#83f4ff', 2.5);
      if ((impact.kind === 'blast' || impact.kind === 'pulse') && rank >= 2) {
        const radius = 6 + progress * (impact.radius ?? 144);
        halo(ctx, impact.pos, radius * .7, impact.weapon === 'orbit' ? '#87ffba' : '#ffe3ba', 1.3);
        if (rank >= 3 && !reduced) {
          ctx.fillStyle = impact.kind === 'pulse' ? '#b9f9ff' : '#ffd291';
          for (let i = 0; i < rank * 2; i++) {
            const angle = i * Math.PI / rank + impact.id;
            const x = impact.pos.x + Math.cos(angle) * radius;
            const y = impact.pos.y + Math.sin(angle) * radius;
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
          }
        }
        if (rank >= 4) halo(ctx, impact.pos, radius * .43, '#f5f8ff', 1.7);
        if (rank === 5) halo(ctx, impact.pos, radius * 1.16, '#d9ecff', 1);
      }
    }
  }
  ctx.globalAlpha = 1;

}
