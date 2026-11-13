export const SECTOR_WIDTH = 768;
export const SECTOR_HEIGHT = 640;
export const STATION_SECTORS = [
  ['Subestação', 'Oficina', 'Geradores', 'Hangar leste'],
  ['Pátio de carga', 'Terminal Íon', 'Estação de trânsito', 'Doca de carga'],
  ['Reservatórios', 'Refrigeração', 'Manutenção', 'Hangar sul'],
] as const;

export const ION_STATION = {
  x: 0, y: 0,
  w: SECTOR_WIDTH * STATION_SECTORS[0].length,
  h: SECTOR_HEIGHT * STATION_SECTORS.length,
};

export function stationSector(x: number, y: number) {
  const row = Math.min(STATION_SECTORS.length - 1, Math.max(0, Math.floor(y / SECTOR_HEIGHT)));
  const col = Math.min(STATION_SECTORS[0].length - 1, Math.max(0, Math.floor(x / SECTOR_WIDTH)));
  return STATION_SECTORS[row][col];
}

export const STATION_OBSTACLES = STATION_SECTORS.flatMap((row, y) => row.flatMap((_, x) =>
    [0, 1].map(index => ({
      x: x * SECTOR_WIDTH + (index === 0 ? 182 : 580),
      y: y * SECTOR_HEIGHT + (index === 0 ? 156 : 488),
      radius: 35,
    })),
  ));
