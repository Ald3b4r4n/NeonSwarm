import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../../src/game/engine.js';
import { WEAPONS, WEAPON_IDS } from '../../src/game/rebirth-weapons.js';

const idle = { move: { x: 0, y: 0 }, pulse: false };
function firingState(rank: number, level = 1) {
  const state = createGame(51, { character: 'vesper', biome: 'station' });
  state.run!.ranks.coil = rank;
  state.player.level = level;
  state.enemies.push({
    id: state.nextId++, kind: 'brute', variant: 'brute', pos: { x: 570, y: 360 }, vel: { x: 0, y: 0 },
    radius: 20, hp: 300, maxHp: 300, contactDamage: 0, fireCooldown: 0, xpValue: 10, hitFlash: 0,
  });
  return state;
}

describe('progressão visual e funcional da Preview 2', () => {
  it.each(WEAPON_IDS)('%s ganha dano em cada um dos quatro upgrades', id => {
    for (let rank = 2; rank <= 5; rank++) {
      expect(WEAPONS[id].stats(rank).damage).toBeGreaterThan(WEAPONS[id].stats(rank - 1).damage);
    }
  });

  it('leva os cinco ranks de Bobina ao projétil e libera perfuração no terceiro', () => {
    for (let rank = 1; rank <= 5; rank++) {
      const next = stepGame(firingState(rank), idle, 1 / 60);
      const shot = next.projectiles.find(item => item.weapon === 'coil');
      expect(shot?.rank).toBe(rank);
      expect(shot?.damage).toBe(WEAPONS.coil.stats(rank).damage);
      expect(shot?.pierceLeft).toBe(rank >= 3 ? 1 : 0);
    }
  });

  it.each([1, 2, 3, 4, 5])('a Bobina rank %s atinge vizinhos somente a partir do terceiro rank', rank => {
    const state = firingState(rank);
    const primary = state.enemies[0];
    for (let i = 1; i <= 3; i++) state.enemies.push({
      ...primary, id: state.nextId++, pos: { x: primary.pos.x, y: primary.pos.y + 55 * i },
    });
    state.run!.freezeEnemies = true;
    state.wave.spawnTimer = 100;
    state.projectiles.push({
      id: state.nextId++, owner: 'player', weapon: 'coil', rank, pos: { ...primary.pos }, vel: { x: 0, y: 0 },
      radius: 4, damage: 30, pierceLeft: 0, ttl: .1, hitIds: [],
    });
    state.run!.cooldowns.coil = 5;
    const next = stepGame(state, idle, 1 / 60);
    expect(next.impacts.filter(impact => impact.kind === 'arc' && impact.weapon === 'coil')).toHaveLength(Math.max(0, rank - 2));
    expect(next.enemies.filter(enemy => enemy.hp < 300)).toHaveLength(1 + Math.max(0, rank - 2));
  });

  it('faz o Pulso de rank 5 alcançar e atingir mais forte que o rank 1', () => {
    const pulse = { ...idle, pulse: true };
    const first = stepGame(firingState(1), pulse, 1 / 60);
    const last = stepGame(firingState(1, 21), pulse, 1 / 60);
    const before = first.impacts.find(item => item.kind === 'pulse')!;
    const after = last.impacts.find(item => item.kind === 'pulse')!;
    expect([before.rank, after.rank]).toEqual([1, 5]);
    expect(after.radius).toBeGreaterThan(before.radius!);
    expect(last.stats.damageDealt).toBeGreaterThan(first.stats.damageDealt);
  });
});
