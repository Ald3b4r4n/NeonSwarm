/**
 * P005 NEON SWARM REBIRTH — encontros, personagens, biomas e padrões do chefe.
 *
 * Módulo de dados e funções puras. Não importa engine/UI, não usa relógio nem
 * aleatoriedade: toda escolha deriva apenas dos argumentos recebidos.
 */

export const RUN_SECONDS = 720;

export type RebirthEnemyKind =
  | 'drone'
  | 'brute'
  | 'shooter'
  | 'spore'
  | 'hound'
  | 'elite'
  | 'queen';

export type CharacterId = 'vesper' | 'rook';
export type BiomeId = 'station' | 'nursery';

/** IDs do catálogo de armas aceitos como arma inicial. */
export type StartingWeaponId = 'coil' | 'scatter' | 'lance' | 'orbit' | 'mine' | 'arc';

/** Obstáculo circular estático. x/y é o centro; radius é o raio. */
export interface ArenaObstacle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface CharacterDef {
  readonly id: CharacterId;
  readonly name: string;
  /** Vida inicial; também é o teto base antes de upgrades. */
  readonly maxHp: number;
  /** Velocidade de movimento em unidades/s. */
  readonly moveSpeed: number;
  /** Arma equipada no início da partida. */
  readonly startWeapon: StartingWeaponId;
  readonly accent: string;
}

export interface EnemyDef {
  readonly kind: RebirthEnemyKind;
  readonly hp: number;
  /** Velocidade base de perseguição em unidades/s. */
  readonly speed: number;
  readonly radius: number;
  readonly contactDamage: number;
  readonly xpValue: number;
  /** Verdadeiro somente para o chefe final. */
  readonly boss: boolean;
}

export interface BiomeDef {
  readonly id: BiomeId;
  readonly title: string;
  readonly palette: {
    readonly bg: string;
    readonly grid: string;
    readonly accent: string;
  };
  /** Pequenos obstáculos circulares posicionados junto às bordas da arena 960×720. */
  readonly obstacles: readonly ArenaObstacle[];
}

export type EncounterPhaseId = 'intro' | 'pressure' | 'escalation' | 'peak' | 'boss';

export interface EncounterPhase {
  readonly id: EncounterPhaseId;
  /** Início em segundos da partida, inclusive. */
  readonly start: number;
  /** Fim em segundos da partida, exclusivo (o último termina em RUN_SECONDS). */
  readonly end: number;
  readonly kinds: readonly RebirthEnemyKind[];
  readonly cadenceStart: number;
  readonly cadenceEnd: number;
  readonly scaleStart: number;
  readonly scaleEnd: number;
}

export interface EncounterSpawn {
  readonly kind: RebirthEnemyKind;
  /** Intervalo entre spawns, em segundos, no instante consultado. */
  readonly cadence: number;
  /** Multiplicador de vida/dano dos inimigos (1 = base). */
  readonly scale: number;
  /** Tempo de partida já limitado a [0, RUN_SECONDS]. */
  readonly elapsed: number;
  readonly biome: BiomeId;
  readonly phase: EncounterPhaseId;
  /** Índice normalizado usado para variar o tipo dentro da fase. */
  readonly spawnIndex: number;
}

export type BossTelegraph = 'line' | 'radial' | 'spiral' | 'summon';

export interface BossPattern {
  readonly telegraph: BossTelegraph;
  /** Segundos entre repetições do padrão. */
  readonly cooldown: number;
  /** Velocidade de deslocamento/avanço do chefe em unidades/s. */
  readonly speed: number;
  /** Quantidade de projéteis por disparo do padrão. */
  readonly shots: number;
  /** Segundos de aviso visual antes do disparo (telegrafia). */
  readonly telegraphTime: number;
  /** Vida restante normalizada usada no cálculo. */
  readonly healthRatio: number;
}

/** Personagens originais com vida, velocidade e arma inicial distintas. */
export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    maxHp: 110,
    moveSpeed: 230,
    startWeapon: 'coil',
    accent: '#4de2ff',
  },
  rook: {
    id: 'rook',
    name: 'Rook',
    maxHp: 165,
    moveSpeed: 190,
    startWeapon: 'scatter',
    accent: '#ffb347',
  },
};

/** Catálogo dos sete tipos de inimigo, incluindo o chefe final. */
export const ENEMIES: Readonly<Record<RebirthEnemyKind, EnemyDef>> = {
  drone: { kind: 'drone', hp: 18, speed: 70, radius: 11, contactDamage: 8, xpValue: 2, boss: false },
  brute: { kind: 'brute', hp: 90, speed: 45, radius: 20, contactDamage: 18, xpValue: 8, boss: false },
  shooter: { kind: 'shooter', hp: 32, speed: 55, radius: 13, contactDamage: 8, xpValue: 5, boss: false },
  spore: { kind: 'spore', hp: 26, speed: 30, radius: 15, contactDamage: 6, xpValue: 4, boss: false },
  hound: { kind: 'hound', hp: 22, speed: 120, radius: 12, contactDamage: 10, xpValue: 4, boss: false },
  elite: { kind: 'elite', hp: 320, speed: 60, radius: 24, contactDamage: 22, xpValue: 30, boss: false },
  queen: { kind: 'queen', hp: 2400, speed: 40, radius: 38, contactDamage: 30, xpValue: 200, boss: true },
};

/** Biomas jogáveis. Os obstáculos são todos internos à arena 960×720. */
export const BIOMES: Readonly<Record<BiomeId, BiomeDef>> = {
  station: {
    id: 'station',
    title: 'Estação Orbital',
    palette: { bg: '#050b18', grid: '#13304d', accent: '#4de2ff' },
    obstacles: [
      { x: 52, y: 90, radius: 18 },
      { x: 52, y: 360, radius: 22 },
      { x: 60, y: 630, radius: 16 },
      { x: 908, y: 80, radius: 20 },
      { x: 908, y: 340, radius: 16 },
      { x: 900, y: 640, radius: 22 },
      { x: 250, y: 48, radius: 16 },
      { x: 710, y: 48, radius: 18 },
      { x: 300, y: 672, radius: 18 },
      { x: 680, y: 672, radius: 16 },
    ],
  },
  nursery: {
    id: 'nursery',
    title: 'Berçário Fúngico',
    palette: { bg: '#0a0710', grid: '#3b1f4a', accent: '#b6ff5c' },
    obstacles: [
      { x: 46, y: 120, radius: 20 },
      { x: 46, y: 420, radius: 16 },
      { x: 70, y: 660, radius: 22 },
      { x: 914, y: 140, radius: 16 },
      { x: 914, y: 470, radius: 20 },
      { x: 240, y: 44, radius: 18 },
      { x: 480, y: 44, radius: 14 },
      { x: 730, y: 50, radius: 20 },
      { x: 360, y: 676, radius: 16 },
      { x: 620, y: 670, radius: 20 },
    ],
  },
};

const STATION_ENCOUNTERS: readonly EncounterPhase[] = [
  { id: 'intro', start: 0, end: 90, kinds: ['drone'], cadenceStart: 1.25, cadenceEnd: 1.0, scaleStart: 1.0, scaleEnd: 1.15 },
  { id: 'pressure', start: 90, end: 210, kinds: ['drone', 'hound'], cadenceStart: 1.0, cadenceEnd: 0.78, scaleStart: 1.15, scaleEnd: 1.4 },
  { id: 'escalation', start: 210, end: 360, kinds: ['hound', 'shooter', 'brute'], cadenceStart: 0.78, cadenceEnd: 0.6, scaleStart: 1.4, scaleEnd: 1.85 },
  { id: 'peak', start: 360, end: 480, kinds: ['brute', 'shooter', 'elite'], cadenceStart: 0.6, cadenceEnd: 0.46, scaleStart: 1.85, scaleEnd: 2.4 },
  { id: 'peak', start: 480, end: 600, kinds: ['elite', 'brute', 'shooter'], cadenceStart: 0.46, cadenceEnd: 0.36, scaleStart: 2.4, scaleEnd: 3.0 },
  { id: 'peak', start: 600, end: 660, kinds: ['elite', 'brute', 'hound'], cadenceStart: 0.36, cadenceEnd: 0.31, scaleStart: 3.0, scaleEnd: 3.2 },
  { id: 'boss', start: 660, end: RUN_SECONDS, kinds: ['queen', 'elite'], cadenceStart: 0.9, cadenceEnd: 0.85, scaleStart: 3.2, scaleEnd: 3.5 },
];

const NURSERY_ENCOUNTERS: readonly EncounterPhase[] = [
  { id: 'intro', start: 0, end: 90, kinds: ['drone', 'spore'], cadenceStart: 1.35, cadenceEnd: 1.08, scaleStart: 1.0, scaleEnd: 1.2 },
  { id: 'pressure', start: 90, end: 210, kinds: ['spore', 'drone'], cadenceStart: 1.08, cadenceEnd: 0.84, scaleStart: 1.2, scaleEnd: 1.5 },
  { id: 'escalation', start: 210, end: 360, kinds: ['spore', 'hound', 'shooter'], cadenceStart: 0.84, cadenceEnd: 0.64, scaleStart: 1.5, scaleEnd: 1.95 },
  { id: 'peak', start: 360, end: 480, kinds: ['hound', 'brute', 'spore'], cadenceStart: 0.64, cadenceEnd: 0.5, scaleStart: 1.95, scaleEnd: 2.5 },
  { id: 'peak', start: 480, end: 600, kinds: ['elite', 'spore', 'hound'], cadenceStart: 0.5, cadenceEnd: 0.38, scaleStart: 2.5, scaleEnd: 3.1 },
  { id: 'peak', start: 600, end: 660, kinds: ['elite', 'shooter', 'spore'], cadenceStart: 0.38, cadenceEnd: 0.33, scaleStart: 3.1, scaleEnd: 3.3 },
  { id: 'boss', start: 660, end: RUN_SECONDS, kinds: ['queen', 'elite'], cadenceStart: 0.95, cadenceEnd: 0.88, scaleStart: 3.3, scaleEnd: 3.6 },
];

/** Fases de encontro por bioma, cobrindo [0, RUN_SECONDS] sem lacunas. */
export const ENCOUNTERS: Readonly<Record<BiomeId, readonly EncounterPhase[]>> = {
  station: STATION_ENCOUNTERS,
  nursery: NURSERY_ENCOUNTERS,
};

interface BossPatternBase {
  readonly telegraph: BossTelegraph;
  readonly cooldown: number;
  readonly speed: number;
  readonly shots: number;
  readonly telegraphTime: number;
}

const BOSS_PATTERNS: readonly BossPatternBase[] = [
  { telegraph: 'line', cooldown: 1.8, speed: 180, shots: 3, telegraphTime: 0.55 },
  { telegraph: 'radial', cooldown: 2.4, speed: 120, shots: 10, telegraphTime: 0.75 },
  { telegraph: 'spiral', cooldown: 2.0, speed: 150, shots: 6, telegraphTime: 0.6 },
  { telegraph: 'summon', cooldown: 3.2, speed: 90, shots: 2, telegraphTime: 0.9 },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, 0, 1);
}

function normalizeIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function phaseAt(phases: readonly EncounterPhase[], seconds: number): EncounterPhase {
  const elapsed = clamp(seconds, 0, RUN_SECONDS);
  let selected = phases[phases.length - 1];
  for (const phase of phases) {
    if (elapsed < phase.end) {
      selected = phase;
      break;
    }
  }
  return selected;
}

/**
 * Encontro válido em qualquer instante da partida de 12 minutos.
 * O índice de spawn escolhe ciclicamente um tipo da fase; é puro e determinístico.
 */
export function encounterAt(
  seconds: number,
  spawnIndex: number,
  biome: BiomeId,
): EncounterSpawn {
  const elapsed = clamp(seconds, 0, RUN_SECONDS);
  const index = normalizeIndex(spawnIndex);
  const phases = ENCOUNTERS[biome];
  const phase = phaseAt(phases, elapsed);
  const span = phase.end - phase.start;
  const progress = span > 0 ? clamp((elapsed - phase.start) / span, 0, 1) : 1;

  const cadence = Math.max(
    0.2,
    round(phase.cadenceStart + (phase.cadenceEnd - phase.cadenceStart) * progress, 3),
  );
  const scale = Math.max(
    1,
    round(phase.scaleStart + (phase.scaleEnd - phase.scaleStart) * progress, 3),
  );
  const kind = phase.kinds[index % phase.kinds.length];

  return {
    kind,
    cadence,
    scale,
    elapsed,
    biome,
    phase: phase.id,
    spawnIndex: index,
  };
}

/**
 * Padrão telegráfico do chefe. A vida baixa encurta o cooldown, acelera o
 * deslocamento e aumenta a contagem de tiros; o tempo apenas escolhe o padrão.
 */
export function bossPattern(seconds: number, healthRatio: number): BossPattern {
  const elapsed = clamp(seconds, 0, RUN_SECONDS);
  const hp = clamp01(healthRatio);
  const pressure = 1 - hp;
  const timePressure = elapsed / RUN_SECONDS;
  const base = BOSS_PATTERNS[Math.floor(elapsed / 6) % BOSS_PATTERNS.length];

  return {
    telegraph: base.telegraph,
    cooldown: round(base.cooldown * (1 - 0.3 * pressure) * (1 - 0.15 * timePressure), 3),
    speed: round(base.speed * (1 + 0.45 * pressure + 0.1 * timePressure), 1),
    shots: Math.max(
      1,
      Math.round(base.shots * (1 + 0.5 * pressure) + Math.floor(timePressure * 2)),
    ),
    telegraphTime: round(base.telegraphTime * (1 - 0.25 * pressure), 3),
    healthRatio: hp,
  };
}
