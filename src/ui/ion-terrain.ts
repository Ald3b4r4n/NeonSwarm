import { WORLD_CHUNK, worldRandom } from '../game/ion-station.js';
import type { BiomeId, Rect } from '../game/contracts.js';

const palettes = {
  station: { ground: '#202b2d', soil: '#485454', fleck: '#89917a', tuft: '#657564', metal: '#586773', light: '#83e9e8' },
  nursery: { ground: '#30212f', soil: '#67404e', fleck: '#a26473', tuft: '#96445e', metal: '#765565', light: '#ff9aaf' },
};
const tiles = new Map<string, HTMLCanvasElement>();

function terrainTile(biome: BiomeId, col: number, row: number) {
  const key = [biome, col, row].join(':');
  const cached = tiles.get(key);
  if (cached) {
    tiles.delete(key);
    tiles.set(key, cached);
    return cached;
  }
  const size = WORLD_CHUNK;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d')!;
  const color = palettes[biome];
  ctx.fillStyle = color.ground;
  ctx.fillRect(0, 0, size, size);

  // Sample neighboring patches so the terrain continues across cache boundaries.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const random = worldRandom(col + dx, row + dy, 511);
      for (let i = 0; i < 4; i++) {
        const x = dx * size + random() * size;
        const y = dy * size + random() * size;
        const radius = 38 + random() * 125;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, color.soil + '90');
        glow.addColorStop(1, color.soil + '00');
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }
  const random = worldRandom(col, row, 1741);
  for (let i = 0; i < 1300; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = i % 3 ? color.fleck + '24' : '#05080b35';
    ctx.fillRect(x, y, 1 + random() * 5, 1 + random() * 2);
  }
  for (let i = 0; i < 85; i++) {
    const x = 10 + random() * (size - 20);
    const y = 10 + random() * (size - 20);
    const height = 3 + random() * 8;
    ctx.strokeStyle = color.tuft + '85';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - height * .55);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 4, y - height);
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1, y - height);
    ctx.stroke();
  }

  if (random() < .7) {
    const x = 65 + random() * 380;
    const y = 65 + random() * 380;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    if (biome === 'station') {
      ctx.fillStyle = '#080c11a0';
      ctx.fillRect(-42, -11, 92, 31);
      ctx.fillStyle = color.metal;
      ctx.fillRect(-42, -17, 84, 31);
      ctx.fillStyle = '#2e3f48';
      ctx.fillRect(-38, -13, 76, 23);
      for (let rib = -32; rib < 40; rib += 8) ctx.fillRect(rib, -15, 2, 28);
      ctx.fillStyle = color.light;
      ctx.fillRect(-34, -10, 2, 17);
      ctx.fillRect(32, -10, 2, 17);
    } else {
      for (let i = 0; i < 7; i++) {
        const px = random() * 54 - 27;
        const py = random() * 42 - 21;
        const radius = 3 + random() * 10;
        ctx.beginPath();
        ctx.ellipse(px, py + 3, radius + 3, radius * .7 + 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#160f19a0';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px, py, radius, radius * .7, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? color.tuft : color.metal;
        ctx.fill();
        ctx.fillStyle = color.light;
        ctx.fillRect(px - 2, py - 2, 3, 2);
      }
    }
    ctx.restore();
  }

  tiles.set(key, tile);
  if (tiles.size > 48) tiles.delete(tiles.keys().next().value!);
  return tile;
}

export function drawOpenWorld(ctx: CanvasRenderingContext2D, biome: BiomeId, view: Rect) {
  const left = Math.floor(view.x / WORLD_CHUNK);
  const top = Math.floor(view.y / WORLD_CHUNK);
  const right = Math.ceil((view.x + view.w) / WORLD_CHUNK);
  const bottom = Math.ceil((view.y + view.h) / WORLD_CHUNK);
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      ctx.drawImage(terrainTile(biome, col, row), col * WORLD_CHUNK, row * WORLD_CHUNK);
    }
  }
}
