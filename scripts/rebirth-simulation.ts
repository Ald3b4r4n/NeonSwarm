import { applyUpgrade, createGame, stepGame } from '../src/game/engine.js';
import type { GameState, Vec2, UpgradeId, RunConfig } from '../src/game/contracts.js';
import { BIOMES } from '../src/game/rebirth-encounters.js';

const directions = Array.from({ length: 8 }, (_, i) => ({
  x: Math.cos(i * Math.PI / 4),
  y: Math.sin(i * Math.PI / 4),
}));
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const priority: Partial<Record<UpgradeId, number>> = {
  'weapon-orbit': 13, 'weapon-arc': 12, 'weapon-coil': 12, 'weapon-scatter': 12,
  'weapon-lance': 11, 'weapon-mine': 10, regen: 15, damage: 14, fireRate: 11, speed: 9, magnet: 7,
};

function steer(state: GameState): Vec2 {
  const pos = state.player.pos;
  let loot: Vec2 | undefined;
  let lootDistance = 260;
  for (const orb of state.orbs) {
    const range = distance(pos, orb.pos);
    if (range < lootDistance) {
      loot = orb.pos;
      lootDistance = range;
    }
  }

  let best: Vec2 = { x: 0, y: 0 };
  let score = -Infinity;
  for (const direction of directions) {
    const next = { x: pos.x + 75 * direction.x, y: pos.y + 75 * direction.y };
    if (next.x < 40 || next.x > 920 || next.y < 40 || next.y > 680) continue;
    const obstacles = BIOMES[state.run!.biome].obstacles;
    if (obstacles.some(obstacle => distance(next, obstacle) < obstacle.radius + 30)) continue;
    let safety = 0;
    for (const enemy of state.enemies) {
      const gap = distance(next, enemy.pos) - enemy.radius;
      if (gap < 160) safety -= (160 - gap) ** 2 / 120;
    }
    for (const shot of state.projectiles) {
      if (shot.owner !== 'enemy') continue;
      const gap = distance(next, { x: shot.pos.x + shot.vel.x * .3, y: shot.pos.y + shot.vel.y * .3 });
      if (gap < 60) safety -= (60 - gap) ** 2 / 75;
    }
    const target = loot ?? { x: 480, y: 360 };
    const utility = safety - distance(next, target) * (loot ? .64 : .22);
    if (utility > score) {
      best = direction;
      score = utility;
    }
  }
  return best;
}

export function simulateRun(seed: number, config: RunConfig, stationary = false) {
  let state = createGame(seed, config);
  let movement: Vec2 = { x: 0, y: 0 };
  let frames = 0;
  let simMs = 0;
  let maxEnemies = 0;
  let horde: GameState | undefined;
  let boss: GameState | undefined;
  while (state.phase === 'playing' || state.phase === 'upgrade') {
    if (state.phase === 'upgrade') {
      const option = [...state.upgradeOptions].sort((a, b) => (priority[b.id] ?? 0) - (priority[a.id] ?? 0))[0];
      state = applyUpgrade(state, option.id);
      continue;
    }
    if (!stationary && frames % 12 === 0) movement = steer(state);
    const pulse = !stationary && frames % 30 === 0 && state.player.energy >= 35 &&
      state.enemies.some(enemy => distance(enemy.pos, state.player.pos) < 110);
    const start = performance.now();
    state = stepGame(state, { move: movement, pulse }, 1 / 60);
    simMs += performance.now() - start;
    frames++;
    maxEnemies = Math.max(maxEnemies, state.enemies.length);
    if (state.time > 240 && state.enemies.length >= 40 && !horde) horde = state;
    if (state.enemies.some(enemy => enemy.variant === 'queen') && !boss) boss = state;
  }
  return { state, horde, boss, maxEnemies, averageStepMs: simMs / frames };
}
