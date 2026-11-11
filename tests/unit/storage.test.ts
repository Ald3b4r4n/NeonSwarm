import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/game/contracts';
import { readRecord, saveRecord, readMotion, saveMotion } from '../../src/ui/storage';

afterEach(() => vi.unstubAllGlobals());

function storage() {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  return items;
}

describe('persistência local', () => {
  it('grava e lê o recorde e a configuração', () => {
    storage();
    const record = { version: 1 as const, highScore: 420, bestWave: 6 };
    saveRecord(record);
    expect(readRecord()).toEqual(record);
    expect(readMotion()).toBe(false);
    saveMotion(true);
    expect(readMotion()).toBe(true);
  });

  it('recupera recorde com JSON corrompido ou números inválidos', () => {
    const items = storage();
    for (const payload of ['{', '{"version":1,"highScore":-20,"bestWave":2}', '{"version":2,"highScore":300,"bestWave":3}']) {
      items.set(STORAGE_KEY, payload);
      expect(readRecord()).toEqual({ version: 1, highScore: 0, bestWave: 0 });
    }
  });

  it('continua funcionando quando o navegador bloqueia armazenamento', () => {
    storage();
    const denied = () => { throw new Error('storage denied'); };
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied });
    expect(() => saveRecord({ version: 1, highScore: 5, bestWave: 1 })).not.toThrow();
    expect(readRecord().highScore).toBe(0);
    expect(() => saveMotion(true)).not.toThrow();
  });
});
