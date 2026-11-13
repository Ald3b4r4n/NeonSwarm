import type { BiomeId } from './contracts.js';

export const WORLD_CHUNK = 512;
export const OPEN_WORLD = { x: 0, y: 0, w: 1048576, h: 1048576 };
export const WORLD_ORIGIN = OPEN_WORLD.w / 2;

export function worldRandom(col: number, row: number, salt = 0) {
  let seed = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663) ^ salt) >>> 0;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export const WORLD_NAMES: Record<BiomeId, string> = {
  station: 'Ermos de Íon',
  nursery: 'Viveiro Rubro',
};
