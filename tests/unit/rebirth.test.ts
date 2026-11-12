import { describe, expect, it } from 'vitest';
import { applyUpgrade, createGame, stepGame } from '../../src/game/engine.js';
import type { Enemy, GameState, InputState } from '../../src/game/contracts.js';
import { BIOMES, RUN_SECONDS } from '../../src/game/rebirth-encounters.js';

const idle: InputState = { move: { x: 0, y: 0 }, pulse: false };
const fixture = () => createGame(73, { character: 'vesper', biome: 'station' });

function targetAt(state: GameState, x: number, y: number, overrides: Partial<Enemy> = {}) {
  state.enemies.push({
    id: state.nextId++, kind: 'brute', pos: { x, y }, vel: { x: 0, y: 0 },
    radius: 18, hp: 150, maxHp: 150, contactDamage: 0, fireCooldown: 0,
    xpValue: 4, hitFlash: 0, ...overrides,
  });
}

describe('Rebirth: partida integrada', () => {
  it('escolhas iniciam builds distintas e preservam a API clássica', () => {
    const vesper = fixture();
    const rook = createGame(73, { character: 'rook', biome: 'nursery' });
    expect(vesper.run?.ranks).toEqual({ coil: 1 });
    expect(rook.run?.ranks).toEqual({ scatter: 1 });
    expect(rook.player.maxHp).toBeGreaterThan(vesper.player.maxHp);
    expect(rook.player.stats.moveSpeed).toBeLessThan(vesper.player.stats.moveSpeed);
    expect(createGame(73).run).toBeUndefined();
  });

  it('respeita os obstáculos e preserva a entrada imutável', () => {
    const state = fixture();
    const obstacle = BIOMES.station.obstacles[0];
    state.player.pos = { x: obstacle.x, y: obstacle.y };
    const before = structuredClone(state);
    const next = stepGame(state, idle, 1 / 60);
    expect(state).toEqual(before);
    expect(Math.hypot(next.player.pos.x - obstacle.x, next.player.pos.y - obstacle.y))
      .toBeGreaterThanOrEqual(obstacle.radius + next.player.radius - 1e-8);
  });

  it('dispara um arco com saltos e detona minas armadas com atraso', () => {
    const state = fixture();
    state.run!.ranks = { arc: 2, mine: 1 };
    targetAt(state, 520, 360);
    targetAt(state, 544, 360);
    const next = stepGame(state, idle, 1 / 60);
    expect(next.stats.damageDealt).toBeGreaterThan(0);
    expect(next.impacts.filter(impact => impact.kind === 'arc').length).toBeGreaterThanOrEqual(2);
    expect(next.run!.mines).not.toHaveLength(0);
    expect(state.run!.mines).toHaveLength(0);
    next.run!.mines[0].pos = { ...next.enemies[0].pos };
    next.run!.mines[0].fuse = .001;
    const exploded = stepGame(next, idle, 1 / 60);
    expect(exploded.stats.damageDealt).toBeGreaterThan(next.stats.damageDealt);
    expect(exploded.impacts.some(impact => impact.kind === 'blast')).toBe(true);
  });

  it('mostra escolhas que alteram o arsenal e fecha o menu', () => {
    let state = fixture();
    for (let seed = 1; seed <= 10; seed++) {
      state = createGame(seed, { character: 'vesper', biome: 'station' });
      state.player.xp = state.player.xpToNext;
      state = stepGame(state, idle, 1 / 60);
      if (state.upgradeOptions.some(option => option.id.startsWith('weapon-'))) break;
    }
    const choice = state.upgradeOptions.find(option => option.id.startsWith('weapon-'));
    expect(choice).toBeDefined();
    const next = applyUpgrade(state, choice!.id);
    expect(next.phase).toBe('playing');
    expect(next.run!.ranks).not.toEqual(state.run!.ranks);
    expect(state.upgradeOptions.length).toBe(3);
  });

  it('desencadeia o encontro da Rainha e exige a derrota do chefe para vencer', () => {
    const state = fixture();
    state.time = RUN_SECONDS - 60;
    state.stats.timeAlive = state.time;
    const boss = stepGame(state, idle, 1 / 60);
    const queen = boss.enemies.find(enemy => enemy.variant === 'queen');
    expect(queen).toBeDefined();
    expect(boss.run!.bossSpawned).toBe(true);
    boss.time = RUN_SECONDS;
    expect(stepGame(boss, idle, 1 / 60).phase).toBe('playing');
    queen!.hp = 1;
    queen!.pos = { x: 520, y: 360 };
    const down = stepGame(boss, { ...idle, pulse: true }, 1 / 60);
    expect(down.phase).toBe('victory');
    expect(down.run!.bossDefeated).toBe(true);
    expect(down.score).toBeGreaterThan(3000);
  });

  it('produz a mesma progressão para a mesma seed e sequência de entradas', () => {
    function play() {
      let state = fixture();
      for (let i = 0; i < 2000 && state.phase !== 'gameover'; i++) {
        state = state.phase === 'upgrade'
          ? applyUpgrade(state, state.upgradeOptions[0].id)
          : stepGame(state, { move: { x: Math.cos(i / 93), y: Math.sin(i / 93) }, pulse: i % 270 === 0 }, 1 / 60);
      }
      return state;
    }
    const first = play();
    expect(first.stats.kills).toBeGreaterThan(0);
    expect(first).toEqual(play());
  });
});
