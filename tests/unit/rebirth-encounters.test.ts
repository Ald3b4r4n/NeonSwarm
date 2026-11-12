import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../src/game/contracts';
import {
  BIOMES,
  CHARACTERS,
  ENCOUNTERS,
  ENEMIES,
  RUN_SECONDS,
  bossPattern,
  encounterAt,
  type BiomeId,
  type RebirthEnemyKind,
  type StartingWeaponId,
} from '../../src/game/rebirth-encounters';

const BIOME_IDS: readonly BiomeId[] = ['station', 'nursery'];
const ENEMY_KINDS: readonly RebirthEnemyKind[] = [
  'drone',
  'brute',
  'shooter',
  'spore',
  'hound',
  'elite',
  'queen',
];
const WEAPON_IDS: readonly StartingWeaponId[] = ['coil', 'scatter', 'lance', 'orbit', 'mine', 'arc'];

describe('rebirth encounters', () => {
  it('expõe a duração de 12 minutos e catálogos completos', () => {
    expect(RUN_SECONDS).toBe(720);

    for (const kind of ENEMY_KINDS) {
      expect(ENEMIES[kind].kind).toBe(kind);
      expect(ENEMIES[kind].hp).toBeGreaterThan(0);
    }
    expect(ENEMIES.queen.boss).toBe(true);
    expect(ENEMIES.elite.boss).toBe(false);
  });

  it('cobre 0–720 s sem lacunas nos dois biomas', () => {
    for (const biome of BIOME_IDS) {
      const phases = ENCOUNTERS[biome];
      expect(phases[0].start).toBe(0);
      expect(phases[phases.length - 1].end).toBe(RUN_SECONDS);
      for (let i = 1; i < phases.length; i += 1) {
        expect(phases[i].start).toBe(phases[i - 1].end);
      }

      for (let seconds = 0; seconds <= RUN_SECONDS; seconds += 10) {
        const spawn = encounterAt(seconds, 0, biome);
        expect(spawn.biome).toBe(biome);
        expect(spawn.elapsed).toBe(seconds);
        expect(spawn.cadence).toBeGreaterThan(0);
        expect(spawn.scale).toBeGreaterThanOrEqual(1);
        expect(ENEMIES[spawn.kind]).toBeDefined();
      }
    }
  });

  it('varia o tipo pelo índice e limita entradas inválidas', () => {
    const first = encounterAt(300, 0, 'station');
    const second = encounterAt(300, 1, 'station');
    expect(first.kind).not.toBe(second.kind);
    expect(encounterAt(300, 0, 'station')).toEqual(first);

    expect(encounterAt(-40, 0, 'station')).toEqual(encounterAt(0, 0, 'station'));
    expect(encounterAt(9999, 0, 'station')).toEqual(encounterAt(RUN_SECONDS, 0, 'station'));
    expect(encounterAt(300, -4, 'station')).toEqual(first);
    expect(encounterAt(300, Number.NaN, 'station')).toEqual(first);
  });

  it('escala a dificuldade ao longo da partida e diferencia os biomas', () => {
    const early = encounterAt(30, 0, 'station');
    const late = encounterAt(650, 0, 'station');
    expect(late.scale).toBeGreaterThan(early.scale);
    expect(late.cadence).toBeLessThan(early.cadence);

    expect(encounterAt(30, 0, 'station').cadence).not.toBeCloseTo(
      encounterAt(30, 0, 'nursery').cadence,
      5,
    );
    expect(encounterAt(700, 0, 'nursery').kind).toBe('queen');
    expect(encounterAt(700, 0, 'station').kind).toBe('queen');
  });

  it('gera padrões de chefe determinísticos e mais agressivos com vida baixa', () => {
    const full = bossPattern(12, 1);
    const weak = bossPattern(12, 0.2);

    expect(bossPattern(12, 1)).toEqual(full);
    expect(full.telegraph).toBe(weak.telegraph);
    expect(full.telegraphTime).toBeGreaterThan(0);
    expect(weak.cooldown).toBeLessThan(full.cooldown);
    expect(weak.speed).toBeGreaterThan(full.speed);
    expect(weak.shots).toBeGreaterThan(full.shots);

    expect(bossPattern(0, 1).telegraph).toBe('line');
    expect(bossPattern(6, 1).telegraph).toBe('radial');
    expect(bossPattern(12, Number.NaN).healthRatio).toBe(1);
  });

  it('usa personagens com vida, velocidade e arma inicial diferentes', () => {
    const characters = Object.values(CHARACTERS);
    expect(characters).toHaveLength(2);
    expect(new Set(characters.map((c) => c.maxHp)).size).toBe(2);
    expect(new Set(characters.map((c) => c.moveSpeed)).size).toBe(2);
    expect(new Set(characters.map((c) => c.startWeapon)).size).toBe(2);

    for (const character of characters) {
      expect(WEAPON_IDS).toContain(character.startWeapon);
    }
  });

  it('mantém obstáculos circulares pequenos e dentro das bordas da arena', () => {
    for (const biome of BIOME_IDS) {
      const obstacles = BIOMES[biome].obstacles;
      expect(obstacles.length).toBeGreaterThan(0);

      for (const obstacle of obstacles) {
        expect(obstacle.radius).toBeGreaterThan(0);
        expect(obstacle.radius).toBeLessThanOrEqual(24);
        expect(obstacle.x - obstacle.radius).toBeGreaterThanOrEqual(0);
        expect(obstacle.x + obstacle.radius).toBeLessThanOrEqual(ARENA_WIDTH);
        expect(obstacle.y - obstacle.radius).toBeGreaterThanOrEqual(0);
        expect(obstacle.y + obstacle.radius).toBeLessThanOrEqual(ARENA_HEIGHT);

        const edgeGap = Math.min(
          obstacle.x - obstacle.radius,
          ARENA_WIDTH - (obstacle.x + obstacle.radius),
          obstacle.y - obstacle.radius,
          ARENA_HEIGHT - (obstacle.y + obstacle.radius),
        );
        expect(edgeGap).toBeLessThanOrEqual(100);
      }
    }
  });
});
