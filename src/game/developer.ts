import type {
  BiomeId,
  CharacterId,
  Enemy,
  EnemyVariant,
  GameState,
  WeaponId,
} from './contracts';
import { ENEMIES, RUN_SECONDS } from './rebirth-encounters';
import {
  WEAPON_EVOLUTIONS,
  WEAPON_MAX_RANK,
  type WeaponEvolutionId,
} from './rebirth-weapons';

const MAX_ENEMIES = 180;
const MAX_LEVEL = 999;
const MAX_MOVE_SPEED = 2_000;
const DEV_INVULNERABILITY_SECONDS = 1_000_000_000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Ações locais que alteram diretamente um GameState. */
export type DeveloperStateAction =
  | { type: 'player/set-invincibility'; enabled: boolean }
  | { type: 'player/set-health'; hp: number; maxHp?: number }
  | { type: 'player/add-xp'; amount: number }
  | { type: 'player/set-level'; level: number }
  | { type: 'player/set-speed'; speed: number }
  | { type: 'weapon/set-rank'; weapon: WeaponId; rank: number }
  | { type: 'weapon/unlock-synergy'; evolution: WeaponEvolutionId }
  | { type: 'world/set-wave'; wave: number }
  | { type: 'world/spawn'; variant: EnemyVariant };

/**
 * Ações de sessão que o App deve tratar (relógio, opções de próxima partida,
 * overlay de FPS ou reinício pela criação normal de uma partida).
 */
export type DeveloperSessionAction =
  | { type: 'session/set-sim-speed'; speed: number }
  | { type: 'session/set-frozen'; frozen: boolean }
  | { type: 'session/set-fps-visible'; visible: boolean }
  | { type: 'session/set-fps-limit'; fps: 0 | 30 | 60 | 120 }
  | { type: 'session/select-character'; character: CharacterId }
  | { type: 'session/select-biome'; biome: BiomeId }
  | { type: 'session/select-weapon'; weapon: WeaponId }
  | { type: 'session/restart' };

/** União enviada pelo painel; o App separa ações de estado das de sessão. */
export type DeveloperAction = DeveloperStateAction | DeveloperSessionAction;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function levelThreshold(level: number, rebirth: boolean): number {
  if (rebirth) return 22 + (level - 1) * 13 + Math.floor(level ** 2 * 0.28);
  return 34 + (level - 1) * 14;
}

function setWeaponRank(state: GameState, weapon: WeaponId, requestedRank: number): GameState {
  if (!state.run || !Number.isFinite(requestedRank)) return state;

  const rank = clamp(Math.floor(requestedRank), 0, WEAPON_MAX_RANK);
  const ranks = { ...state.run.ranks };
  const cooldowns = { ...state.run.cooldowns, [weapon]: 0 };
  if (rank === 0) delete ranks[weapon];
  else ranks[weapon] = rank;

  return {
    ...state,
    run: { ...state.run, ranks, cooldowns },
  };
}

function unlockSynergy(state: GameState, evolutionId: WeaponEvolutionId): GameState {
  if (!state.run) return state;
  const evolution = WEAPON_EVOLUTIONS.find((item) => item.id === evolutionId);
  if (!evolution) return state;

  const ranks = { ...state.run.ranks };
  for (const [weapon, rank] of Object.entries(evolution.requires)) {
    if (rank !== undefined) ranks[weapon as WeaponId] = rank;
  }
  ranks[evolution.result.weapon] = evolution.result.grantedRank;

  return {
    ...state,
    run: {
      ...state.run,
      ranks,
      cooldowns: { ...state.run.cooldowns, [evolution.result.weapon]: 0 },
    },
  };
}

function spawnEnemy(state: GameState, variant: EnemyVariant): GameState {
  if (state.enemies.length >= MAX_ENEMIES && variant !== 'queen') return state;
  if (variant === 'queen' && state.enemies.some((enemy) => enemy.variant === 'queen')) {
    return state;
  }

  const definition = ENEMIES[variant];
  const kind: Enemy['kind'] =
    variant === 'brute' || variant === 'elite' || variant === 'queen'
      ? 'brute'
      : variant === 'shooter' || variant === 'spore'
        ? 'shooter'
        : 'drone';
  const radius = definition.radius;
  const angle = state.enemies.length * GOLDEN_ANGLE;
  const distance = Math.max(150, state.player.radius + radius + 48);
  const pos = variant === 'queen'
    ? { x: state.bounds.x + state.bounds.w / 2, y: state.bounds.y + radius + 24 }
    : {
        x: clamp(
          state.player.pos.x + Math.cos(angle) * distance,
          state.bounds.x + radius,
          state.bounds.x + state.bounds.w - radius,
        ),
        y: clamp(
          state.player.pos.y + Math.sin(angle) * distance,
          state.bounds.y + radius,
          state.bounds.y + state.bounds.h - radius,
        ),
      };
  const waveScale = variant === 'queen'
    ? 1
    : 1 + Math.max(0, state.wave.number - 1) * 0.2;
  const maxHp = Math.round(definition.hp * waveScale);
  const enemy: Enemy = {
    id: state.nextId,
    kind,
    variant,
    pos,
    vel: { x: 0, y: 0 },
    radius,
    hp: maxHp,
    maxHp,
    speed: definition.speed,
    contactDamage: Math.round(definition.contactDamage * (1 + (waveScale - 1) * 0.45)),
    fireCooldown: 1.3,
    xpValue: definition.xpValue,
    hitFlash: 0,
  };

  const enemies = variant === 'queen' && state.enemies.length >= MAX_ENEMIES
    ? state.enemies.slice(1)
    : state.enemies;
  return {
    ...state,
    enemies: [...enemies, enemy],
    nextId: state.nextId + 1,
    ...(variant === 'queen' && state.run
      ? { run: { ...state.run, bossSpawned: true, bossDefeated: false } }
      : {}),
  };
}

/**
 * Aplica uma ação de estado sem mutar `state`. Ações `session/*` são contratos
 * para `onAction` e não devem ser passadas a esta função.
 */
export function applyDeveloperAction(
  state: GameState,
  action: DeveloperStateAction,
): GameState {
  switch (action.type) {
    case 'player/set-invincibility':
      return {
        ...state,
        player: {
          ...state.player,
          invuln: action.enabled ? DEV_INVULNERABILITY_SECONDS : 0,
        },
      };

    case 'player/set-health': {
      if (!Number.isFinite(action.hp)) return state;
      const maxHp = action.maxHp ?? state.player.maxHp;
      if (!Number.isFinite(maxHp) || maxHp <= 0) return state;
      const hp = clamp(action.hp, 0, maxHp);
      return {
        ...state,
        phase: hp === 0 ? 'gameover' : state.phase === 'gameover' ? 'playing' : state.phase,
        player: { ...state.player, hp, maxHp },
      };
    }

    case 'player/add-xp':
      if (!Number.isFinite(action.amount) || !Number.isFinite(state.player.xp + action.amount)) return state;
      return {
        ...state,
        player: { ...state.player, xp: Math.max(0, state.player.xp + action.amount) },
      };

    case 'player/set-level': {
      if (!Number.isFinite(action.level)) return state;
      const level = clamp(Math.floor(action.level), 1, MAX_LEVEL);
      return {
        ...state,
        player: {
          ...state.player,
          level,
          xp: 0,
          xpToNext: levelThreshold(level, Boolean(state.run)),
        },
      };
    }

    case 'player/set-speed':
      if (!Number.isFinite(action.speed)) return state;
      return {
        ...state,
        player: {
          ...state.player,
          stats: { ...state.player.stats, moveSpeed: clamp(action.speed, 0, MAX_MOVE_SPEED) },
        },
      };

    case 'weapon/set-rank':
      return setWeaponRank(state, action.weapon, action.rank);

    case 'weapon/unlock-synergy':
      return unlockSynergy(state, action.evolution);

    case 'world/set-wave': {
      if (!Number.isFinite(action.wave)) return state;
      const wave = clamp(Math.floor(action.wave), 1, state.run ? 12 : 999);
      if (state.run) {
        const time = (wave - 1) * 60;
        return {
          ...state,
          time: Math.min(time, RUN_SECONDS),
          wave: { number: wave, elapsed: 0, toSpawn: 0, spawnTimer: 0, intermission: 0 },
        };
      }
      return {
        ...state,
        wave: {
          number: wave,
          elapsed: 0,
          toSpawn: Math.min(90, 12 + wave * 4),
          spawnTimer: 0,
          intermission: 0,
        },
      };
    }

    case 'world/spawn':
      return spawnEnemy(state, action.variant);
  }
}
