import type { CharacterId, Vec2 } from '../game/contracts.js';

const suits = {
  vesper: { plate: '#526779', edge: '#a8c6cc', visor: '#94ffff', trim: '#ff9f54', cloth: '#254551' },
  rook: { plate: '#686077', edge: '#ccc1d9', visor: '#e6c2ff', trim: '#e6b96d', cloth: '#3a2d50' },
};

export function drawSurvivor(ctx: CanvasRenderingContext2D, character: CharacterId, pos: Vec2,
  direction: Vec2, time: number, moving: boolean, firing: boolean, hurt: boolean, fall: number) {
  const suit = suits[character];
  const heading = Math.atan2(direction.y, direction.x) + Math.PI / 2;
  const stride = moving ? Math.sin(time * 17) * 7 : 0;
  const recoil = firing ? 4 : 0;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.fillStyle = '#07101691';
  ctx.beginPath();
  ctx.ellipse(2, 5, 24, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(heading + fall * .9);
  ctx.globalAlpha *= 1 - fall * .45;

  function plate(fill: string, points: number[]) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#101923';
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 8, stride * side);
    plate('#344652', [-6, 2, 6, 3, 5, 20, 2, 24, -5, 22]);
    plate(suit.edge, [-5, 14, 4, 13, 5, 19, -4, 20]);
    ctx.restore();
  }
  plate(suit.cloth, [-15, 0, 13, 3, 9 + stride * .4, 28, 2, 25, -7, 30, -15, 24]);
  plate(suit.plate, [-16, -10, -9, -15, 11, -15, 18, -7, 13, 10, 6, 15, -10, 12]);
  plate(suit.trim, [-19, -12, -12, -13, -11, -2, -16, 4, -23, 1, -24, -6]);
  plate(suit.edge, [11, -12, 19, -10, 22, -3, 16, 3, 12, -1]);
  plate(hurt ? '#ffa49a' : suit.plate, [-9, -21, -4, -26, 6, -26, 11, -21, 10, -9, 5, -5, -6, -6, -10, -12]);
  plate(suit.edge, [-7, -21, -3, -24, 5, -24, 8, -21, 4, -19, -5, -19]);
  plate(suit.visor, [-8, -17, 8, -17, 6, -13, -5, -12]);
  ctx.fillStyle = suit.visor;
  ctx.fillRect(-2, 2, 4, 6);
  ctx.translate(17, recoil);
  plate('#29343c', [-5, -24, 6, -24, 8, -16, 6, 6, 0, 10, -5, 5]);
  plate(suit.trim, [-4, -25, 5, -25, 5, -20, -4, -20]);
  ctx.fillStyle = suit.visor;
  for (let y = -17; y < -4; y += 5) ctx.fillRect(-3, y, 8, 2);
  if (firing) {
    plate(suit.visor, [0, -24, -6, -29, 0, -30, 3, -41, 6, -30, 11, -28, 5, -24]);
  }
  ctx.restore();
}
