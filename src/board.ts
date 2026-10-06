export const SIZE = 15;

export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | null;

const TW: [number, number][] = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
const DW: [number, number][] = [[1,1],[2,2],[3,3],[4,4],[7,7],[10,10],[11,11],[12,12],[13,13],[1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1]];
const TL: [number, number][] = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]];
const DL: [number, number][] = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]];

const grid: Premium[][] = Array.from({ length: SIZE }, () => Array<Premium>(SIZE).fill(null));
for (const [r, c] of TW) grid[r][c] = 'TW';
for (const [r, c] of DW) grid[r][c] = 'DW';
for (const [r, c] of TL) grid[r][c] = 'TL';
for (const [r, c] of DL) grid[r][c] = 'DL';

export function premiumAt(row: number, col: number): Premium {
  return grid[row][col];
}

export const CENTER = 7;
