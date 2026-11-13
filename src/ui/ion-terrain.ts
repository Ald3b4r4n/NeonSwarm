import { ION_STATION, SECTOR_HEIGHT, SECTOR_WIDTH, STATION_SECTORS } from '../game/ion-station.js';
import type { Rect, Vec2 } from '../game/contracts.js';

const tiles = new Map<number, HTMLCanvasElement>();
const colors = ['#44b7c3', '#d69b53', '#9484d3'];

function sectorTile(col: number, row: number) {
  const index = row * STATION_SECTORS[0].length + col;
  const cached = tiles.get(index);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = SECTOR_WIDTH;
  canvas.height = SECTOR_HEIGHT;
  const g = canvas.getContext('2d')!;
  const accent = colors[(col + row) % colors.length];
  let seed = 1117 + index * 321;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };

  box(0, 0, SECTOR_WIDTH, SECTOR_HEIGHT, '#0a121a');
  for (let y = 0; y < SECTOR_HEIGHT; y += 64) {
    for (let x = 0; x < SECTOR_WIDTH; x += 64) {
      const tone = 20 + Math.floor(noise() * 12);
      box(x + 1, y + 1, 62, 62, `rgb(${tone}, ${tone + 8}, ${tone + 15})`);
      box(x + 2, y + 2, 60, 1, '#7896a12e');
      for (const dx of [5, 58]) {
        box(x + dx, y + 6, 2, 2, '#081017');
        box(x + dx, y + 56, 2, 2, '#081017');
      }
    }
  }
  for (let i = 0; i < 1800; i++) {
    box(noise() * SECTOR_WIDTH, noise() * SECTOR_HEIGHT, 1 + noise() * 15, 1,
      i % 2 ? '#a1c7d411' : '#050e1c4a');
  }

  // Painted service areas distinguish sectors without obscuring enemies or pickups.
  g.strokeStyle = accent + '63';
  g.lineWidth = 2;
  const bayY = row === 1 ? 330 : 246;
  const bayCount = col % 2 === 0 ? 3 : 2;
  for (let i = 0; i < bayCount; i++) {
    const x = 142 + i * 168;
    g.setLineDash([15, 6]);
    g.strokeRect(x, bayY, 108, 85);
    g.setLineDash([]);
    for (let mark = 0; mark < 4; mark++) box(x + 11 + mark * 12, bayY + 72, 7, 3, accent + '77');
  }
  if (row === 0) {
    for (const x of [312, 456]) {
      g.beginPath();
      g.arc(x, 492, 54, 0, Math.PI * 2);
      g.stroke();
      g.strokeRect(x - 11, 481, 22, 22);
    }
  } else if (row === 2) {
    for (const y of [432, 447, 462]) {
      box(192, y, 276, 6, '#09131d');
      box(192, y, 276, 1, accent + '60');
    }
  }

  // The main freight tracks run through every sector in the middle row.
  if (row === 1) {
    box(0, 210, SECTOR_WIDTH, 72, '#0b141d');
    for (let x = 8; x < SECTOR_WIDTH; x += 24) box(x, 215, 7, 62, '#293946');
    for (const y of [224, 265]) {
      box(0, y, SECTOR_WIDTH, 5, '#435f6a');
      box(0, y, SECTOR_WIDTH, 1, '#8eaaae');
    }
    for (let x = 0; x < SECTOR_WIDTH; x += 48) box(x, 294, 25, 2, '#cb9f53a0');
  } else {
    for (const x of [86, 688]) {
      box(x, 0, 8, SECTOR_HEIGHT, '#111c27');
      box(x + 2, 0, 2, SECTOR_HEIGHT, accent + '55');
    }
    for (let x = 284; x < 500; x += 18) box(x, 65, 10, 2, accent + '66');
  }

  for (const [x, y] of [[182, 156], [580, 488]]) {
    const glow = g.createRadialGradient(x, y, 12, x, y, 110);
    glow.addColorStop(0, accent + '38');
    glow.addColorStop(1, accent + '00');
    box(x - 110, y - 110, 220, 220, '#11192426');
    g.fillStyle = glow;
    g.fillRect(x - 110, y - 110, 220, 220);
    box(x - 43, y - 43, 86, 86, '#141d26');
    for (let offset = -40; offset <= 40; offset += 10) {
      box(x + offset, y - 41, 5, 3, '#d7ad62');
      box(x + offset, y + 38, 5, 3, '#d7ad62');
    }
    box(x - 32, y - 28, 74, 64, '#04090db8');
    box(x - 34, y - 36, 68, 66, '#354d5a');
    box(x - 28, y - 30, 56, 53, '#172731');
    if ((col + row) % 2 === 0) {
      g.beginPath();
      g.arc(x, y - 5, 21, 0, Math.PI * 2);
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.stroke();
      for (let i = -12; i <= 12; i += 8) box(x - 13, y + i - 5, 26, 2, '#46606c');
    } else {
      for (let i = -20; i < 20; i += 12) box(x + i, y - 20, 6, 34, '#4b626d');
      box(x - 17, y + 19, 34, 2, accent);
    }
    box(x - 29, y - 33, 58, 2, '#8398a1');
  }

  g.font = '700 15px monospace';
  g.textAlign = 'center';
  g.fillStyle = accent + 'a0';
  g.fillText(STATION_SECTORS[row][col].toUpperCase(), SECTOR_WIDTH / 2, 104);
  g.font = '700 44px monospace';
  g.fillStyle = '#7d9dad30';
  g.fillText(`I–${String(index + 1).padStart(2, '0')}`, SECTOR_WIDTH / 2, 466);
  tiles.set(index, canvas);
  return canvas;
}

export function drawStation(ctx: CanvasRenderingContext2D, view: Rect) {
  const left = Math.max(0, Math.floor(view.x / SECTOR_WIDTH));
  const top = Math.max(0, Math.floor(view.y / SECTOR_HEIGHT));
  const right = Math.min(STATION_SECTORS[0].length, Math.ceil((view.x + view.w) / SECTOR_WIDTH));
  const bottom = Math.min(STATION_SECTORS.length, Math.ceil((view.y + view.h) / SECTOR_HEIGHT));
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      ctx.drawImage(sectorTile(col, row), col * SECTOR_WIDTH, row * SECTOR_HEIGHT);
    }
  }
  ctx.strokeStyle = '#4b7188';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, ION_STATION.w, ION_STATION.h);
}

export function drawStationMap(ctx: CanvasRenderingContext2D, view: Rect, player: Vec2) {
  const width = 108;
  const height = 68;
  const x = view.x + view.w - width - 22;
  const y = view.y + 105;
  ctx.fillStyle = '#08131ee8';
  ctx.fillRect(x - 5, y - 5, width + 10, height + 10);
  ctx.strokeStyle = '#365568';
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.strokeRect(x + col * width / 4, y + row * height / 3, width / 4, height / 3);
    }
  }
  ctx.fillStyle = '#7cf8ff';
  ctx.beginPath();
  ctx.arc(x + player.x / ION_STATION.w * width, y + player.y / ION_STATION.h * height, 3, 0, 2 * Math.PI);
  ctx.fill();
}
