# NEON SWARM REBIRTH — Arquitetura incremental (P005)

Documento de arquitetura. Nenhum código foi alterado. Tudo marcado **[NOVO]** é proposta; o restante já existe.

## 1. Evidências dos contratos lidos

| Fonte | Fato ancorado |
| --- | --- |
| `src/game/contracts.ts` | `ARENA_WIDTH/HEIGHT` 960×720, `MAX_DT=0.05`, `MAX_UPGRADE_OPTIONS=3`; `EnemyKind` = `drone｜brute｜shooter`; `Phase` = `playing｜upgrade｜gameover`; `UpgradeId` com 8 ids; `GameState` (seed, rng, wave, stats, upgradeOptions, nextId...); interface `Engine` com `createGame`, `stepGame`, `applyUpgrade`; `STORAGE_KEY='neonswarm.v1'`, `SavedData{version:1,highScore,bestWave}`. |
| `src/game/engine.ts` | Exporta somente `createGame(seed=0x5eed1234)` (l.842), `stepGame` (l.899), `applyUpgrade` (l.922). Constantes internas: `MAX_ENEMIES=180`, `MAX_PROJECTILES=400`, `MAX_ORBS=300`, `UPGRADE_MAX_LEVEL=8`, caps de stats, `WAVE_INTERMISSION_SECONDS=3`, `SIM_STEP=1/60`. |
| `docs/arquitetura.md` | Motor puro e determinístico, importa só `contracts.ts`; UI usa só as 3 funções; pausa é estado da UI; 13 critérios de aceitação. |
| `docs/p004.md` | Correções P004 já integradas: ondas travadas, upgrades esgotados filtrados, menu vazio após esgotar evoluções (`8a2009f`). Teste móvel só em CDP; Android físico pendente. |

Não li `render.ts`, `App.tsx` nem os testes em profundidade; as regras de UI abaixo vêm de `docs/arquitetura.md`.

## 2. Princípios

1. **P004 intocável**: as 3 funções, `STORAGE_KEY`, `SavedData v1` e os testes atuais continuam passando sem edição.
2. **Só ampliação opcional**: campos novos em `contracts.ts` são `?:`; ausência equivale ao comportamento P004.
3. **Dados em catálogo, lógica no motor**: catálogos são módulos puros de dados (sem DOM, sem `Math.random`, sem `Date`) que importam apenas `contracts.ts`.
4. **Determinismo**: toda aleatoriedade passa por `state.rng`; catálogos não sorteiam.
5. Um módulo = uma tarefa pequena e independente (seção 6).

## 3. Camadas e arquivos

```
src/game/contracts.ts          # ampliado só com tipos/consts opcionais
src/game/engine.ts             # existente; passa a consultar catálogos
src/game/catalog/weapons.ts    # [NOVO] armas + upgrades
src/game/catalog/encounters.ts # [NOVO] ondas/encontros
src/game/catalog/characters.ts # [NOVO] personagens
src/game/catalog/biomes.ts     # [NOVO] biomas
src/game/balance.ts            # [NOVO] curva de 12 min (constantes)
src/ui/storage.ts              # migração v1→v2 compatível
```

Regra de import: `catalog/*` e `balance.ts` importam só `contracts.ts`. `engine.ts` importa `contracts.ts` + `catalog/*` + `balance.ts`. A UI não importa catálogos para simular; pode importá-los só para ler títulos/cores. O critério 9 de P004 passa a ser: "`engine.ts` não importa nada fora de `contracts.ts`, `catalog/` e `balance.ts`".

## 4. Ampliações de contrato (todas opcionais) — [NOVO]

```ts
export type CharacterId = 'vanguard' | 'weaver' | 'phantom';   // 3 originais
export type BiomeId = 'neonGrid' | 'rustFoundry' | 'glassVoid';
export type WeaponId = 'pulseBolt' | 'arcChain' | 'orbitBlades' | 'novaMine';

export interface RunConfig {            // 2º parâmetro opcional
  seed?: number;
  character?: CharacterId;              // padrão 'vanguard' = P004
  biome?: BiomeId;                      // padrão 'neonGrid' = P004
  durationSeconds?: number;             // padrão REBIRTH_RUN_SECONDS = 720
}
```

Em `GameState` (todos `?:`): `run?: { character: CharacterId; biome: BiomeId; duration: number; boss: boolean }`, `weapons?: Partial<Record<WeaponId, number>>`, `encounter?: EncounterState`.
`Phase` ganha `'victory'` **[NOVO]** (união ampliada; a UI P004 que trata `gameover` por exclusão deve ser revisada — ver risco R1).
`UpgradeId` ganha ids novos (união ampliada). `EnemyKind` ganha ids novos só quando o encontro correspondente existir.

**Assinaturas compatíveis:**
```ts
createGame(seed?: number): GameState;                 // existente, inalterada
createGame(seed?: number, config?: RunConfig): GameState; // [NOVO] 2º arg opcional
stepGame / applyUpgrade                                // assinaturas inalteradas
```
Sem `config`, o resultado deve ser **idêntico bit a bit** ao P004 (teste de regressão de snapshot, seção 7).

Persistência **[NOVO]**: `STORAGE_KEY_V2='neonswarm.v2'`, `SavedDataV2 { version: 2; highScore; bestWave; bestTime; unlockedCharacters: CharacterId[]; victories }`. `storage.ts` lê v2; se ausente, lê v1 e migra sem apagar a chave v1. Dado inválido → zeros (regra P004).

## 5. Catálogos

### 5.1 Armas e upgrades — `catalog/weapons.ts` [NOVO]
```ts
export interface WeaponDef {
  id: WeaponId; title: string; description: string; maxLevel: number;
  /** Retorna parâmetros de disparo para o nível; função pura. */
  levels(level: number): WeaponLevelStats;
}
export interface UpgradeDef {
  id: UpgradeId; title: string; description: string; maxLevel: number;
  /** Aplica o efeito sobre PlayerStats; pura, respeita caps. */
  apply(stats: PlayerStats, level: number): PlayerStats;
  /** Usado para filtrar opções inócuas (regressão P004 r006-balance). */
  isUseful(stats: PlayerStats, level: number): boolean;
}
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>>;
export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>>;
export function listUpgradeCandidates(state: GameState): UpgradeId[]; // determinística, sem sorteio
```
Integração: `applyUpgrade` e a geração de `upgradeOptions` leem `UPGRADES`. Os 8 ids P004 migram com valores idênticos. `pulseBolt` reproduz o tiro atual.

### 5.2 Encontros e ondas — `catalog/encounters.ts` [NOVO]
```ts
export interface SpawnEntry { kind: EnemyKind; weight: number; minTime: number; maxTime?: number }
export interface EncounterDef {
  id: string; startAt: number; endAt: number;      // segundos de partida
  spawnInterval: number; batch: number;
  entries: SpawnEntry[]; hpScale: number; damageScale: number;
  elite?: { kind: EnemyKind; every: number };
}
export const ENCOUNTERS: Readonly<Record<BiomeId, readonly EncounterDef[]>>;
export function encounterAt(biome: BiomeId, time: number): EncounterDef;   // pura
export function pickSpawnKind(def: EncounterDef, time: number, roll01: number): EnemyKind; // roll vem de state.rng
```
Integração: o motor passa a derivar o spawn de `encounterAt(...)` quando `state.run` existe; sem `run`, usa o caminho P004 de `WaveState`. `wave.number` continua sendo atualizado (`floor(time/60)+1`) para manter `bestWave` e a UI.

### 5.3 Personagens — `catalog/characters.ts` [NOVO]
`CharacterDef { id; title; baseStats: PlayerStats; maxHp; startWeapon: WeaponId; pulse: {cost; radius; damage} }`. `vanguard` replica os valores P004 (hp 100, energia 100, pulso 28/168/14). `weaver` (cadência alta, hp baixo) e `phantom` (velocidade/pierce, dano baixo) são originais; sem nomes ou mecânicas copiadas de terceiros.

### 5.4 Biomas — `catalog/biomes.ts` [NOVO]
`BiomeDef { id; title; palette: {bg; grid; accent}; hazards?: HazardDef[]; encounterSet: BiomeId }`. Paleta é só para a UI. Perigos (ex.: zona de dano estática) ficam fora da primeira entrega; campo opcional.

## 6. Tarefas de motor pequenas e independentes

| ID | Tarefa | Arquivos | Depende de | Pronto quando |
| --- | --- | --- | --- | --- |
| T1 | Tipos opcionais + `RunConfig` + `Phase 'victory'` | `contracts.ts` | — | `tsc` strict passa; testes P004 intactos |
| T2 | **Catálogo de armas/upgrades** com os 8 upgrades P004 migrados | `catalog/weapons.ts`, ajuste mínimo em `applyUpgrade` | T1 | Snapshot P004 idêntico; teste de `isUseful` |
| T3 | **Catálogo de encontros/ondas** com um bioma (`neonGrid`) cobrindo 0–720 s | `catalog/encounters.ts`, gancho de spawn | T1 | Os 3 `EnemyKind` aparecem antes de 300 s; sem onda travada |
| T4 | Constantes de balanceamento de 12 min | `balance.ts` | T1 | Tabela da seção 8 coberta por teste |
| T5 | Personagens | `catalog/characters.ts`, `createGame(seed, config)` | T1, T2 | `vanguard` ≡ P004 |
| T6 | Biomas (paleta + conjuntos) | `catalog/biomes.ts` | T3 | Cada bioma tem encontros para 0–720 s |
| T7 | Vitória aos 720 s + chefe final | `engine.ts` | T3, T4 | `phase='victory'` determinístico |
| T8 | Persistência v2 + migração | `storage.ts` | T1 | Teste v1→v2 e JSON corrompido |
| T9 | Seleção de personagem/bioma, HUD do cronômetro, tela de vitória | `ui/*` | T1, T5 | E2E |

T2 e T3 não compartilham arquivos de catálogo e podem rodar em paralelo após T1. Ambos tocam `engine.ts` em pontos distintos (`applyUpgrade`/opções vs. spawn); integrar em sequência e rodar testes entre eles.

## 7. Regras de integração

1. `stepGame` continua retornando novo estado, sem mutar entrada. Em `upgrade`, `gameover` e `victory` retorna o estado inalterado.
2. Se `state.run === undefined`, nenhum código novo executa (guarda explícita `if (!state.run)` no topo dos ganchos).
3. Limites de entidades preservados (180/400/300/120); elites e chefe contam no teto de inimigos.
4. `MAX_UPGRADE_OPTIONS` permanece 3; esgotados são filtrados; se restarem 0, a partida segue em `playing` (comportamento `8a2009f`).
5. Vitória: ao `time >= run.duration` com chefe derrotado (ou sem chefe se `boss:false`) → `phase='victory'`, bônus de pontuação por tempo e HP restante.
6. Pontuação e `bestWave` seguem as regras de P004; `bestTime` é registro novo.
7. Colaboração/preview pública (objetivo do job) ficam **fora do motor**: nada de rede, relógio ou I/O em `src/game`. Qualquer modo cooperativo deve ser camada sobre `GameState` serializável (ver limitação L2).

## 8. Balanceamento de partida de 12 minutos (alvo inicial, a calibrar por simulação)

| Janela | Encontro | Inimigos vivos (alvo) | Nível esperado | Notas |
| --- | --- | --- | --- | --- |
| 0:00–2:00 | Introdução | 5–25 | 1–5 | só `drone`; `brute` a partir de 1:15 |
| 2:00–5:00 | Pressão | 25–70 | 5–12 | `shooter` entra; 1º elite aos 4:00 |
| 5:00–9:00 | Escalada | 70–130 | 12–20 | `hpScale` ×1,0→×2,5 |
| 9:00–11:00 | Pico | 120–170 | 20–26 | elites a cada 45 s |
| 11:00–12:00 | Chefe final | ≤180 | — | chefe + adds limitados |

Regras: XP para o próximo nível cresce de forma sub-exponencial para que um jogador mediano pegue ~22–28 upgrades; todos os 8 upgrades P004 em nível 8 seriam 64 picks, portanto o catálogo impede esgotamento antes de 12 min. Taxa-alvo de vitória de uma estratégia automática simples (bot determinístico) em `vanguard`: 10–40%; um bot parado deve morrer antes de 3:00.

## 9. Critérios verificáveis

1. `npm run typecheck`, `lint`, `test` e `build` passam; os testes P004 existentes passam **sem edição**.
2. Snapshot: `createGame(s)` e N passos com entrada fixa produzem estado idêntico ao do commit `6fe4f92` (hash JSON de estado) para 3 seeds.
3. `createGame(s, {character:'vanguard', biome:'neonGrid'})` joga igual ao P004 nos stats iniciais.
4. Determinismo: mesma seed+config+inputs → mesmo estado final, 720 s simulados.
5. Simulação de 720 s com bot: sem `NaN`; inimigos ≤180, projéteis ≤400, orbes ≤300, impactos ≤120; passo médio <1 ms.
6. Bot parado morre antes de 180 s; bot de kiting alcança `victory` em ≥1 de 20 seeds (calibração da seção 8).
7. Cada upgrade oferecido tem `isUseful===true`; nunca há menu vazio nem mais de 3 opções.
8. `encounterAt(b, t)` definido para todo `t∈[0,720]` e todo bioma; sem lacuna entre `endAt` e o próximo `startAt`.
9. Arquivos de `catalog/` e `balance.ts` não importam nada além de `contracts.ts`; `grep` por `Math.random|Date|document|window` em `src/game` retorna vazio.
10. Migração: v1 `{highScore:500,bestWave:4}` → v2 preserva ambos; JSON corrompido → zeros; chave v1 não é apagada.
11. E2E (Playwright): seleção de personagem/bioma, cronômetro visível, vitória e derrota exibem estatísticas; sem rolagem horizontal em 320 px.
12. Os três personagens e três biomas diferem em ao menos um stat/paleta verificável por teste unitário.

## 10. Riscos e limitações

- **R1**: adicionar `'victory'` a `Phase` pode quebrar `switch`/ramos da UI que assumem 3 fases. Mitigação: T1 inclui varredura de `render.ts`/`App.tsx` (não lidos nesta tarefa) e `never`-check.
- **R2**: `engine.ts` é monolítico (~900+ linhas); ganchos de T2/T3 podem conflitar em merge. Integrar em sequência.
- **L1**: os números da seção 8 são hipóteses sem simulação; exigem calibração com bot.
- **L2**: colaboração em tempo real e preview pública não foram desenhadas aqui além do requisito de estado serializável; precisam de arquitetura de rede própria (autoridade, lockstep ou servidor), fora deste escopo.
- **L3**: não executei build nem testes (tarefa só de documentação); teste móvel em Android físico segue pendente desde P004.
- Não li `render.ts`, `App.tsx`, `storage.ts` nem os testes; as interfaces citadas vêm de `contracts.ts`, `engine.ts` (exports/constantes) e docs.
