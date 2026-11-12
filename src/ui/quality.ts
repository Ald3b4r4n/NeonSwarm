export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type FixedQuality = Exclude<Quality, 'auto'>;
const KEY = 'neonswarm.rebirth.quality';
export const QUALITY_PRESETS = {
  low: { dpr: 1, effects: false },
  medium: { dpr: 1.45, effects: true },
  high: { dpr: 2, effects: true },
} satisfies Record<FixedQuality, { dpr: number; effects: boolean }>;

export function readQuality(): Quality {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'low' || value === 'medium' || value === 'high' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveQuality(value: Quality): void {
  try { localStorage.setItem(KEY, value); } catch { /* Settings remain usable in memory. */ }
}
