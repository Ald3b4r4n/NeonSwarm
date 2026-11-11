import { STORAGE_KEY, type SavedData } from '../game/contracts.js';

export const SETTINGS_KEY = 'neonswarm.settings.v1';
export function readRecord(): SavedData {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value?.version === 1 && [value.highScore, value.bestWave].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return value;
  } catch { /* Storage may be unavailable. */ }
  return { version: 1, highScore: 0, bestWave: 0 };
}
export function saveRecord(value: SavedData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Keep the in-memory record. */ }
}
export function readMotion(): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (value?.version === 1 && typeof value.reducedMotion === 'boolean') return value.reducedMotion;
  } catch { /* Use system preference. */ }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function saveMotion(reducedMotion: boolean) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, reducedMotion })); } catch { /* Optional preference. */ }
}
