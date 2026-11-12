import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game/engine';
import type { GameState } from '../../src/game/contracts';
import {
  applyDeveloperAction,
  type DeveloperSessionAction,
} from '../../src/game/developer';
import { DeveloperPanel } from '../../src/ui/developer-panel';

function rebirthState(): GameState {
  return createGame(27, { character: 'vesper', biome: 'station' });
}

describe('applyDeveloperAction', () => {
  it('altera invulnerabilidade sem mutar o estado recebido', () => {
    const state = createGame(5);
    const before = JSON.stringify(state);

    const enabled = applyDeveloperAction(state, {
      type: 'player/set-invincibility',
      enabled: true,
    });
    const disabled = applyDeveloperAction(enabled, {
      type: 'player/set-invincibility',
      enabled: false,
    });

    expect(enabled).not.toBe(state);
    expect(enabled.player.invuln).toBeGreaterThan(1_000_000);
    expect(disabled.player.invuln).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('limita vida e velocidade, e permite recuperar de game over', () => {
    const gameOver: GameState = {
      ...createGame(6),
      phase: 'gameover',
      player: { ...createGame(6).player, hp: 0 },
    };
    const revived = applyDeveloperAction(gameOver, {
      type: 'player/set-health',
      hp: 500,
      maxHp: 140,
    });
    const fast = applyDeveloperAction(revived, {
      type: 'player/set-speed',
      speed: 9_000,
    });

    expect(revived.phase).toBe('playing');
    expect(revived.player.hp).toBe(140);
    expect(revived.player.maxHp).toBe(140);
    expect(fast.player.stats.moveSpeed).toBe(2_000);
    expect(gameOver.player.hp).toBe(0);
    expect(gameOver.phase).toBe('gameover');
  });

  it('adiciona XP e ajusta nível com a curva correspondente ao modo', () => {
    const normal = createGame(7);
    const gainedXp = applyDeveloperAction(normal, { type: 'player/add-xp', amount: 50 });
    const normalLevel = applyDeveloperAction(gainedXp, { type: 'player/set-level', level: 4.8 });
    const rebirthLevel = applyDeveloperAction(rebirthState(), { type: 'player/set-level', level: 2 });

    expect(gainedXp.player.xp).toBe(50);
    expect(normalLevel.player.level).toBe(4);
    expect(normalLevel.player.xp).toBe(0);
    expect(normalLevel.player.xpToNext).toBe(76);
    expect(rebirthLevel.player.xpToNext).toBe(36);
    expect(normal.player.level).toBe(1);
  });

  it('define ranks e libera as sinergias usando ranks de arma válidos', () => {
    const state = rebirthState();
    const ranked = applyDeveloperAction(state, {
      type: 'weapon/set-rank',
      weapon: 'orbit',
      rank: 2,
    });
    const synergy = applyDeveloperAction(ranked, {
      type: 'weapon/unlock-synergy',
      evolution: 'stormRing',
    });
    const removed = applyDeveloperAction(synergy, {
      type: 'weapon/set-rank',
      weapon: 'orbit',
      rank: 0,
    });

    expect(state.run?.ranks.orbit).toBeUndefined();
    expect(ranked.run?.ranks.orbit).toBe(2);
    expect(synergy.run?.ranks.arc).toBe(3);
    expect(synergy.run?.ranks.orbit).toBe(3);
    expect(removed.run?.ranks.orbit).toBeUndefined();
  });

  it('avança ondas sem reiniciar a partida e mapeia ondas Rebirth para tempo', () => {
    const normal = applyDeveloperAction(createGame(8), { type: 'world/set-wave', wave: 5 });
    const rebirth = applyDeveloperAction(rebirthState(), { type: 'world/set-wave', wave: 5 });

    expect(normal.wave).toEqual({
      number: 5,
      elapsed: 0,
      toSpawn: 32,
      spawnTimer: 0,
      intermission: 0,
    });
    expect(rebirth.wave.number).toBe(5);
    expect(rebirth.time).toBe(240);
    expect(rebirth.wave.toSpawn).toBe(0);
  });

  it('invoca variantes e Rainha com IDs sequenciais sem duplicar a chefe', () => {
    const state = rebirthState();
    const drone = applyDeveloperAction(state, { type: 'world/spawn', variant: 'drone' });
    const queen = applyDeveloperAction(drone, { type: 'world/spawn', variant: 'queen' });
    const duplicateQueen = applyDeveloperAction(queen, { type: 'world/spawn', variant: 'queen' });

    expect(drone.enemies[0]?.kind).toBe('drone');
    expect(drone.enemies[0]?.id).toBe(state.nextId);
    expect(queen.enemies[1]?.variant).toBe('queen');
    expect(queen.enemies[1]?.kind).toBe('brute');
    expect(queen.enemies[1]?.hp).toBe(2_400);
    expect(queen.run?.bossSpawned).toBe(true);
    expect(duplicateQueen).toBe(queen);
    expect(state.enemies).toHaveLength(0);
  });

  it('ignora dados não finitos e não altera partida sem run para ações de arma', () => {
    const state = createGame(9);
    expect(applyDeveloperAction(state, { type: 'player/add-xp', amount: Number.NaN })).toBe(state);
    expect(applyDeveloperAction(state, { type: 'weapon/set-rank', weapon: 'coil', rank: 3 })).toBe(state);
  });
});

describe('DeveloperPanel', () => {
  it('mostra uma porta sem dica ou texto que revele a senha', () => {
    const html = renderToStaticMarkup(createElement(DeveloperPanel, {
      state: createGame(1),
      onAction: vi.fn(),
      onClose: vi.fn(),
      unlocked: false,
      session: { speed: 1, fps: false, limit: 0 },
    }));

    expect(html).toContain('Acesso do operador');
    expect(html).toContain('type="password"');
    expect(html).not.toContain('Aldebaran');
    expect(html).not.toContain('Painel de desenvolvimento');
  });

  it('expõe controles e contratos de sessão quando liberado pelo App', () => {
    const html = renderToStaticMarkup(createElement(DeveloperPanel, {
      state: rebirthState(),
      onAction: vi.fn(),
      onClose: vi.fn(),
      unlocked: true,
      session: { speed: 1, fps: false, limit: 0 },
    }));
    const sessionContract: DeveloperSessionAction = { type: 'session/restart' };

    expect(sessionContract.type).toBe('session/restart');
    expect(html).toContain('Painel de desenvolvimento');
    expect(html).toContain('Invencibilidade');
    expect(html).toContain('Sinergias');
    expect(html).toContain('Rainha');
    expect(html).toContain('Contador de FPS');
    expect(html).not.toContain('type="password"');
  });
});
