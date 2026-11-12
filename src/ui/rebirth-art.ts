import type { BiomeId, CharacterId, EnemyVariant } from '../game/contracts.js';

const root = new URL('./art/', document.baseURI);
export const artUrl = (name: string) => new URL(name + '.webp', root).href;
const spriteNames: readonly (CharacterId | EnemyVariant)[] = [
  'vesper', 'rook', 'drone', 'brute', 'shooter', 'spore', 'hound', 'elite', 'queen',
];
export type SpriteId = typeof spriteNames[number];
export interface ArenaArt {
  terrain: HTMLImageElement;
  sprites: Readonly<Record<SpriteId, HTMLImageElement>>;
}

const images = new Map<string, Promise<HTMLImageElement>>();
function load(name: string): Promise<HTMLImageElement> {
  let pending = images.get(name);
  if (!pending) {
    const image = new Image();
    image.src = artUrl(name);
    pending = image.decode().then(() => image).catch(error => {
      images.delete(name);
      throw error;
    });
    images.set(name, pending);
  }
  return pending;
}

export async function loadArenaArt(biome: BiomeId): Promise<ArenaArt> {
  const [terrain, sprites] = await Promise.all([
    load(biome),
    Promise.all(spriteNames.map(async name => [name, await load(name)] as const)),
  ]);
  return { terrain, sprites: Object.fromEntries(sprites) as ArenaArt['sprites'] };
}
