import { BIOMES, CHARACTERS, ENEMIES, RUN_SECONDS, bossPattern, encounterAt } from './rebirth-encounters.js';
import { WEAPONS, WEAPON_IDS, makeWeaponAttack, weaponEvolution } from './rebirth-weapons.js';
/**
 * Motor puro do NEON SWARM.
 *
 * Regras de ouro deste arquivo:
 * - não toca DOM, React, `Math.random`, `Date` ou qualquer I/O;
 * - todas as funções públicas são puras (não mutam os argumentos);
 * - o PRNG vive em `GameState.rng`, então a mesma seed + inputs gera o mesmo estado.
 */
import {
  ARENA_BOUNDS,
  ARENA_HEIGHT,
  ARENA_WIDTH,
  MAX_DT,
  MAX_UPGRADE_OPTIONS,
  type Enemy,
  type EnemyKind,
  type GameState,
  type RunConfig,
  type WeaponId,
  type EnemyVariant,
  type Impact,
  type InputState,
  type PlayerStats,
  type UpgradeId,
  type UpgradeOption,
  type Vec2,
} from './contracts';

const DEFAULT_SEED = 0x5eed1234;

const PLAYER_RADIUS = 14;
const PLAYER_START_HP = 100;
const PLAYER_START_ENERGY = 100;
const PLAYER_INVULN_SECONDS = 0.8;

const PULSE_COST = 28;
const PULSE_RADIUS = 168;
const PULSE_BASE_DAMAGE = 14;
const PULSE_PUSH = 96;

const SHOT_SPEED = 570;
const SHOT_RADIUS = 5;
const SHOT_TTL = 1.9;
/** Distância além dos bounds em que projéteis ainda são atualizados e podem acertar. */
const PROJECTILE_MARGIN = 48;

const WAVE_INTERMISSION_SECONDS = 3;
const SIM_STEP = 1 / 60;
const EPSILON = 1e-9;

const MAX_ENEMIES = 180;
const MAX_PROJECTILES = 400;
const MAX_ORBS = 300;
const MAX_IMPACTS = 120;

const ORB_BASE_SPEED = 260;
const ORB_MAX_SPEED = 540;
const ORB_PICKUP_PADDING = 4;

const UPGRADE_MAX_LEVEL = 8;

// Caps reais dos stats. Um upgrade não deve aparecer quando seu incremento
// já seria absorvido pelo cap e, portanto, não alteraria o efeito.
const FIRE_RATE_CAP = 12;
const MOVE_SPEED_CAP = 360;
const MULTISHOT_CAP = 8;
const MAGNET_CAP = 520;
const PIERCE_CAP = 6;
const REGEN_CAP = 5;

// Níveis em que o stat correspondente chega ao cap antes de UPGRADE_MAX_LEVEL.
const UPGRADE_EFFECT_MAX_LEVEL: Partial<Record<UpgradeId, number>> = {
  multishot: 7, // 1 projétil inicial + 7 incrementos = cap 8
  pierce: 6, // 0 perfurações iniciais + 6 incrementos = cap 6
};

interface EnemyTemplate {
  radius: number;
  speed: number;
  hp: number;
  contactDamage: number;
  xpValue: number;
  score: number;
}

const ENEMY_TEMPLATES: Record<EnemyKind, EnemyTemplate> = {
  drone: { radius: 11, speed: 96, hp: 16, contactDamage: 8, xpValue: 2, score: 10 },
  brute: { radius: 20, speed: 45, hp: 66, contactDamage: 18, xpValue: 5, score: 25 },
  shooter: { radius: 13, speed: 70, hp: 28, contactDamage: 10, xpValue: 4, score: 20 },
};

/** Opções de upgrade: texto em português já pronto para a UI. */
type CoreUpgrade = Exclude<UpgradeId, `weapon-${WeaponId}`>;
const UPGRADE_CATALOG: Record<CoreUpgrade, { title: string; description: string }> = {
  damage: { title: 'Dano +5', description: 'Cada projétil causa mais dano.' },
  fireRate: { title: 'Cadência +0,35/s', description: 'Dispara mais vezes por segundo.' },
  speed: { title: 'Velocidade +18', description: 'O jogador se move mais rápido.' },
  maxHp: { title: 'Vida máxima +20', description: 'Aumenta a vida máxima e recupera 20.' },
  multishot: { title: 'Projétil extra', description: 'Cada salva dispara um projétil a mais.' },
  magnet: { title: 'Ímã +40', description: 'Atrai orbes de XP de mais longe.' },
  pierce: { title: 'Perfuração +1', description: 'Projéteis atravessam mais um inimigo.' },
  regen: { title: 'Regeneração +0,6/s', description: 'Recupera vida continuamente.' },
};

const UPGRADE_IDS: CoreUpgrade[] = [
  'damage',
  'fireRate',
  'speed',
  'maxHp',
  'multishot',
  'magnet',
  'pierce',
  'regen',
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

function normalize(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  if (length <= EPSILON) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

/** Próximo número pseudoaleatório em [0,1). Avança o PRNG que vive no estado. */
function random(state: GameState): number {
  let t = (state.rng + 0x6d2b79f5) >>> 0;
  state.rng = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomRange(state: GameState, min: number, max: number): number {
  return min + (max - min) * random(state);
}

function cloneState(state: GameState): GameState {
  return {
    seed: state.seed,
    rng: state.rng,
    phase: state.phase,
    time: state.time,
    bounds: { ...state.bounds },
    player: {
      ...state.player,
      pos: { ...state.player.pos },
      aim: { ...state.player.aim },
      stats: { ...state.player.stats },
      upgrades: { ...state.player.upgrades },
    },
    enemies: state.enemies.map((enemy) => ({
      ...enemy,
      pos: { ...enemy.pos },
      vel: { ...enemy.vel },
    })),
    projectiles: state.projectiles.map((projectile) => ({
      ...projectile,
      pos: { ...projectile.pos },
      vel: { ...projectile.vel },
      hitIds: [...projectile.hitIds],
    })),
    orbs: state.orbs.map((orb) => ({ ...orb, pos: { ...orb.pos } })),
    impacts: state.impacts.map((impact) => ({ ...impact, pos: { ...impact.pos } })),
    wave: { ...state.wave },
    stats: {
      ...state.stats,
      killsByKind: { ...state.stats.killsByKind },
    },
    score: state.score,
    upgradeOptions: state.upgradeOptions.map((option) => ({ ...option })),
    nextId: state.nextId,
    ...(state.run && { run: {
      ...state.run,
      ranks: { ...state.run.ranks },
      cooldowns: { ...state.run.cooldowns },
      mines: state.run.mines.map(mine => ({ ...mine })),
    } }),
  };
}

function baseStats(): PlayerStats {
  return {
    moveSpeed: 210,
    damage: 12,
    fireRate: 2.4,
    projectiles: 1,
    pierce: 0,
    magnetRadius: 180,
    regenPerSec: 0,
  };
}

/** XP necessário para sair do nível atual. Cresce de forma suave. */
function xpThreshold(level: number): number {
  return 34 + (level - 1) * 14;
}

function waveEnemyCount(waveNumber: number): number {
  return Math.min(90, 12 + waveNumber * 4);
}

function spawnInterval(waveNumber: number): number {
  return Math.max(0.34, 1.1 - waveNumber * 0.055);
}

function enemyScale(waveNumber: number): number {
  return 1 + (waveNumber - 1) * 0.2;
}

function spawnKind(state: GameState, waveNumber: number, indexInWave: number): EnemyKind {
  if (waveNumber <= 1) return 'drone';

  // Os primeiros spawns de cada onda garantem que os três tipos apareçam cedo,
  // independentemente da sorte do PRNG.
  if (waveNumber === 2 && indexInWave === 0) return 'brute';
  if (waveNumber === 3 && indexInWave === 0) return 'shooter';

  const roll = random(state);
  if (waveNumber >= 4 && indexInWave === 0) {
    return waveNumber % 2 === 0 ? 'brute' : 'shooter';
  }
  if (waveNumber === 2) return roll < 0.72 ? 'drone' : 'brute';
  if (waveNumber === 3) {
    if (roll < 0.55) return 'drone';
    return roll < 0.78 ? 'brute' : 'shooter';
  }
  if (waveNumber === 4) {
    if (roll < 0.5) return 'drone';
    return roll < 0.75 ? 'brute' : 'shooter';
  }
  if (roll < 0.44) return 'drone';
  return roll < 0.72 ? 'brute' : 'shooter';
}

function chooseSpawnPoint(state: GameState, radius: number): Vec2 {
  const { x, y, w, h } = state.bounds;
  const margin = radius + 24;
  const player = state.player.pos;
  let best: Vec2 = { x: x - margin, y: y + h / 2 };
  let bestDistance = -1;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const edge = Math.floor(random(state) * 4);
    let candidate: Vec2;
    if (edge === 0) {
      candidate = { x: randomRange(state, x + radius, x + w - radius), y: y - margin };
    } else if (edge === 1) {
      candidate = { x: randomRange(state, x + radius, x + w - radius), y: y + h + margin };
    } else if (edge === 2) {
      candidate = { x: x - margin, y: randomRange(state, y + radius, y + h - radius) };
    } else {
      candidate = { x: x + w + margin, y: randomRange(state, y + radius, y + h - radius) };
    }

    const currentDistance = distance(candidate, player);
    // Evita nascimentos em cima do jogador. Se nenhum candidato for seguro,
    // o mais distante encontrado é usado (nunca colide no instante do spawn).
    if (currentDistance >= 220) return candidate;
    if (currentDistance > bestDistance) {
      bestDistance = currentDistance;
      best = candidate;
    }
  }

  return best;
}

function addImpact(
  state: GameState,
  kind: Impact['kind'],
  pos: Vec2,
  enemyKind?: EnemyKind,
): void {
  if (state.impacts.length >= MAX_IMPACTS) state.impacts.shift();
  const maxTtl = kind === 'levelUp' ? 1 : kind === 'kill' ? 0.5 : 0.3;
  const impact: Impact = {
    id: state.nextId++,
    kind,
    pos: { ...pos },
    ttl: maxTtl,
    maxTtl,
  };
  if (enemyKind) impact.enemyKind = enemyKind;
  state.impacts.push(impact);
}

function spawnEnemy(state: GameState, indexInWave: number): void {
  if (state.enemies.length >= MAX_ENEMIES) return;

  const waveNumber = state.wave.number;
  const kind = spawnKind(state, waveNumber, indexInWave);
  const template = ENEMY_TEMPLATES[kind];
  const scale = enemyScale(waveNumber);
  const pos = chooseSpawnPoint(state, template.radius);
  const maxHp = Math.round(template.hp * scale);

  const enemy: Enemy = {
    id: state.nextId++,
    kind,
    pos,
    vel: { x: 0, y: 0 },
    radius: template.radius,
    hp: maxHp,
    maxHp,
    contactDamage: Math.round(template.contactDamage + (waveNumber - 1) * 1.1),
    fireCooldown:
      kind === 'shooter' ? randomRange(state, 1.25, 2.15) : 0,
    xpValue: template.xpValue,
    hitFlash: 0,
  };
  state.enemies.push(enemy);
}

function dropOrb(state: GameState, pos: Vec2, value: number): void {
  if (state.orbs.length >= MAX_ORBS) return;
  state.orbs.push({
    id: state.nextId++,
    pos: { ...pos },
    radius: 5,
    value,
  });
}

function scoreForKill(kind: EnemyKind, waveNumber: number): number {
  return Math.round(ENEMY_TEMPLATES[kind].score * (1 + (waveNumber - 1) * 0.12));
}

/** Remove um inimigo morto e credita pontuação/XP/orbe. */
function killEnemyAt(state: GameState, index: number): void {
  const enemy = state.enemies[index];
  if (!enemy) return;

  state.enemies.splice(index, 1);
  if (state.run && enemy.variant === 'queen') state.run.bossDefeated = true;
  state.stats.kills += 1;
  state.stats.killsByKind[enemy.kind] += 1;
  state.score += scoreForKill(enemy.kind, state.wave.number);
  dropOrb(state, enemy.pos, enemy.xpValue * (state.run ? 2 : 1));
  addImpact(state, 'kill', enemy.pos, enemy.kind);
}

/** Aplica dano em um inimigo por índice. Retorna true se ele morreu. */
function hurtEnemyAt(
  state: GameState,
  index: number,
  amount: number,
  addHitImpact = true,
): boolean {
  const enemy = state.enemies[index];
  if (!enemy) return false;

  const dealt = Math.min(Math.max(0, amount), enemy.hp);
  enemy.hp -= amount;
  enemy.hitFlash = 0.12;
  state.stats.damageDealt += dealt;
  if (addHitImpact) addImpact(state, 'hit', enemy.pos, enemy.kind);

  if (enemy.hp <= 0) {
    killEnemyAt(state, index);
    return true;
  }
  return false;
}

function hurtPlayer(state: GameState, amount: number): void {
  const player = state.player;
  if (player.invuln > 0 || player.hp <= 0) return;

  const dealt = Math.min(Math.max(0, amount), player.hp);
  player.hp = Math.max(0, player.hp - amount);
  player.invuln = PLAYER_INVULN_SECONDS;
  state.stats.damageTaken += dealt;
  addImpact(state, 'playerHurt', player.pos);

  if (player.hp <= 0) {
    player.hp = 0;
    state.phase = 'gameover';
  }
}

/** True somente se comprar o próximo nível ainda altera algum efeito do jogador. */
function upgradeCanImprove(state: GameState, id: CoreUpgrade): boolean {
  const player = state.player;
  const level = player.upgrades[id] ?? 0;
  if (level >= UPGRADE_MAX_LEVEL) return false;

  const effectMaxLevel = UPGRADE_EFFECT_MAX_LEVEL[id];
  if (effectMaxLevel !== undefined && level >= effectMaxLevel) return false;

  switch (id) {
    case 'fireRate':
      return player.stats.fireRate < FIRE_RATE_CAP;
    case 'speed':
      return player.stats.moveSpeed < MOVE_SPEED_CAP;
    case 'multishot':
      return player.stats.projectiles < MULTISHOT_CAP;
    case 'magnet':
      return player.stats.magnetRadius < MAGNET_CAP;
    case 'pierce':
      return player.stats.pierce < PIERCE_CAP;
    case 'regen':
      return player.stats.regenPerSec < REGEN_CAP;
    default:
      // damage e maxHp não têm cap: sempre incrementam.
      return true;
  }
}

function buildUpgradeOptions(state: GameState): UpgradeOption[] {
  const pool: UpgradeOption[] = UPGRADE_IDS.filter(id => upgradeCanImprove(state, id))
    .map(id => ({ id, ...UPGRADE_CATALOG[id], nextLevel: (state.player.upgrades[id] ?? 0) + 1 }));
  if (state.run) {
    const ranks = state.run.ranks;
    for (const id of WEAPON_IDS) {
      const rank = ranks[id] ?? 0;
      const weapon = WEAPONS[id];
      if (rank >= weapon.maxRank) continue;
      const evolution = weaponEvolution(id, { ...ranks, [id]: rank + 1 });
      pool.push({
        id: "weapon-" + id as UpgradeId,
        title: evolution?.title ?? weapon.title,
        description: rank ? evolution?.description ?? 'Reforce o dano e o alcance desta arma.' : weapon.description,
        nextLevel: rank + 1,
      });
    }
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(state) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MAX_UPGRADE_OPTIONS);
}

function maybeLevelUp(state: GameState): void {
  if (state.phase !== 'playing') return;
  const player = state.player;
  if (player.xp < player.xpToNext) return;

  player.xp -= player.xpToNext;
  player.level += 1;
  player.xpToNext = state.run ? 22 + (player.level - 1) * 13 + Math.floor(player.level ** 2 * .28) : xpThreshold(player.level);
  state.upgradeOptions = buildUpgradeOptions(state);
  state.phase = state.upgradeOptions.length > 0 ? 'upgrade' : 'playing';
  addImpact(state, 'levelUp', player.pos);
}

function firePlayerProjectiles(state: GameState, aim: Vec2): void {
  const player = state.player;
  const count = Math.max(1, Math.floor(player.stats.projectiles));
  const spread = 0.105;
  const baseAngle = Math.atan2(aim.y, aim.x);

  for (let i = 0; i < count; i += 1) {
    if (state.projectiles.length >= MAX_PROJECTILES) break;
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const angle = baseAngle + offset;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    state.projectiles.push({
      id: state.nextId++,
      owner: 'player',
      pos: {
        x: player.pos.x + dir.x * (player.radius + 3),
        y: player.pos.y + dir.y * (player.radius + 3),
      },
      vel: { x: dir.x * SHOT_SPEED, y: dir.y * SHOT_SPEED },
      radius: SHOT_RADIUS,
      damage: player.stats.damage,
      pierceLeft: Math.max(0, Math.floor(player.stats.pierce)),
      ttl: SHOT_TTL,
      hitIds: [],
    });
    state.stats.shotsFired += 1;
  }
}

function fireEnemyProjectile(state: GameState, enemy: Enemy): void {
  if (state.projectiles.length >= MAX_PROJECTILES) return;

  const player = state.player;
  const dir = normalize(player.pos.x - enemy.pos.x, player.pos.y - enemy.pos.y);
  const speed = 195 + Math.min(60, state.wave.number * 5);

  state.projectiles.push({
    id: state.nextId++,
    owner: 'enemy',
    pos: { x: enemy.pos.x + dir.x * (enemy.radius + 3), y: enemy.pos.y + dir.y * (enemy.radius + 3) },
    vel: { x: dir.x * speed, y: dir.y * speed },
    radius: 6,
    damage: 9 + state.wave.number,
    pierceLeft: 0,
    ttl: 4,
    hitIds: [],
  });
}

function updateWave(state: GameState, dt: number): void {
  const wave = state.wave;

  if (wave.intermission > 0) {
    wave.intermission = Math.max(0, wave.intermission - dt);
    if (wave.intermission <= EPSILON) {
      wave.number += 1;
      wave.elapsed = 0;
      wave.toSpawn = waveEnemyCount(wave.number);
      wave.spawnTimer = 0.65;
      wave.intermission = 0;
    }
    return;
  }

  wave.elapsed += dt;

  if (wave.toSpawn > 0) {
    wave.spawnTimer -= dt;
    let safety = 0;
    while (wave.spawnTimer <= 0 && wave.toSpawn > 0 && safety < 4) {
      if (state.enemies.length >= MAX_ENEMIES) {
        // Sem espaço: tenta de novo em breve; a onda não trava.
        wave.spawnTimer = 0.5;
        break;
      }
      const indexInWave = waveEnemyCount(wave.number) - wave.toSpawn;
      spawnEnemy(state, indexInWave);
      wave.toSpawn -= 1;
      wave.spawnTimer += spawnInterval(wave.number) * randomRange(state, 0.86, 1.14);
      safety += 1;
    }
    if (wave.spawnTimer < 0) wave.spawnTimer = 0;
    return;
  }

  if (state.enemies.length === 0) {
    // Bônus de conclusão; a UI enxerga a pausa por wave.intermission.
    state.score += 40 + wave.number * 30;
    wave.intermission = WAVE_INTERMISSION_SECONDS;
  }
}

function updatePlayer(state: GameState, move: Vec2, pulse: boolean, dt: number): void {
  const player = state.player;

  player.invuln = Math.max(0, player.invuln - dt);
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  if (player.stats.regenPerSec > 0 && player.hp > 0) {
    player.hp = Math.min(player.maxHp, player.hp + player.stats.regenPerSec * dt);
  }

  let mx = clamp(finiteOr(move.x, 0), -1, 1);
  let my = clamp(finiteOr(move.y, 0), -1, 1);
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }

  const radius = player.radius;
  player.pos.x = clamp(
    player.pos.x + mx * player.stats.moveSpeed * dt,
    state.bounds.x + radius,
    state.bounds.x + state.bounds.w - radius,
  );
  player.pos.y = clamp(
    player.pos.y + my * player.stats.moveSpeed * dt,
    state.bounds.y + radius,
    state.bounds.y + state.bounds.h - radius,
  );

  if (state.run) {
    state.run.move = { x: mx * player.stats.moveSpeed, y: my * player.stats.moveSpeed };
    player.energy = Math.min(player.maxEnergy, player.energy + dt * 2);
    separateObstacles(state, player.pos, player.radius);
  }
  if (pulse && player.energy >= PULSE_COST) {
    player.energy -= PULSE_COST;
    const pulseDamage =
      PULSE_BASE_DAMAGE + player.level * 2 + player.stats.damage * 0.35;

    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i] as Enemy;
      if (distance(player.pos, enemy.pos) <= PULSE_RADIUS + enemy.radius) {
        const dir = normalize(enemy.pos.x - player.pos.x, enemy.pos.y - player.pos.y);
        hurtEnemyAt(state, i, pulseDamage, false);
        const survivor = state.enemies[i];
        if (survivor && survivor.id === enemy.id) {
          const push = survivor.variant === 'queen' ? 0 : PULSE_PUSH;
          survivor.pos.x += dir.x * push;
          survivor.pos.y += dir.y * push;
          survivor.vel.x += dir.x * PULSE_PUSH * 2;
          survivor.vel.y += dir.y * PULSE_PUSH * 2;
        }
      }
    }

    // O pulso também limpa projéteis inimigos próximos (defesa reativa).
    for (const projectile of state.projectiles) {
      if (
        projectile.owner === 'enemy' &&
        distance(player.pos, projectile.pos) <= PULSE_RADIUS
      ) {
        projectile.ttl = 0;
      }
    }

    addImpact(state, 'pulse', player.pos);
  }
}

function updateEnemies(state: GameState, dt: number): void {
  const player = state.player;
  const waveNumber = state.wave.number;

  for (const enemy of state.enemies) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const dist = Math.hypot(dx, dy) || EPSILON;
    const dir = { x: dx / dist, y: dy / dist };
    if (enemy.variant === 'queen' && state.run) {
      updateQueen(state, enemy, dt);
      continue;
    }
    const baseSpeed = enemy.speed ?? ENEMY_TEMPLATES[enemy.kind].speed;
    const charge = enemy.variant === 'hound' && (state.time + enemy.id) % 5 > 4.2;
    const speed = baseSpeed * Math.min(1.55, 1 + (waveNumber - 1) * 0.035) * (charge ? 1.65 : 1);

    if (enemy.kind === 'drone') {
      // Rápido e direto, com uma leve oscilação lateral para não ser uma linha reta.
      const weave = Math.sin(state.time * 5.2 + enemy.id * 1.7) * 0.34;
      const vx = dir.x - dir.y * weave;
      const vy = dir.y + dir.x * weave;
      const normalized = normalize(vx, vy);
      enemy.vel.x = normalized.x * speed;
      enemy.vel.y = normalized.y * speed;
    } else if (enemy.kind === 'brute') {
      // Lento, pesado e implacável: ameaça por dano de contato.
      enemy.vel.x = dir.x * speed;
      enemy.vel.y = dir.y * speed;
    } else {
      // Shooter mantém distância e usa fireCooldown como telegráfico de tiro.
      const preferred = 250;
      let vx = 0;
      let vy = 0;
      if (dist < preferred - 55) {
        vx = -dir.x;
        vy = -dir.y;
      } else if (dist > preferred + 65) {
        vx = dir.x;
        vy = dir.y;
      } else {
        const side = enemy.id % 2 === 0 ? 1 : -1;
        vx = -dir.y * side;
        vy = dir.x * side;
      }
      const sideDir = normalize(vx, vy);
      enemy.vel.x = sideDir.x * speed;
      enemy.vel.y = sideDir.y * speed;

      enemy.fireCooldown -= dt;
      if (enemy.fireCooldown <= 0) {
        fireEnemyProjectile(state, enemy);
        enemy.fireCooldown =
          (enemy.variant === 'spore' ? 5.8 : Math.max(0.95, 2.35 - waveNumber * 0.07)) * randomRange(state, 0.85, 1.15);
      }
    }

    enemy.pos.x += enemy.vel.x * dt;
    enemy.pos.y += enemy.vel.y * dt;

    if (state.run) separateObstacles(state, enemy.pos, enemy.radius);
    if (enemy.kind === 'shooter') {
      // Shooters nascem fora da arena, mas não podem recuar além da faixa em
      // que os projéteis do jogador ainda são atualizados. Sem este limite, um
      // shooter na borda fica inalcançável e a onda nunca termina.
      enemy.pos.x = clamp(
        enemy.pos.x,
        state.bounds.x - PROJECTILE_MARGIN,
        state.bounds.x + state.bounds.w + PROJECTILE_MARGIN,
      );
      enemy.pos.y = clamp(
        enemy.pos.y,
        state.bounds.y - PROJECTILE_MARGIN,
        state.bounds.y + state.bounds.h + PROJECTILE_MARGIN,
      );
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const player = state.player;
  const margin = PROJECTILE_MARGIN;

  for (const projectile of state.projectiles) {
    if (projectile.ttl <= 0) continue;

    projectile.pos.x += projectile.vel.x * dt;
    projectile.pos.y += projectile.vel.y * dt;
    projectile.ttl -= dt;

    if (
      projectile.pos.x < state.bounds.x - margin ||
      projectile.pos.x > state.bounds.x + state.bounds.w + margin ||
      projectile.pos.y < state.bounds.y - margin ||
      projectile.pos.y > state.bounds.y + state.bounds.h + margin
    ) {
      projectile.ttl = 0;
      continue;
    }

    if (projectile.owner === 'player') {
      // Itera de trás para frente porque inimigos mortos são removidos na hora.
      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = state.enemies[i] as Enemy;
        if (projectile.hitIds.includes(enemy.id)) continue;
        const radius = projectile.radius + enemy.radius;
        if (distanceSq(projectile.pos, enemy.pos) > radius * radius) continue;

        projectile.hitIds.push(enemy.id);
        hurtEnemyAt(state, i, projectile.damage);

        if (projectile.pierceLeft > 0) {
          projectile.pierceLeft -= 1;
        } else {
          projectile.ttl = 0;
          break;
        }
      }
    } else {
      const radius = projectile.radius + player.radius;
      if (
        player.hp > 0 &&
        distanceSq(projectile.pos, player.pos) <= radius * radius
      ) {
        projectile.ttl = 0;
        hurtPlayer(state, projectile.damage);
        if (state.phase !== 'playing') break;
      }
    }
  }

  state.projectiles = state.projectiles.filter((projectile) => projectile.ttl > 0);
}

function updateOrbs(state: GameState, dt: number): void {
  const player = state.player;
  const magnet = Math.max(player.radius, player.stats.magnetRadius);

  for (const orb of state.orbs) {
    const dist = distance(player.pos, orb.pos);

    if (dist <= player.radius + orb.radius + ORB_PICKUP_PADDING) {
      const value = orb.value;
      orb.value = -value; // marca para remoção no filter abaixo
      player.xp += value;
      state.stats.xpCollected += value;
      player.energy = Math.min(
        player.maxEnergy,
        player.energy + Math.max(5, value * 3),
      );
      addImpact(state, 'pickup', orb.pos);
      continue;
    }

    if (dist <= magnet && dist > EPSILON) {
      const speed = Math.min(ORB_MAX_SPEED, ORB_BASE_SPEED + (magnet - dist) * 1.4);
      orb.pos.x += ((player.pos.x - orb.pos.x) / dist) * speed * dt;
      orb.pos.y += ((player.pos.y - orb.pos.y) / dist) * speed * dt;
    }
  }

  state.orbs = state.orbs.filter((orb) => orb.value > 0);
}

function updateContactDamage(state: GameState): boolean {
  const player = state.player;
  if (player.invuln > 0 || player.hp <= 0) return false;

  for (const enemy of state.enemies) {
    const radius = enemy.radius + player.radius;
    if (distanceSq(enemy.pos, player.pos) <= radius * radius) {
      hurtPlayer(state, enemy.contactDamage);
      return true;
    }
  }
  return false;
}

function initializeRebirth(state: GameState, config: RunConfig): void {
  const character = CHARACTERS[config.character];
  state.player.maxHp = character.maxHp;
  state.player.hp = character.maxHp;
  state.player.stats.moveSpeed = character.moveSpeed;
  state.player.stats.magnetRadius = 220;
  state.player.xpToNext = 22;
  state.wave.toSpawn = 0;
  state.run = {
    ...config, move: { x: 0, y: 0 }, spawnIndex: 0, bossSpawned: false, bossDefeated: false,
    ranks: { [character.startWeapon]: 1 }, cooldowns: {}, mines: [],
  };
}

function separateObstacles(state: GameState, pos: Vec2, radius: number): void {
  if (!state.run) return;
  for (const obstacle of BIOMES[state.run.biome].obstacles) {
    const dx = pos.x - obstacle.x;
    const dy = pos.y - obstacle.y;
    const minimum = radius + obstacle.radius;
    const square = dx * dx + dy * dy;
    if (square >= minimum * minimum) continue;
    const length = Math.sqrt(square);
    pos.x = obstacle.x + (length ? dx / length : 1) * minimum;
    pos.y = obstacle.y + (length ? dy / length : 0) * minimum;
    if (pos === state.player.pos) {
      pos.x = clamp(pos.x, radius, ARENA_WIDTH - radius);
      pos.y = clamp(pos.y, radius, ARENA_HEIGHT - radius);
    }
  }
}

function spawnRebirthEnemy(state: GameState, variant: EnemyVariant, scale: number): void {
  if (state.enemies.length >= MAX_ENEMIES) return;
  const def = ENEMIES[variant];
  const kind: EnemyKind = variant === 'spore' || variant === 'shooter' ? 'shooter'
    : variant === 'brute' || variant === 'elite' || variant === 'queen' ? 'brute' : 'drone';
  const maxHp = Math.round(def.hp * scale);
  const pos = variant === 'queen' ? { x: 480, y: 75 } : chooseSpawnPoint(state, def.radius);
  state.enemies.push({
    id: state.nextId++, kind, variant, pos, vel: { x: 0, y: 0 }, radius: def.radius,
    hp: maxHp, maxHp, speed: def.speed,
    contactDamage: Math.round(def.contactDamage * (1 + (scale - 1) * .45)),
    fireCooldown: 1.3 + random(state), xpValue: def.xpValue, hitFlash: 0,
  });
}

function updateEncounter(state: GameState, dt: number): void {
  const run = state.run;
  if (!run) return;
  state.wave.number = Math.min(12, Math.floor(state.time / 60) + 1);
  state.wave.elapsed = state.time % 60;
  if (state.time >= RUN_SECONDS && run.bossDefeated) {
    state.phase = 'victory';
    state.score += 3000;
    return;
  }
  if (state.time >= 900) {
    state.phase = 'gameover';
    return;
  }
  if (!run.bossSpawned && state.time >= RUN_SECONDS - 60) {
    if (state.enemies.length === MAX_ENEMIES) state.enemies.shift();
    spawnRebirthEnemy(state, 'queen', 1);
    run.bossSpawned = true;
  }
  if (run.bossDefeated || state.time >= RUN_SECONDS) return;
  state.wave.spawnTimer -= dt;
  if (state.wave.spawnTimer > 0 || state.enemies.length >= MAX_ENEMIES) return;
  const encounter = encounterAt(state.time, run.spawnIndex++, run.biome);
  const variant = encounter.kind === 'queen' ? 'elite'
    : encounter.kind === 'spore' && state.time < 90 && run.spawnIndex % 6 !== 0 ? 'drone' : encounter.kind;
  spawnRebirthEnemy(state, variant, encounter.scale);
  if (state.time > 275 && !run.bossSpawned) {
    spawnRebirthEnemy(state, run.spawnIndex % 3 ? 'drone' : 'hound', encounter.scale);
    if (state.time > 505) spawnRebirthEnemy(state, 'hound', encounter.scale);
  }
  state.wave.spawnTimer = encounter.cadence * (state.time < 110 ? .72 : 1) * (run.bossSpawned ? 1.8 : 1);
}

function updateQueen(state: GameState, enemy: Enemy, dt: number): void {
  const direction = normalize(state.player.pos.x - enemy.pos.x, state.player.pos.y - enemy.pos.y);
  const aim = Math.atan2(direction.y, direction.x);
  const pattern = bossPattern(state.time, enemy.hp / enemy.maxHp);
  enemy.fireCooldown -= dt;
  const speed = enemy.fireCooldown < pattern.telegraphTime ? pattern.speed * .22 : pattern.speed;
  enemy.vel.x = direction.x * speed;
  enemy.vel.y = direction.y * speed;
  enemy.pos.x = clamp(enemy.pos.x + enemy.vel.x * dt, enemy.radius, ARENA_WIDTH - enemy.radius);
  enemy.pos.y = clamp(enemy.pos.y + enemy.vel.y * dt, enemy.radius, ARENA_HEIGHT - enemy.radius);
  if (enemy.fireCooldown > 0) return;
  enemy.fireCooldown = pattern.cooldown;
  if (pattern.telegraph === 'summon') {
    spawnRebirthEnemy(state, 'hound', 2);
    spawnRebirthEnemy(state, 'elite', 1.4);
  }
  for (let i = 0; i < pattern.shots && state.projectiles.length < MAX_PROJECTILES; i++) {
    const angle = pattern.telegraph === 'line' ? aim + (i - (pattern.shots - 1) / 2) * .14
      : (i / pattern.shots) * Math.PI * 2 + (pattern.telegraph === 'spiral' ? state.time * .8 : aim);
    const velocity = pattern.telegraph === 'spiral' ? 176 + i * 6 : 215;
    state.projectiles.push({
      id: state.nextId++, owner: 'enemy', pos: { ...enemy.pos },
      vel: { x: Math.cos(angle) * velocity, y: Math.sin(angle) * velocity },
      radius: 6, damage: 12, pierceLeft: 0, ttl: 3.4, hitIds: [],
    });
  }
}

function arsenalImpact(state: GameState, kind: 'blast' | 'arc', pos: Vec2, radius?: number, from?: Vec2): void {
  if (state.impacts.length === MAX_IMPACTS) state.impacts.shift();
  state.impacts.push({
    id: state.nextId++, kind, pos: { ...pos }, radius, from: from && { ...from }, ttl: .24, maxTtl: .24,
  });
}

function hitArea(state: GameState, pos: Vec2, radius: number, damage: number): void {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (distanceSq(enemy.pos, pos) <= (radius + enemy.radius) ** 2) hurtEnemyAt(state, i, damage);
  }
}

function discharge(state: GameState, target: Enemy, start: Vec2, damage: number, jumps: number, radius: number, falloff: number): void {
  let origin = start;
  let enemy: Enemy | undefined = target;
  const seen = new Set<number>();
  for (let i = 0; enemy && i <= jumps; i++) {
    const index = state.enemies.indexOf(enemy);
    if (index < 0) break;
    seen.add(enemy.id);
    arsenalImpact(state, 'arc', enemy.pos, undefined, origin);
    origin = enemy.pos;
    hurtEnemyAt(state, index, damage);
    damage *= falloff;
    let nearest = radius * radius;
    enemy = undefined;
    for (const candidate of state.enemies) {
      if (seen.has(candidate.id)) continue;
      const range = distanceSq(origin, candidate.pos);
      if (range >= nearest) continue;
      nearest = range;
      enemy = candidate;
    }
  }
}

function updateArsenal(state: GameState, target: Enemy | null, dt: number): void {
  const run = state.run;
  if (!run) return;
  const player = state.player;
  run.mines = run.mines.filter(mine => {
    mine.fuse -= dt;
    if (mine.fuse > 0) return true;
    hitArea(state, mine.pos, mine.radius, mine.damage);
    arsenalImpact(state, 'blast', mine.pos, mine.radius);
    return false;
  });
  const aim = Math.atan2(player.aim.y, player.aim.x);
  for (const id of WEAPON_IDS) {
    const rank = run.ranks[id];
    if (!rank) continue;
    run.cooldowns[id] = Math.max(0, (run.cooldowns[id] ?? 0) - dt);
    if (run.cooldowns[id] > 0 || !target) continue;
    const evolution = weaponEvolution(id, run.ranks)?.result;
    const attack = makeWeaponAttack(id, Math.max(rank, evolution?.grantedRank ?? 1), aim, state.time);
    const range = attack.range * (evolution?.rangeMultiplier ?? 1);
    if (distanceSq(player.pos, target.pos) > range ** 2) continue;
    const damage = (attack.damage + (player.stats.damage - 12) * .62) * (evolution?.damageMultiplier ?? 1);
    run.cooldowns[id] = attack.cooldown * (2.4 / player.stats.fireRate) * (evolution?.cooldownMultiplier ?? 1);
    switch (attack.type) {
      case 'single':
      case 'fan':
      case 'pierce': {
        const angles = attack.type === 'fan' ? [...attack.angles] : Array.from({ length: attack.projectiles }, (_, i) => aim + i * .075);
        const extra = player.stats.projectiles - 1;
        for (let i = 0; i < extra; i++) angles.push(aim + (i % 2 ? -1 : 1) * (.15 + Math.floor(i / 2) * .1));
        for (const angle of angles) {
          if (state.projectiles.length >= MAX_PROJECTILES) break;
          const speed = attack.projectileSpeed;
          state.projectiles.push({
            id: state.nextId++, owner: 'player', weapon: id, pos: { ...player.pos },
            vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            radius: attack.type === 'pierce' ? attack.beamWidth : 4, damage,
            pierceLeft: attack.pierce + player.stats.pierce + (evolution?.effect.kind === 'pierceBonus' ? evolution.effect.extraPierce : 0),
            ttl: range / speed, hitIds: [],
          });
          state.stats.shotsFired++;
        }
        break;
      }
      case 'rotating':
        for (const angle of attack.orbAngles) {
          const pos = { x: player.pos.x + Math.cos(angle) * attack.orbitRadius, y: player.pos.y + Math.sin(angle) * attack.orbitRadius };
          hitArea(state, pos, attack.orbRadius * 1.45, damage);
          arsenalImpact(state, 'blast', pos, attack.orbRadius);
          const storm = weaponEvolution('arc', run.ranks)?.result.effect;
          if (storm?.kind === 'chainOnHit') {
            const close = state.enemies.find(enemy => distanceSq(pos, enemy.pos) < (attack.orbRadius * 2) ** 2);
            if (close) discharge(state, close, pos, damage * .55, storm.chainJumps, storm.chainRange, storm.falloff);
          }
        }
        break;
      case 'delayed':
        for (let i = 0; i < attack.count && run.mines.length < 30; i++) {
          const angle = attack.dropAngle + i * .34;
          const pos = {
            x: clamp(player.pos.x + Math.cos(angle) * attack.dropDistance, 12, ARENA_WIDTH - 12),
            y: clamp(player.pos.y + Math.sin(angle) * attack.dropDistance, 12, ARENA_HEIGHT - 12),
          };
          run.mines.push({ pos, fuse: attack.fuse, radius: attack.blastRadius, damage });
        }
        break;
      case 'chain':
        discharge(state, target, player.pos, damage, attack.chainJumps, attack.chainRange, attack.chainFalloff);
        break;
    }
  }
}
function simulate(state: GameState, move: Vec2, pulse: boolean, dt: number): void {
  state.time += dt;
  state.stats.timeAlive += dt;

  // Segurança para estados reconstruídos/testados com hp já zerado.
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = 'gameover';
    return;
  }

  // Impactos são efeitos visuais com ttl; decaem junto com a simulação.
  state.impacts = state.impacts.filter((impact) => {
    impact.ttl -= dt;
    return impact.ttl > 0;
  });

  updatePlayer(state, move, pulse, dt);
  if (state.phase !== 'playing') return;

  if (state.run) {
    updateEncounter(state, dt);
    if (state.phase !== 'playing') return;
  } else updateWave(state, dt);
  updateEnemies(state, dt);

  // Mira automática no inimigo mais próximo (mesmo antes de atirar).
  let nearest: Enemy | null = null;
  let nearestDistance = Infinity;
  for (const enemy of state.enemies) {
    const currentDistance = distanceSq(state.player.pos, enemy.pos);
    if (currentDistance < nearestDistance) {
      nearestDistance = currentDistance;
      nearest = enemy;
    }
  }
  if (nearest) {
    const dir = normalize(
      nearest.pos.x - state.player.pos.x,
      nearest.pos.y - state.player.pos.y,
    );
    if (dir.x !== 0 || dir.y !== 0) state.player.aim = dir;
  }

  if (state.run) updateArsenal(state, nearest, dt);
  else if (state.player.fireCooldown <= 0 && state.enemies.length > 0) {
    firePlayerProjectiles(state, state.player.aim);
    state.player.fireCooldown = 1 / Math.max(0.1, state.player.stats.fireRate);
  }

  updateProjectiles(state, dt);
  if (state.phase !== 'playing') return;

  updateOrbs(state, dt);
  maybeLevelUp(state);
  if (state.phase !== 'playing') return;

  updateContactDamage(state);
  if (state.phase !== 'playing') return;

  // Segurança: se por algum motivo a fase mudou, o estado fica estável.
  maybeLevelUp(state);
}

/**
 * Cria uma partida nova. Sem seed usa uma constante fixa (determinismo por padrão).
 * A seed negativa/fracionária é normalizada para uint32.
 */
export function createGame(seed: number = DEFAULT_SEED, config?: RunConfig): GameState {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) >>> 0 : DEFAULT_SEED;
  const rng = normalizedSeed === 0 ? 0x9e3779b9 : normalizedSeed;
  const maxHp = PLAYER_START_HP;

  const state: GameState = {
    seed: normalizedSeed,
    rng,
    phase: 'playing',
    time: 0,
    bounds: { ...ARENA_BOUNDS },
    player: {
      pos: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 },
      radius: PLAYER_RADIUS,
      hp: maxHp,
      maxHp,
      energy: PLAYER_START_ENERGY,
      maxEnergy: PLAYER_START_ENERGY,
      invuln: 0,
      fireCooldown: 0.2,
      aim: { x: 0, y: -1 },
      level: 1,
      xp: 0,
      xpToNext: xpThreshold(1),
      stats: baseStats(),
      upgrades: {},
    },
    enemies: [],
    projectiles: [],
    orbs: [],
    impacts: [],
    wave: {
      number: 1,
      elapsed: 0,
      toSpawn: waveEnemyCount(1),
      spawnTimer: 0.8,
      intermission: 0,
    },
    stats: {
      kills: 0,
      killsByKind: { drone: 0, brute: 0, shooter: 0 },
      damageDealt: 0,
      damageTaken: 0,
      shotsFired: 0,
      xpCollected: 0,
      timeAlive: 0,
    },
    score: 0,
    upgradeOptions: [],
    nextId: 1,
  };
  if (config) initializeRebirth(state, config);
  return state;
}

/**
 * Avança a simulação. `dt` é limitado a [0, MAX_DT] e dividido em subpassos de
 * 1/60 s, garantindo colisões estáveis mesmo com quedas de frame.
 */
export function stepGame(state: GameState, input: InputState, dtSeconds: number): GameState {
  if (state.phase !== 'playing') return state;

  const dt = Number.isFinite(dtSeconds)
    ? clamp(dtSeconds, 0, MAX_DT)
    : 0;
  if (dt <= 0) return state;

  const next = cloneState(state);
  let remaining = dt;
  let pulse = Boolean(input.pulse);

  while (remaining > EPSILON && next.phase === 'playing') {
    const substep = Math.min(remaining, SIM_STEP);
    simulate(next, input.move, pulse, substep);
    pulse = false;
    remaining -= substep;
  }

  return next;
}

/** Aplica a escolha do menu de upgrade e volta ao jogo. */
export function applyUpgrade(state: GameState, id: UpgradeId): GameState {
  if (state.phase !== 'upgrade') return state;
  if (!state.upgradeOptions.some((option) => option.id === id)) return state;

  const next = cloneState(state);
  if (next.run && id.startsWith('weapon-')) {
    const weapon = id.slice(7) as WeaponId;
    next.run.ranks[weapon] = (next.run.ranks[weapon] ?? 0) + 1;
    next.phase = 'playing';
    next.upgradeOptions = [];
    return next;
  }
  const player = next.player;
  const level = (player.upgrades[id] ?? 0) + 1;
  player.upgrades[id] = level;

  switch (id) {
    case 'damage':
      player.stats.damage += 5;
      break;
    case 'fireRate':
      player.stats.fireRate = Math.min(FIRE_RATE_CAP, player.stats.fireRate + 0.35);
      break;
    case 'speed':
      player.stats.moveSpeed = Math.min(MOVE_SPEED_CAP, player.stats.moveSpeed + 18);
      break;
    case 'maxHp':
      player.maxHp += 20;
      player.hp = Math.min(player.maxHp, player.hp + 20);
      break;
    case 'multishot':
      player.stats.projectiles = Math.min(MULTISHOT_CAP, player.stats.projectiles + 1);
      break;
    case 'magnet':
      player.stats.magnetRadius = Math.min(MAGNET_CAP, player.stats.magnetRadius + 40);
      break;
    case 'pierce':
      player.stats.pierce = Math.min(PIERCE_CAP, player.stats.pierce + 1);
      break;
    case 'regen':
      player.stats.regenPerSec = Math.min(REGEN_CAP, player.stats.regenPerSec + 0.6);
      break;
  }

  next.phase = 'playing';
  next.upgradeOptions = [];
  return next;
}
