/**
 * Catálogo de armas do NEON SWARM REBIRTH (P005).
 *
 * Módulo puro e determinístico: não importa engine, contracts, DOM, relógio ou
 * aleatoriedade. `time` é sempre recebido explicitamente para armas rotativas.
 * Tudo aqui é dado/plano para a integração futura no motor; nenhum contrato é
 * alterado por este arquivo.
 */

export type WeaponId = 'coil' | 'scatter' | 'lance' | 'orbit' | 'mine' | 'arc';

export type WeaponAttackType = 'single' | 'fan' | 'pierce' | 'rotating' | 'delayed' | 'chain';

export const WEAPON_MAX_RANK = 5;

export const WEAPON_IDS: readonly WeaponId[] = [
  'coil',
  'scatter',
  'lance',
  'orbit',
  'mine',
  'arc',
];

/** Parâmetros de uma arma em um rank. Campos são opcionais por tipo de ataque. */
export interface WeaponRankStats {
  readonly damage: number;
  /** Segundos entre ataques (cadência). */
  readonly cooldown: number;
  /** Alcance lógico em unidades do mundo. */
  readonly range: number;
  readonly projectileSpeed?: number;
  /** Projéteis por disparo / orbes / minas por carga. */
  readonly projectiles?: number;
  /** Inimigos extras atravessados (além do primeiro). */
  readonly pierce?: number;
  /** Abertura total do leque, em radianos. */
  readonly spread?: number;
  readonly orbitRadius?: number;
  /** Velocidade angular do hazard em rad/s. */
  readonly spinSpeed?: number;
  /** Segundos até a mina detonar. */
  readonly fuse?: number;
  readonly blastRadius?: number;
  readonly chainJumps?: number;
  readonly chainRange?: number;
  /** Multiplicador de dano aplicado a cada salto extra (0..1). */
  readonly chainFalloff?: number;
}

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly title: string;
  readonly description: string;
  readonly attackType: WeaponAttackType;
  readonly maxRank: number;
  /** Estatísticas puras para o rank informado (o rank é limitado a [1, maxRank]). */
  readonly stats: (rank: number) => WeaponRankStats;
}

const TAU = Math.PI * 2;

/** Normaliza e limita um rank a um inteiro em [1, WEAPON_MAX_RANK]. */
export function clampWeaponRank(rank: number): number {
  if (!Number.isFinite(rank)) return 1;
  return Math.min(WEAPON_MAX_RANK, Math.max(1, Math.floor(rank)));
}

/** Retorna uma cópia numérica segura; NaN/Infinity viram o fallback. */
function safeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteRank(rank: number): number {
  return clampWeaponRank(rank);
}

function fanAngles(aimAngle: number, count: number, spread: number): readonly number[] {
  if (count <= 1) return [aimAngle];
  const step = spread / (count - 1);
  const start = aimAngle - spread / 2;
  return Array.from({ length: count }, (_, index) => start + step * index);
}

/** Catálogo das seis armas originais. */
export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  coil: {
    id: 'coil',
    title: 'Bobina de Coil',
    description: 'Disparo único, mirado e direto; dano sólido com cadência média.',
    attackType: 'single',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      return {
        damage: 10 + 4 * (level - 1),
        cooldown: 0.5 - 0.04 * (level - 1),
        range: 520 + 30 * (level - 1),
        projectileSpeed: 620,
        projectiles: 1,
        pierce: 0,
      };
    },
  },

  scatter: {
    id: 'scatter',
    title: 'Leque de Fragmentos',
    description: 'Leque de projéteis curtos; cresce em quantidade e abertura por rank.',
    attackType: 'fan',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      return {
        damage: 6 + 2 * (level - 1),
        cooldown: 0.9 - 0.06 * (level - 1),
        range: 360 + 15 * (level - 1),
        projectileSpeed: 480 + 20 * (level - 1),
        projectiles: 3 + (level - 1),
        pierce: 0,
        spread: 0.5 + 0.08 * (level - 1),
      };
    },
  },

  lance: {
    id: 'lance',
    title: 'Lança Prismática',
    description: 'Projétil rápido e perfurante; atravessa vários inimigos em linha.',
    attackType: 'pierce',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      return {
        damage: 18 + 6 * (level - 1),
        cooldown: 1.1 - 0.08 * (level - 1),
        range: 640 + 40 * (level - 1),
        projectileSpeed: 900,
        projectiles: 1,
        pierce: 2 + (level - 1),
      };
    },
  },

  orbit: {
    id: 'orbit',
    title: 'Anel Orbital',
    description: 'Hazard que gira ao redor do jogador e atinge inimigos por contato.',
    attackType: 'rotating',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      const orbitRadius = 70 + 6 * (level - 1);
      return {
        damage: 7 + 2 * (level - 1),
        cooldown: 0.35,
        range: orbitRadius + 20,
        projectiles: 2 + (level - 1),
        orbitRadius,
        spinSpeed: 2.2 + 0.15 * (level - 1),
      };
    },
  },

  mine: {
    id: 'mine',
    title: 'Mina de Fusão',
    description: 'Solta uma mina no eixo da mira; detona após um tempo e causa área.',
    attackType: 'delayed',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      return {
        damage: 22 + 8 * (level - 1),
        cooldown: 1.4 - 0.1 * (level - 1),
        range: 420,
        projectiles: 1 + Math.floor((level - 1) / 2),
        fuse: 0.8,
        blastRadius: 70 + 8 * (level - 1),
      };
    },
  },

  arc: {
    id: 'arc',
    title: 'Arco em Cadeia',
    description: 'Raio que salta entre alvos próximos, perdendo força a cada salto.',
    attackType: 'chain',
    maxRank: WEAPON_MAX_RANK,
    stats: (rank) => {
      const level = finiteRank(rank);
      return {
        damage: 8 + 3 * (level - 1),
        cooldown: 0.75 - 0.05 * (level - 1),
        range: 380 + 20 * (level - 1),
        projectileSpeed: 760,
        projectiles: 1,
        chainJumps: 2 + (level - 1),
        chainRange: 150 + 10 * (level - 1),
        chainFalloff: 0.85,
      };
    },
  },
};

export interface WeaponAttackCommon {
  readonly weapon: WeaponId;
  readonly rank: number;
  readonly aimAngle: number;
  readonly time: number;
  readonly damage: number;
  /** Segundos entre ataques. */
  readonly cooldown: number;
  readonly range: number;
}

export interface SingleAttack extends WeaponAttackCommon {
  readonly type: 'single';
  readonly projectileSpeed: number;
  readonly projectiles: number;
  readonly pierce: number;
}

export interface FanAttack extends WeaponAttackCommon {
  readonly type: 'fan';
  readonly angles: readonly number[];
  readonly projectiles: number;
  readonly spread: number;
  readonly projectileSpeed: number;
  readonly pierce: number;
}

export interface PierceAttack extends WeaponAttackCommon {
  readonly type: 'pierce';
  readonly projectileSpeed: number;
  readonly projectiles: number;
  readonly pierce: number;
  /** Largura visual/lógica do feixe. */
  readonly beamWidth: number;
}

export interface RotatingAttack extends WeaponAttackCommon {
  readonly type: 'rotating';
  readonly count: number;
  readonly orbAngles: readonly number[];
  readonly orbitRadius: number;
  readonly spinSpeed: number;
  readonly orbRadius: number;
  /** Tempo mínimo entre acertos do mesmo orbe no mesmo alvo. */
  readonly hitCooldown: number;
}

export interface DelayedAttack extends WeaponAttackCommon {
  readonly type: 'delayed';
  readonly count: number;
  readonly dropAngle: number;
  readonly dropDistance: number;
  readonly fuse: number;
  readonly blastRadius: number;
}

export interface ChainAttack extends WeaponAttackCommon {
  readonly type: 'chain';
  readonly projectiles: number;
  readonly projectileSpeed: number;
  readonly chainJumps: number;
  readonly chainRange: number;
  readonly chainFalloff: number;
}

/** Plano discriminado por `type`; contém tudo que o motor precisa para executar o ataque. */
export type WeaponAttackPlan =
  | SingleAttack
  | FanAttack
  | PierceAttack
  | RotatingAttack
  | DelayedAttack
  | ChainAttack;

/**
 * Monta o plano de ataque de uma arma em um rank.
 *
 * Puro e determinístico: o mesmo `(id, rank, aimAngle, time)` produz sempre o
 * mesmo objeto. `time` só afeta armas rotativas (fase orbital).
 */
export function makeWeaponAttack(
  id: WeaponId,
  rank: number,
  aimAngle: number,
  time: number,
): WeaponAttackPlan {
  const definition = WEAPONS[id];
  const safeRank = finiteRank(rank);
  const stats = definition.stats(safeRank);
  const aim = safeNumber(aimAngle, 0);
  const at = safeNumber(time, 0);

  const common = {
    weapon: id,
    rank: safeRank,
    aimAngle: aim,
    time: at,
    damage: stats.damage,
    cooldown: stats.cooldown,
    range: stats.range,
  } as const;

  switch (definition.attackType) {
    case 'single':
      return {
        ...common,
        type: 'single',
        projectileSpeed: stats.projectileSpeed ?? 0,
        projectiles: stats.projectiles ?? 1,
        pierce: stats.pierce ?? 0,
      };

    case 'fan': {
      const projectiles = stats.projectiles ?? 1;
      const spread = stats.spread ?? 0;
      return {
        ...common,
        type: 'fan',
        angles: fanAngles(aim, projectiles, spread),
        projectiles,
        spread,
        projectileSpeed: stats.projectileSpeed ?? 0,
        pierce: stats.pierce ?? 0,
      };
    }

    case 'pierce':
      return {
        ...common,
        type: 'pierce',
        projectileSpeed: stats.projectileSpeed ?? 0,
        projectiles: stats.projectiles ?? 1,
        pierce: stats.pierce ?? 0,
        beamWidth: 10,
      };

    case 'rotating': {
      const count = stats.projectiles ?? 1;
      const spinSpeed = stats.spinSpeed ?? 0;
      const phase = spinSpeed * at;
      return {
        ...common,
        type: 'rotating',
        count,
        orbAngles: Array.from({ length: count }, (_, index) => aim + phase + (TAU * index) / count),
        orbitRadius: stats.orbitRadius ?? 0,
        spinSpeed,
        orbRadius: 9,
        hitCooldown: stats.cooldown,
      };
    }

    case 'delayed':
      return {
        ...common,
        type: 'delayed',
        count: stats.projectiles ?? 1,
        dropAngle: aim,
        dropDistance: Math.min(160, stats.range),
        fuse: stats.fuse ?? 0,
        blastRadius: stats.blastRadius ?? 0,
      };

    case 'chain':
      return {
        ...common,
        type: 'chain',
        projectiles: stats.projectiles ?? 1,
        projectileSpeed: stats.projectileSpeed ?? 0,
        chainJumps: stats.chainJumps ?? 0,
        chainRange: stats.chainRange ?? 0,
        chainFalloff: stats.chainFalloff ?? 1,
      };
  }
}

export type WeaponEvolutionId = 'prismLance' | 'stormRing';

export interface PierceBonusEffect {
  readonly kind: 'pierceBonus';
  readonly extraPierce: number;
}

export interface ChainOnHitEffect {
  readonly kind: 'chainOnHit';
  readonly chainJumps: number;
  readonly chainRange: number;
  readonly falloff: number;
}

export type WeaponEvolutionEffect = PierceBonusEffect | ChainOnHitEffect;

export interface WeaponEvolutionResult {
  /** Arma que recebe a evolução. */
  readonly weapon: WeaponId;
  readonly attackType: WeaponAttackType;
  /** Rank concedido/preservado ao evoluir. */
  readonly grantedRank: number;
  readonly damageMultiplier: number;
  readonly cooldownMultiplier: number;
  readonly rangeMultiplier: number;
  /** Efeito mecânico explícito que o motor deve aplicar. */
  readonly effect: WeaponEvolutionEffect;
}

export interface WeaponEvolution {
  readonly id: WeaponEvolutionId;
  readonly title: string;
  readonly description: string;
  /** Ranks mínimos por arma. */
  readonly requires: Readonly<Partial<Record<WeaponId, number>>>;
  readonly result: WeaponEvolutionResult;
}

/** As duas sinergias explícitas desta entrega. */
export const WEAPON_EVOLUTIONS: readonly WeaponEvolution[] = [
  {
    id: 'prismLance',
    title: 'Lança Prismática',
    description: 'Coil (rank 3) + Lance (rank 2): a Lança vira um feixe prismático que perfura mais e alcança mais longe.',
    requires: { coil: 3, lance: 2 },
    result: {
      weapon: 'lance',
      attackType: 'pierce',
      grantedRank: 3,
      damageMultiplier: 1.5,
      cooldownMultiplier: 0.85,
      rangeMultiplier: 1.25,
      effect: { kind: 'pierceBonus', extraPierce: 2 },
    },
  },
  {
    id: 'stormRing',
    title: 'Anel Tempestuoso',
    description: 'Arco (rank 2) + Órbita (rank 3): os orbes do anel descarregam raios em cadeia ao acertar.',
    requires: { arc: 2, orbit: 3 },
    result: {
      weapon: 'arc',
      attackType: 'chain',
      grantedRank: 3,
      damageMultiplier: 1.35,
      cooldownMultiplier: 0.9,
      rangeMultiplier: 1.15,
      effect: { kind: 'chainOnHit', chainJumps: 2, chainRange: 140, falloff: 0.8 },
    },
  },
];

/** Verdadeiro se todos os ranks mínimos da evolução foram atingidos. */
export function meetsWeaponEvolution(
  evolution: WeaponEvolution,
  ranks: Readonly<Partial<Record<WeaponId, number>>>,
): boolean {
  for (const [weapon, required] of Object.entries(evolution.requires)) {
    const current = ranks[weapon as WeaponId] ?? 0;
    if (current < (required ?? 0)) return false;
  }
  return true;
}

/**
 * Retorna a sinergia disponível para `id` com os ranks atuais, ou `null`.
 * Puro e determinístico; não consome nem muta `ranks`.
 */
export function weaponEvolution(
  id: WeaponId,
  ranks: Readonly<Partial<Record<WeaponId, number>>>,
): WeaponEvolution | null {
  for (const evolution of WEAPON_EVOLUTIONS) {
    if (evolution.result.weapon === id && meetsWeaponEvolution(evolution, ranks)) {
      return evolution;
    }
  }
  return null;
}
