import { describe, expect, it } from 'vitest';
import {
  WEAPONS,
  WEAPON_EVOLUTIONS,
  WEAPON_IDS,
  WEAPON_MAX_RANK,
  clampWeaponRank,
  makeWeaponAttack,
  meetsWeaponEvolution,
  weaponEvolution,
} from '../../src/game/rebirth-weapons';

describe('WEAPONS', () => {
  it('expõe exatamente as seis armas originais', () => {
    expect(WEAPON_IDS).toEqual(['coil', 'scatter', 'lance', 'orbit', 'mine', 'arc']);
    expect(Object.keys(WEAPONS).sort()).toEqual([...WEAPON_IDS].sort());
    expect(WEAPON_IDS).toHaveLength(6);
  });

  it('cada arma tem título, descrição, rank máximo e stats crescentes de rank 1 a 5', () => {
    for (const id of WEAPON_IDS) {
      const weapon = WEAPONS[id];
      expect(weapon.id).toBe(id);
      expect(weapon.title.length).toBeGreaterThan(0);
      expect(weapon.description.length).toBeGreaterThan(0);
      expect(weapon.maxRank).toBe(WEAPON_MAX_RANK);

      const first = weapon.stats(1);
      const last = weapon.stats(WEAPON_MAX_RANK);
      expect(last.damage).toBeGreaterThan(first.damage);
      expect(last.cooldown).toBeLessThanOrEqual(first.cooldown);
      expect(last.range).toBeGreaterThanOrEqual(first.range);
    }
  });
});

describe('makeWeaponAttack — seis tipos', () => {
  it('coil: disparo único mirado', () => {
    const attack = makeWeaponAttack('coil', 1, 0.25, 0);
    expect(attack.type).toBe('single');
    if (attack.type !== 'single') throw new Error('tipo inesperado');
    expect(attack.weapon).toBe('coil');
    expect(attack.aimAngle).toBeCloseTo(0.25);
    expect(attack.projectiles).toBe(1);
    expect(attack.damage).toBe(WEAPONS.coil.stats(1).damage);
    expect(attack.cooldown).toBeGreaterThan(0);
    expect(attack.range).toBeGreaterThan(0);
  });

  it('scatter: leque simétrico em torno da mira', () => {
    const attack = makeWeaponAttack('scatter', 3, 1, 0);
    expect(attack.type).toBe('fan');
    if (attack.type !== 'fan') throw new Error('tipo inesperado');
    expect(attack.angles).toHaveLength(attack.projectiles);
    expect(attack.projectiles).toBe(5);
    const middle = attack.angles[Math.floor(attack.angles.length / 2)];
    expect(middle).toBeCloseTo(1);
    expect(attack.angles[0]).toBeCloseTo(1 - attack.spread / 2);
    expect(attack.angles[attack.angles.length - 1]).toBeCloseTo(1 + attack.spread / 2);
  });

  it('lance: perfuração com alcance e feixe', () => {
    const attack = makeWeaponAttack('lance', 2, -0.5, 0);
    expect(attack.type).toBe('pierce');
    if (attack.type !== 'pierce') throw new Error('tipo inesperado');
    expect(attack.pierce).toBeGreaterThanOrEqual(2);
    expect(attack.projectileSpeed).toBeGreaterThan(0);
    expect(attack.beamWidth).toBeGreaterThan(0);
    expect(attack.range).toBeGreaterThanOrEqual(WEAPONS.lance.stats(1).range);
  });

  it('orbit: hazard rotativo determinístico que depende de time', () => {
    const t0 = makeWeaponAttack('orbit', 2, 0, 0);
    const again = makeWeaponAttack('orbit', 2, 0, 0);
    const later = makeWeaponAttack('orbit', 2, 0, 1);
    expect(t0.type).toBe('rotating');
    if (t0.type !== 'rotating' || later.type !== 'rotating') throw new Error('tipo inesperado');
    expect(t0).toEqual(again);
    expect(t0.orbAngles).toHaveLength(t0.count);
    expect(t0.orbAngles).not.toEqual(later.orbAngles);
    expect(t0.orbitRadius).toBeGreaterThan(0);
    expect(t0.spinSpeed).toBeGreaterThan(0);
  });

  it('mine: explosão atrasada com fusível e raio de área', () => {
    const attack = makeWeaponAttack('mine', 1, Math.PI / 2, 0);
    expect(attack.type).toBe('delayed');
    if (attack.type !== 'delayed') throw new Error('tipo inesperado');
    expect(attack.fuse).toBeGreaterThan(0);
    expect(attack.blastRadius).toBeGreaterThan(0);
    expect(attack.dropAngle).toBeCloseTo(Math.PI / 2);
    expect(attack.dropDistance).toBeGreaterThan(0);
  });

  it('arc: cadeia com saltos, alcance e queda de dano', () => {
    const attack = makeWeaponAttack('arc', 3, 0.75, 0);
    expect(attack.type).toBe('chain');
    if (attack.type !== 'chain') throw new Error('tipo inesperado');
    expect(attack.chainJumps).toBeGreaterThanOrEqual(2);
    expect(attack.chainRange).toBeGreaterThan(0);
    expect(attack.chainFalloff).toBeGreaterThan(0);
    expect(attack.chainFalloff).toBeLessThanOrEqual(1);
  });

  it('é puro e determinístico para a mesma entrada', () => {
    for (const id of WEAPON_IDS) {
      expect(makeWeaponAttack(id, 4, 1.234, 9.5)).toEqual(makeWeaponAttack(id, 4, 1.234, 9.5));
    }
  });
});

describe('progressão de ranks', () => {
  it('limita ranks a [1, WEAPON_MAX_RANK]', () => {
    expect(clampWeaponRank(-5)).toBe(1);
    expect(clampWeaponRank(0)).toBe(1);
    expect(clampWeaponRank(2.9)).toBe(2);
    expect(clampWeaponRank(999)).toBe(WEAPON_MAX_RANK);
    expect(makeWeaponAttack('coil', 999, 0, 0).rank).toBe(WEAPON_MAX_RANK);
    expect(makeWeaponAttack('coil', 0, 0, 0).rank).toBe(1);
  });

  it('rank 1 e rank 5 do mesmo tipo refletem dano e cadência melhores', () => {
    const low = makeWeaponAttack('coil', 1, 0, 0);
    const high = makeWeaponAttack('coil', 5, 0, 0);
    expect(high.damage).toBeGreaterThan(low.damage);
    expect(high.cooldown).toBeLessThan(low.cooldown);
    expect(high.range).toBeGreaterThan(low.range);
  });

  it('scatter ganha projéteis e abertura com o rank', () => {
    const low = makeWeaponAttack('scatter', 1, 0, 0);
    const high = makeWeaponAttack('scatter', 5, 0, 0);
    if (low.type !== 'fan' || high.type !== 'fan') throw new Error('tipo inesperado');
    expect(high.projectiles).toBeGreaterThan(low.projectiles);
    expect(high.spread).toBeGreaterThan(low.spread);
    expect(high.angles).toHaveLength(high.projectiles);
  });
});

describe('sinergias', () => {
  it('prismLance exige coil 3 + lance 2 e evolui a lance', () => {
    expect(weaponEvolution('lance', { coil: 2, lance: 2 })).toBeNull();
    expect(weaponEvolution('lance', { coil: 3, lance: 2 })).toMatchObject({
      id: 'prismLance',
      requires: { coil: 3, lance: 2 },
      result: {
        weapon: 'lance',
        attackType: 'pierce',
        damageMultiplier: 1.5,
        effect: { kind: 'pierceBonus', extraPierce: 2 },
      },
    });
    // Não se aplica a outras armas.
    expect(weaponEvolution('coil', { coil: 3, lance: 2 })).toBeNull();
  });

  it('stormRing exige arc 2 + orbit 3 e evolui o arco com cadeia no acerto', () => {
    expect(weaponEvolution('arc', { arc: 2, orbit: 2 })).toBeNull();
    expect(weaponEvolution('arc', { arc: 2, orbit: 3 })).toMatchObject({
      id: 'stormRing',
      requires: { arc: 2, orbit: 3 },
      result: {
        weapon: 'arc',
        attackType: 'chain',
        damageMultiplier: 1.35,
        effect: { kind: 'chainOnHit', chainJumps: 2, chainRange: 140, falloff: 0.8 },
      },
    });
    expect(weaponEvolution('orbit', { arc: 2, orbit: 3 })).toBeNull();
  });

  it('expõe exatamente duas evoluções e valida requisitos sem mutar ranks', () => {
    expect(WEAPON_EVOLUTIONS).toHaveLength(2);
    const ranks = { coil: 3, lance: 2, arc: 2, orbit: 3 } as const;
    const snapshot = { ...ranks };
    for (const evolution of WEAPON_EVOLUTIONS) {
      expect(meetsWeaponEvolution(evolution, ranks)).toBe(true);
      expect(weaponEvolution(evolution.result.weapon, ranks)?.id).toBe(evolution.id);
    }
    expect(ranks).toEqual(snapshot);
  });
});
