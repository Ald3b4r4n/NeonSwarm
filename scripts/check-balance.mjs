import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const vite = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
try {
  const { simulateRun } = await vite.ssrLoadModule('/scripts/rebirth-simulation.ts');
  const outcomes = [];
  const captures = resolve('.hivemind/rebirth-capture');
  mkdirSync(captures, { recursive: true });
  for (const [seed, character, biome, stationary] of [
    [47, 'vesper', 'station', true],
    [47, 'vesper', 'station', false],
    [73, 'rook', 'nursery', false],
    [99, 'vesper', 'nursery', false],
    [123, 'rook', 'station', false],
  ]) {
    const result = simulateRun(seed, { character, biome }, stationary);
    const { state, horde, boss, maxEnemies, averageStepMs } = result;
    outcomes.push({
      seed, character, biome, stationary, phase: state.phase, time: Math.round(state.time),
      level: state.player.level, weapons: state.run.ranks, kills: state.stats.kills, hp: Math.ceil(state.player.hp),
      maxEnemies, averageStepMs: Number(averageStepMs.toFixed(4)),
    });
    for (const [name, snapshot] of Object.entries({ horde, boss, result: state })) {
      if (!stationary && snapshot) writeFileSync(resolve(captures, name + '-' + seed + '.json'), JSON.stringify(snapshot));
    }
  }
  console.log(JSON.stringify(outcomes, null, 2));
} finally {
  await vite.close();
}
