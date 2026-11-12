/** Contrato compartilhado NEON SWARM. Somente tipos e constantes; sem lógica, DOM ou React. */

/** Dimensões do mundo em unidades lógicas (o canvas escala; proporção fixa 4:3). */
export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 720;
export const ARENA_BOUNDS: Readonly<Rect> = { x: 0, y: 0, w: ARENA_WIDTH, h: ARENA_HEIGHT };
/** Passo máximo aceito por stepGame; o motor limita dt acima disso. */
export const MAX_DT = 0.05;
export const MAX_UPGRADE_OPTIONS = 3;

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Entrada já normalizada pela UI (teclado ou ponteiro). */
export interface InputState {
  /** Direção desejada, cada eixo em [-1,1]; o motor normaliza se |v|>1. */
  move: Vec2;
  /** Ativa pulso (gasta energia) — edge-triggered: true somente no passo do acionamento. */
  pulse: boolean;
}

export type EnemyKind = 'drone' | 'brute' | 'shooter';
export type Phase = 'playing' | 'upgrade' | 'gameover' | 'victory';
export type CharacterId = 'vesper' | 'rook';
export type BiomeId = 'station' | 'nursery';
export type WeaponId = 'coil' | 'scatter' | 'lance' | 'orbit' | 'mine' | 'arc';
export type EnemyVariant = EnemyKind | 'spore' | 'hound' | 'elite' | 'queen';

export interface RunConfig {
  character: CharacterId;
  biome: BiomeId;
}

export interface RebirthRun extends RunConfig {
  move: Vec2;
  freezeEnemies?: boolean;
  spawnIndex: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  ranks: Partial<Record<WeaponId, number>>;
  cooldowns: Partial<Record<WeaponId, number>>;
  mines: { pos: Vec2; fuse: number; radius: number; damage: number; rank?: number }[];
}
export type UpgradeId =
  | `weapon-${WeaponId}`
  | 'damage' | 'fireRate' | 'speed' | 'maxHp' | 'multishot' | 'magnet' | 'pierce' | 'regen';

export interface PlayerStats {
  moveSpeed: number;      // unid/s
  damage: number;         // por projétil
  fireRate: number;       // tiros/s
  projectiles: number;    // projéteis por salva
  pierce: number;         // inimigos extras atravessados
  magnetRadius: number;   // raio de atração de orbes
  regenPerSec: number;
}

export interface Player {
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  /** Segundos de invulnerabilidade restantes após dano. */
  invuln: number;
  /** Segundos até o próximo disparo automático. */
  fireCooldown: number;
  /** Direção da mira (unitário), apontando para o inimigo mais próximo. */
  aim: Vec2;
  level: number;
  xp: number;
  xpToNext: number;
  stats: PlayerStats;
  /** Níveis adquiridos por upgrade. */
  upgrades: Partial<Record<UpgradeId, number>>;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  variant?: EnemyVariant;
  attackUntil?: number;
  speed?: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  /** Dano de contato por segundo-tick (aplicado respeitando invuln do jogador). */
  contactDamage: number;
  /** Só shooter usa: segundos até o próximo tiro. */
  fireCooldown: number;
  xpValue: number;
  /** Segundos restantes de flash de acerto (efeito visual). */
  hitFlash: number;
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  weapon?: WeaponId;
  rank?: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  /** Atravessamentos restantes. */
  pierceLeft: number;
  /** Segundos de vida restantes. */
  ttl: number;
  /** IDs de inimigos já atingidos (evita acerto duplo ao atravessar). */
  hitIds: number[];
}

export interface XpOrb { id: number; pos: Vec2; radius: number; value: number }

export interface UpgradeOption {
  id: UpgradeId;
  /** Texto em português para a UI. */
  title: string;
  description: string;
  /** Nível atual → próximo (ex.: 2 significa que ficará no nível 2). */
  nextLevel: number;
}

export interface WaveState {
  /** Número da onda atual (começa em 1). */
  number: number;
  /** Segundos decorridos na onda. */
  elapsed: number;
  /** Inimigos ainda por surgir nesta onda. */
  toSpawn: number;
  /** Segundos até o próximo spawn. */
  spawnTimer: number;
  /** Segundos de pausa entre ondas (>0 = intervalo). */
  intermission: number;
}

export interface GameStats {
  kills: number;
  killsByKind: Record<EnemyKind, number>;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  xpCollected: number;
  /** Tempo jogado em segundos (não conta upgrade/pausa). */
  timeAlive: number;
}

/** Efeito transitório emitido pelo motor para a UI desenhar; expira por `ttl`. */
export interface Impact {
  id: number;
  kind: 'hit' | 'kill' | 'playerHurt' | 'pickup' | 'pulse' | 'levelUp' | 'blast' | 'arc';
  radius?: number;
  from?: Vec2;
  rank?: number;
  weapon?: WeaponId;
  variant?: EnemyVariant;
  pos: Vec2;
  ttl: number;
  maxTtl: number;
  /** Cor semântica; a UI decide a paleta. */
  enemyKind?: EnemyKind;
}

export interface GameState {
  run?: RebirthRun;
  seed: number;
  /** Estado interno do PRNG; mantém determinismo (mesma seed + inputs = mesmo resultado). */
  rng: number;
  phase: Phase;
  /** Tempo de simulação total em segundos. */
  time: number;
  bounds: Rect;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  orbs: XpOrb[];
  impacts: Impact[];
  wave: WaveState;
  stats: GameStats;
  /** Pontuação atual (kills ponderados + bônus de onda). */
  score: number;
  /** Preenchido somente em phase==='upgrade'; 1..MAX_UPGRADE_OPTIONS itens. */
  upgradeOptions: UpgradeOption[];
  /** Próximo id para entidades. */
  nextId: number;
}

/** API de src/game/engine.ts (funções puras; não mutam argumentos, retornam novo estado). */
export interface Engine {
  createGame(seed?: number, config?: RunConfig): GameState;
  /** Em 'upgrade' e 'gameover' retorna o estado inalterado. dt é limitado a [0, MAX_DT]. */
  stepGame(state: GameState, input: InputState, dtSeconds: number): GameState;
  /** Válido só em 'upgrade' com id presente em upgradeOptions; caso contrário retorna o estado inalterado. Retorna a 'playing'. */
  applyUpgrade(state: GameState, id: UpgradeId): GameState;
}

/** Persistência (camada React): localStorage, chave e formato versionado. */
export const STORAGE_KEY = 'neonswarm.v1';
export interface SavedData { version: 1; highScore: number; bestWave: number }
