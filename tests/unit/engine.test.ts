import { describe, expect, it } from 'vitest';
import { applyUpgrade, createGame, stepGame } from '../../src/game/engine';
import {
  ARENA_BOUNDS,
  ARENA_HEIGHT,
  ARENA_WIDTH,
  MAX_DT,
  type Enemy,
  type EnemyKind,
  type GameState,
  type InputState,
  type UpgradeId,
} from '../../src/game/contracts';

const IDLE: InputState = { move: { x: 0, y: 0 }, pulse: false };

function addEnemy(
  state: GameState,
  kind: EnemyKind,
  x: number,
  y: number,
  overrides: Partial<Enemy> = {},
): GameState {
  const radius = kind === 'brute' ? 20 : kind === 'shooter' ? 13 : 11;
  const enemy: Enemy = {
    id: state.nextId,
    kind,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius,
    hp: 1000,
    maxHp: 1000,
    contactDamage: kind === 'brute' ? 18 : 8,
    fireCooldown: 999,
    xpValue: 2,
    hitFlash: 0,
    ...overrides,
  };

  return {
    ...state,
    nextId: state.nextId + 1,
    enemies: [...state.enemies, enemy],
  };
}

/** Compara os stats antes/depois de aplicar um upgrade efetivamente oferecido. */
function upgradeChangesEffect(state: GameState, id: UpgradeId): boolean {
  const before = state.player;
  const after = applyUpgrade(state, id).player;

  switch (id) {
    case 'damage':
      return after.stats.damage > before.stats.damage;
    case 'fireRate':
      return after.stats.fireRate > before.stats.fireRate;
    case 'speed':
      return after.stats.moveSpeed > before.stats.moveSpeed;
    case 'maxHp':
      return after.maxHp > before.maxHp;
    case 'multishot':
      return after.stats.projectiles > before.stats.projectiles;
    case 'magnet':
      return after.stats.magnetRadius > before.stats.magnetRadius;
    case 'pierce':
      return after.stats.pierce > before.stats.pierce;
    case 'regen':
      return after.stats.regenPerSec > before.stats.regenPerSec;
    default:
      return false;
  }
}

/** Estado sem spawns de onda e sem tiros automáticos, para isolar um teste. */
function quiet(state: GameState): GameState {
  return {
    ...state,
    player: { ...state.player, fireCooldown: 999 },
    wave: { ...state.wave, toSpawn: 0, spawnTimer: 0, intermission: 999 },
  };
}

function playDeterministic(seed: number, steps: number): GameState {
  let state = createGame(seed);

  for (let i = 0; i < steps; i += 1) {
    if (state.phase === 'upgrade') {
      const option = state.upgradeOptions[0];
      if (!option) break;
      state = applyUpgrade(state, option.id);
      continue;
    }
    if (state.phase === 'gameover') break;

    const t = state.time;
    state = stepGame(
      state,
      {
        move: { x: Math.cos(t * 1.7), y: Math.sin(t * 1.1) },
        pulse: i > 0 && i % 240 === 0,
      },
      1 / 60,
    );
  }

  return state;
}

function activeInput(state: GameState): InputState {
  const player = state.player;
  let nearestEnemy: Enemy | undefined;
  let nearestEnemyDistance = Infinity;

  for (const enemy of state.enemies) {
    const dx = enemy.pos.x - player.pos.x;
    const dy = enemy.pos.y - player.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestEnemyDistance) {
      nearestEnemyDistance = dist;
      nearestEnemy = enemy;
    }
  }

  const pulse =
    nearestEnemy !== undefined && nearestEnemyDistance < 170 && player.energy >= 28;

  // Fuga ativa quando algo está perto demais.
  if (nearestEnemy && nearestEnemyDistance < 95) {
    const dx = player.pos.x - nearestEnemy.pos.x;
    const dy = player.pos.y - nearestEnemy.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    return { move: { x: dx / len, y: dy / len }, pulse };
  }

  // Coleta ativa: vai atrás do orbe mais próximo; sem orbes, orbita o centro.
  let target: { x: number; y: number } | undefined;
  let best = Infinity;
  for (const orb of state.orbs) {
    const dist = Math.hypot(orb.pos.x - player.pos.x, orb.pos.y - player.pos.y);
    if (dist < best) {
      best = dist;
      target = orb.pos;
    }
  }
  if (!target) {
    const angle = state.time * 0.8;
    target = {
      x: ARENA_WIDTH / 2 + Math.cos(angle) * 220,
      y: ARENA_HEIGHT / 2 + Math.sin(angle) * 160,
    };
  }

  const dx = target.x - player.pos.x;
  const dy = target.y - player.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) return { move: { x: 0, y: 0 }, pulse };
  return { move: { x: dx / len, y: dy / len }, pulse };
}

function firstUpgradeTime(seed: number, maxSeconds = 60): GameState {
  let state = createGame(seed);
  const steps = Math.floor(maxSeconds * 60);

  for (let i = 0; i < steps; i += 1) {
    if (state.phase !== 'playing') break;
    state = stepGame(state, activeInput(state), 1 / 60);
  }

  return state;
}

describe('createGame', () => {
  it('começa jogável, centralizado e sem inimigos ativos', () => {
    const state = createGame(1234);

    expect(state.phase).toBe('playing');
    expect(state.bounds).toEqual(ARENA_BOUNDS);
    expect(state.player.pos).toEqual({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.hp).toBeGreaterThan(0);
    expect(state.player.level).toBe(1);
    expect(state.player.xp).toBe(0);
    expect(state.wave.number).toBe(1);
    expect(state.wave.toSpawn).toBeGreaterThan(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.projectiles).toHaveLength(0);
    expect(state.upgradeOptions).toHaveLength(0);
    expect(state.score).toBe(0);
    expect(state.stats.kills).toBe(0);
  });

  it('é determinístico na criação e aceita seed padrão', () => {
    expect(createGame(4321)).toEqual(createGame(4321));
    expect(createGame()).toEqual(createGame());
    expect(createGame(1).rng).not.toBe(createGame(2).rng);
  });
});

describe('movimento', () => {
  it('move na velocidade configurada', () => {
    const state = createGame(7);
    const dt = 1 / 60;
    const moved = stepGame(state, { move: { x: 1, y: 0 }, pulse: false }, dt);

    expect(moved.player.pos.x).toBeCloseTo(
      ARENA_WIDTH / 2 + moved.player.stats.moveSpeed * dt,
      6,
    );
    expect(moved.player.pos.y).toBeCloseTo(ARENA_HEIGHT / 2, 6);
  });

  it('normaliza diagonal para não ganhar velocidade', () => {
    const state = createGame(7);
    const dt = 1 / 60;
    const moved = stepGame(state, { move: { x: 1, y: 1 }, pulse: false }, dt);
    const distance = Math.hypot(
      moved.player.pos.x - state.player.pos.x,
      moved.player.pos.y - state.player.pos.y,
    );

    expect(distance).toBeCloseTo(state.player.stats.moveSpeed * dt, 6);
  });

  it('limita dt a MAX_DT por chamada', () => {
    const state = createGame(7);
    const moved = stepGame(state, { move: { x: 1, y: 0 }, pulse: false }, 5);

    expect(moved.time).toBeCloseTo(MAX_DT, 6);
    expect(moved.player.pos.x - ARENA_WIDTH / 2).toBeCloseTo(
      state.player.stats.moveSpeed * MAX_DT,
      6,
    );
  });

  it('mantém o jogador dentro dos bounds', () => {
    let state = quiet(createGame(7));

    for (let i = 0; i < 80; i += 1) {
      state = stepGame(state, { move: { x: 1, y: 1 }, pulse: false }, MAX_DT);
    }

    const minX = state.bounds.x + state.player.radius;
    const maxX = state.bounds.x + state.bounds.w - state.player.radius;
    const minY = state.bounds.y + state.player.radius;
    const maxY = state.bounds.y + state.bounds.h - state.player.radius;

    expect(state.player.pos.x).toBeLessThanOrEqual(maxX + 1e-9);
    expect(state.player.pos.y).toBeLessThanOrEqual(maxY + 1e-9);
    expect(state.player.pos.x).toBeGreaterThanOrEqual(minX - 1e-9);
    expect(state.player.pos.y).toBeGreaterThanOrEqual(minY - 1e-9);

    for (let i = 0; i < 80; i += 1) {
      state = stepGame(state, { move: { x: -1, y: -1 }, pulse: false }, MAX_DT);
    }

    expect(state.player.pos.x).toBeGreaterThanOrEqual(minX - 1e-9);
    expect(state.player.pos.y).toBeGreaterThanOrEqual(minY - 1e-9);
  });

  it('não muta o estado nem a entrada', () => {
    const state = createGame(7);
    const input: InputState = { move: { x: 0.5, y: -0.5 }, pulse: false };
    const stateBefore = JSON.stringify(state);
    const inputBefore = JSON.stringify(input);

    stepGame(state, input, 1 / 60);

    expect(JSON.stringify(state)).toBe(stateBefore);
    expect(JSON.stringify(input)).toBe(inputBefore);
  });
});

describe('colisão, dano e morte', () => {
  it('aplica dano de contato respeitando invulnerabilidade', () => {
    let state = quiet(createGame(5));
    state = addEnemy(state, 'brute', ARENA_WIDTH / 2, ARENA_HEIGHT / 2, {
      hp: 9999,
      maxHp: 9999,
    });

    const first = stepGame(state, IDLE, 1 / 60);
    const hpAfterFirst = first.player.hp;

    expect(hpAfterFirst).toBeCloseTo(82, 6);
    expect(first.player.invuln).toBeGreaterThan(0);
    expect(first.stats.damageTaken).toBeCloseTo(18, 6);

    const second = stepGame(first, IDLE, 1 / 60);
    expect(second.player.hp).toBeCloseTo(hpAfterFirst, 6);
    expect(second.stats.damageTaken).toBeCloseTo(18, 6);
  });

  it('entra em gameover quando a vida chega a zero', () => {
    let state = quiet(createGame(5));
    state = {
      ...state,
      player: { ...state.player, hp: 10 },
    };
    state = addEnemy(state, 'brute', ARENA_WIDTH / 2, ARENA_HEIGHT / 2);

    const dead = stepGame(state, IDLE, 1 / 60);

    expect(dead.player.hp).toBe(0);
    expect(dead.phase).toBe('gameover');
    expect(dead.stats.kills).toBe(
      dead.stats.killsByKind.drone +
        dead.stats.killsByKind.brute +
        dead.stats.killsByKind.shooter,
    );
    expect(stepGame(dead, IDLE, 1)).toBe(dead);
  });

  it('projéteis automáticos abatem, geram orbe e pontuação', () => {
    let state = quiet(createGame(5));
    state = addEnemy(state, 'drone', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 60, {
      hp: 5,
      maxHp: 5,
      xpValue: 2,
    });
    state = {
      ...state,
      player: { ...state.player, fireCooldown: 0 },
    };

    for (let i = 0; i < 30 && state.enemies.length > 0; i += 1) {
      state = stepGame(state, IDLE, 1 / 60);
    }

    expect(state.enemies).toHaveLength(0);
    expect(state.orbs).toHaveLength(1);
    expect(state.orbs[0]?.value).toBe(2);
    expect(state.stats.kills).toBe(1);
    expect(state.stats.killsByKind.drone).toBe(1);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(5);
    expect(state.score).toBeGreaterThanOrEqual(10);
    expect(state.impacts.some((impact) => impact.kind === 'kill')).toBe(true);
  });

  it('perfuração atravessa um inimigo extra', () => {
    let state = quiet(createGame(5));
    state = addEnemy(state, 'drone', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 70, {
      hp: 1000,
      maxHp: 1000,
    });
    state = addEnemy(state, 'drone', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 120, {
      hp: 1000,
      maxHp: 1000,
    });
    state = {
      ...state,
      player: {
        ...state.player,
        fireCooldown: 0,
        stats: { ...state.player.stats, pierce: 1, damage: 20 },
      },
    };

    for (let i = 0; i < 20; i += 1) {
      state = stepGame(state, IDLE, 1 / 60);
    }

    expect(state.stats.damageDealt).toBeCloseTo(40, 6);
  });

  it('o pulso gasta energia, empurra e fere inimigos próximos', () => {
    let state = quiet(createGame(5));
    state = addEnemy(state, 'drone', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 50, {
      hp: 5,
      maxHp: 5,
    });
    const energyBefore = state.player.energy;

    state = stepGame(state, { move: { x: 0, y: 0 }, pulse: true }, 1 / 60);

    expect(state.player.energy).toBeLessThan(energyBefore);
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.kills).toBe(1);
    expect(state.impacts.some((impact) => impact.kind === 'pulse')).toBe(true);
  });
});

describe('ondas', () => {
  it('surge na borda, longe do jogador, e avança de onda após o intervalo', () => {
    let state = createGame(42);

    for (let i = 0; i < 120 && state.enemies.length === 0; i += 1) {
      state = stepGame(state, IDLE, 1 / 60);
    }

    const first = state.enemies[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.kind).toBe('drone');

    const outside =
      first.pos.x < state.bounds.x ||
      first.pos.x > state.bounds.x + state.bounds.w ||
      first.pos.y < state.bounds.y ||
      first.pos.y > state.bounds.y + state.bounds.h;
    expect(outside).toBe(true);
    expect(Math.hypot(first.pos.x - ARENA_WIDTH / 2, first.pos.y - ARENA_HEIGHT / 2)).toBeGreaterThan(
      first.radius + state.player.radius,
    );

    const done: GameState = {
      ...state,
      enemies: [],
      projectiles: [],
      score: 0,
      wave: { ...state.wave, toSpawn: 0, spawnTimer: 0, intermission: 0 },
    };

    const completing = stepGame(done, IDLE, 1 / 60);
    expect(completing.wave.intermission).toBeGreaterThan(0);
    expect(completing.score).toBe(70);

    let nextWave = completing;
    for (let i = 0; i < 80 && nextWave.wave.number === 1; i += 1) {
      nextWave = stepGame(nextWave, IDLE, MAX_DT);
    }

    expect(nextWave.wave.number).toBe(2);
    expect(nextWave.wave.toSpawn).toBeGreaterThan(0);

    let waveTwo = nextWave;
    for (let i = 0; i < 60 && waveTwo.enemies.length === 0; i += 1) {
      waveTwo = stepGame(waveTwo, IDLE, 1 / 60);
    }
    expect(waveTwo.enemies[0]?.kind).toBe('brute');
  });

  it('shooter nascido fora da borda não recua além da margem alcançável', () => {
    let state = quiet(createGame(77));
    state = {
      ...state,
      player: {
        ...state.player,
        pos: { x: ARENA_BOUNDS.x + 40, y: ARENA_HEIGHT / 2 },
        fireCooldown: 999,
      },
    };
    state = addEnemy(state, 'shooter', ARENA_BOUNDS.x - 37, ARENA_HEIGHT / 2, {
      hp: 9999,
      maxHp: 9999,
      fireCooldown: 999,
    });

    for (let i = 0; i < 600; i += 1) {
      state = stepGame(state, IDLE, 1 / 60);
    }

    const shooter = state.enemies.find((enemy) => enemy.kind === 'shooter');
    expect(shooter).toBeDefined();
    // 48 é a margem em que projéteis ainda são atualizados e podem colidir.
    expect(shooter?.pos.x).toBeGreaterThanOrEqual(ARENA_BOUNDS.x - 48 - 1e-9);
    expect(shooter?.pos.x).toBeLessThanOrEqual(
      ARENA_BOUNDS.x + ARENA_WIDTH + 48 + 1e-9,
    );
  });

  it('shooter fora dos limites permanece alcançável e permite concluir a onda', () => {
    let state = createGame(78);
    state = {
      ...state,
      player: {
        ...state.player,
        pos: { x: ARENA_BOUNDS.x + 80, y: ARENA_HEIGHT / 2 },
        fireCooldown: 0,
      },
      wave: { ...state.wave, toSpawn: 0, spawnTimer: 0, intermission: 0 },
    };
    // Começa além da margem: o clamp deve trazê-lo para a faixa alcançável.
    state = addEnemy(state, 'shooter', ARENA_BOUNDS.x - 90, ARENA_HEIGHT / 2, {
      hp: 24,
      maxHp: 24,
      fireCooldown: 999,
    });

    let steps = 0;
    while (state.enemies.length > 0 && steps < 1200) {
      state = stepGame(state, IDLE, 1 / 60);
      steps += 1;
    }

    expect(steps).toBeLessThan(1200);
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.killsByKind.shooter).toBe(1);
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(24);

    const completing = stepGame(state, IDLE, 1 / 60);
    expect(completing.wave.intermission).toBeGreaterThan(0);
  });

  it('os três tipos aparecem até a onda 3', () => {
    const waveThree: GameState = {
      ...createGame(43),
      wave: {
        number: 3,
        elapsed: 0,
        toSpawn: 12 + 3 * 4,
        spawnTimer: 0,
        intermission: 0,
      },
    };

    const spawned = stepGame(waveThree, IDLE, 1 / 60);
    expect(spawned.enemies[0]?.kind).toBe('shooter');
  });

  it('escala a dificuldade e mantém limites de entidades', () => {
    let state = createGame(99);
    state = {
      ...state,
      player: { ...state.player, hp: 1e9, maxHp: 1e9 },
    };

    for (let i = 0; i < 60 * 60; i += 1) {
      if (state.phase === 'upgrade') {
        const option = state.upgradeOptions[0];
        if (option) state = applyUpgrade(state, option.id);
        continue;
      }
      if (state.phase === 'gameover') break;
      const t = state.time;
      state = stepGame(
        state,
        { move: { x: Math.cos(t * 0.9), y: Math.sin(t * 1.3) }, pulse: i % 300 === 0 },
        1 / 60,
      );
    }

    expect(state.time).toBeGreaterThan(50);
    expect(state.wave.number).toBeGreaterThan(1);
    expect(state.enemies.length).toBeLessThanOrEqual(180);
    expect(state.projectiles.length).toBeLessThanOrEqual(400);
    expect(state.orbs.length).toBeLessThanOrEqual(300);
    expect(state.impacts.length).toBeLessThanOrEqual(120);
    expect(Number.isFinite(state.player.pos.x)).toBe(true);
    expect(Number.isFinite(state.player.pos.y)).toBe(true);
    expect(Number.isFinite(state.player.hp)).toBe(true);
    expect(Number.isFinite(state.score)).toBe(true);
  });
});

describe('upgrades', () => {
  function upgradeState(seed: number): GameState {
    let state = createGame(seed);
    state = {
      ...state,
      player: { ...state.player, xp: state.player.xpToNext },
    };
    return stepGame(state, IDLE, 1 / 60);
  }

  it('sobe de nível, pausa e oferece opções distintas', () => {
    const state = upgradeState(9);

    expect(state.phase).toBe('upgrade');
    expect(state.player.level).toBe(2);
    expect(state.player.xp).toBe(0);
    expect(state.upgradeOptions).toHaveLength(3);

    const ids = state.upgradeOptions.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of state.upgradeOptions) {
      expect(option.title.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
      expect(option.nextLevel).toBe(1);
    }
    expect(state.impacts.some((impact) => impact.kind === 'levelUp')).toBe(true);

    // Em upgrade o motor não avança mais.
    expect(stepGame(state, IDLE, 1)).toBe(state);
  });

  it('não oferece pierce nem multishot quando seus efeitos já estão no cap', () => {
    let state = createGame(31);
    state = {
      ...state,
      player: {
        ...state.player,
        xp: state.player.xpToNext,
        stats: { ...state.player.stats, pierce: 6, projectiles: 8 },
        upgrades: { pierce: 6, multishot: 7 },
      },
    };

    state = stepGame(state, IDLE, 1 / 60);

    expect(state.phase).toBe('upgrade');
    const ids = state.upgradeOptions.map((option) => option.id);
    expect(ids).not.toContain('pierce');
    expect(ids).not.toContain('multishot');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(upgradeChangesEffect(state, id)).toBe(true);
    }
  });

  it('preenche três opções úteis quando restam exatamente três upgrades', () => {
    let state = createGame(32);
    state = {
      ...state,
      player: {
        ...state.player,
        xp: state.player.xpToNext,
        stats: {
          ...state.player.stats,
          pierce: 6,
          projectiles: 8,
          fireRate: 12,
          moveSpeed: 336,
          magnetRadius: 520,
          regenPerSec: 5,
        },
        upgrades: {
          pierce: 6,
          multishot: 7,
          fireRate: 8,
          speed: 7,
          magnet: 8,
          regen: 8,
        },
      },
    };

    state = stepGame(state, IDLE, 1 / 60);

    // Só damage, maxHp e speed ainda têm efeito; preenche exatamente três.
    expect(state.phase).toBe('upgrade');
    expect(state.upgradeOptions).toHaveLength(3);
    expect(new Set(state.upgradeOptions.map((option) => option.id)).size).toBe(3);
    for (const option of state.upgradeOptions) {
      expect(upgradeChangesEffect(state, option.id)).toBe(true);
    }
  });

  it('mantém a partida ativa depois de esgotar todos os upgrades', () => {
    const state = createGame(33);
    state.player.xp = state.player.xpToNext;
    state.player.upgrades = {
      damage: 8,
      fireRate: 8,
      speed: 8,
      maxHp: 8,
      multishot: 7,
      magnet: 8,
      pierce: 6,
      regen: 8,
    };

    const next = stepGame(state, IDLE, 1 / 60);

    expect(next.player.level).toBe(2);
    expect(next.phase).toBe('playing');
    expect(next.upgradeOptions).toHaveLength(0);
    expect(stepGame(next, IDLE, 1 / 60).stats.timeAlive).toBeGreaterThan(next.stats.timeAlive);
  });

  it('aplica cada upgrade e volta ao jogo', () => {
    const ids: UpgradeId[] = [
      'damage',
      'fireRate',
      'speed',
      'maxHp',
      'multishot',
      'magnet',
      'pierce',
      'regen',
    ];

    for (const id of ids) {
      let state = upgradeState(9);
      state = {
        ...state,
        upgradeOptions: [
          { id, title: 'teste', description: 'teste', nextLevel: 1 },
        ],
      };

      const before = state.player;
      const applied = applyUpgrade(state, id);

      expect(applied.phase).toBe('playing');
      expect(applied.upgradeOptions).toHaveLength(0);
      expect(applied.player.upgrades[id]).toBe(1);

      switch (id) {
        case 'damage':
          expect(applied.player.stats.damage).toBe(before.stats.damage + 5);
          break;
        case 'fireRate':
          expect(applied.player.stats.fireRate).toBeCloseTo(before.stats.fireRate + 0.35, 6);
          break;
        case 'speed':
          expect(applied.player.stats.moveSpeed).toBe(before.stats.moveSpeed + 18);
          break;
        case 'maxHp':
          expect(applied.player.maxHp).toBe(before.maxHp + 20);
          expect(applied.player.hp).toBe(before.maxHp + 20);
          break;
        case 'multishot':
          expect(applied.player.stats.projectiles).toBe(before.stats.projectiles + 1);
          break;
        case 'magnet':
          expect(applied.player.stats.magnetRadius).toBe(before.stats.magnetRadius + 40);
          break;
        case 'pierce':
          expect(applied.player.stats.pierce).toBe(before.stats.pierce + 1);
          break;
        case 'regen':
          expect(applied.player.stats.regenPerSec).toBeCloseTo(
            before.stats.regenPerSec + 0.6,
            6,
          );
          break;
      }
    }
  });

  it('ignora upgrade inválido e fase errada', () => {
    const state = upgradeState(9);
    expect(applyUpgrade(state, 'inexistente' as UpgradeId)).toBe(state);

    const playing = createGame(9);
    expect(applyUpgrade(playing, 'damage')).toBe(playing);
  });
});

describe('determinismo e reinício', () => {
  it('mesma seed + mesmos inputs produz o mesmo estado', () => {
    const first = playDeterministic(123, 900);
    const second = playDeterministic(123, 900);

    expect(first).toEqual(second);
    expect(first.time).toBeGreaterThan(0);
  });

  it('seeds diferentes produzem partidas diferentes', () => {
    expect(createGame(1).seed).not.toBe(createGame(2).seed);
    expect(playDeterministic(1, 300)).not.toEqual(playDeterministic(2, 300));
  });

  it('reiniciar com a mesma seed restaura o estado inicial', () => {
    const initial = createGame(2024);
    const played = playDeterministic(2024, 600);
    const restarted = createGame(2024);

    expect(restarted).toEqual(initial);
    expect(restarted.time).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.enemies).toHaveLength(0);
    expect(restarted.upgradeOptions).toHaveLength(0);
    expect(restarted.stats.kills).toBe(0);
    expect(played.time).toBeGreaterThan(0);
    expect(played).not.toEqual(initial);
  });

  it('primeira escolha acontece entre 20 s e 45 s numa partida ativa', () => {
    const state = firstUpgradeTime(2026, 60);

    expect(state.phase).toBe('upgrade');
    expect(state.time).toBeGreaterThanOrEqual(20);
    expect(state.time).toBeLessThanOrEqual(45);
    expect(state.upgradeOptions.length).toBeGreaterThanOrEqual(1);
  });

  it('5 minutos sem NaN e com arrays limitados', () => {
    let state = createGame(999);
    state = {
      ...state,
      player: { ...state.player, hp: 1e9, maxHp: 1e9 },
    };

    const started = performance.now();
    let iterations = 0;
    while (state.time < 300 && iterations < 30_000) {
      iterations += 1;
      if (state.phase === 'upgrade') {
        const option = state.upgradeOptions[0];
        if (option) state = applyUpgrade(state, option.id);
        continue;
      }
      if (state.phase === 'gameover') break;
      const t = state.time;
      state = stepGame(
        state,
        { move: { x: Math.cos(t * 0.9), y: Math.sin(t * 1.3) }, pulse: iterations % 300 === 0 },
        1 / 60,
      );
    }
    const averageStepMs = (performance.now() - started) / Math.max(1, iterations);

    expect(state.time).toBeGreaterThanOrEqual(299.9);
    expect(state.phase).toBe('playing');
    expect(state.enemies.length).toBeLessThanOrEqual(180);
    expect(state.projectiles.length).toBeLessThanOrEqual(400);
    expect(state.orbs.length).toBeLessThanOrEqual(300);
    expect(state.impacts.length).toBeLessThanOrEqual(120);
    expect(Number.isFinite(state.time)).toBe(true);
    expect(Number.isFinite(state.player.pos.x)).toBe(true);
    expect(Number.isFinite(state.player.pos.y)).toBe(true);
    expect(Number.isFinite(state.player.hp)).toBe(true);
    expect(Number.isFinite(state.player.xp)).toBe(true);
    expect(Number.isFinite(state.score)).toBe(true);
    for (const enemy of state.enemies) {
      expect(Number.isFinite(enemy.pos.x)).toBe(true);
      expect(Number.isFinite(enemy.pos.y)).toBe(true);
      expect(Number.isFinite(enemy.hp)).toBe(true);
    }
    expect(averageStepMs).toBeLessThan(5);
  });
});
