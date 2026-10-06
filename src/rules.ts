import type { PremiumType } from "./types.js";

export const BOARD_SIZE = 15;
export const CENTER = 7; // H8
export const RACK_LIMIT = 7;
export const BINGO_BONUS = 50;

/** 标准英文拼字字母分值（空白牌固定 0 分） */
export const DEFAULT_LETTER_SCORES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

/**
 * 构建倍格表（标准拼字棋盘，四分之一象限镜像）。
 * DL=双倍字母 TL=三倍字母 DW=双倍单词 TW=三倍单词
 */
export function buildPremiumGrid(): PremiumType[][] {
  const grid: PremiumType[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<PremiumType>(BOARD_SIZE).fill(null)
  );
  const set = (r: number, c: number, t: PremiumType) => {
    const pts: [number, number][] = [
      [r, c], [r, BOARD_SIZE - 1 - c],
      [BOARD_SIZE - 1 - r, c], [BOARD_SIZE - 1 - r, BOARD_SIZE - 1 - c],
    ];
    for (const [rr, cc] of pts) grid[rr][cc] = t;
  };
  // 三倍单词
  for (const [r, c] of [[0, 0], [0, 7], [7, 0]] as const) set(r, c, "TW");
  // 三倍字母
  for (const [r, c] of [[1, 5], [5, 5], [5, 1]] as const) set(r, c, "TL");
  // 双倍单词（中心 H8 在此设置）
  for (const [r, c] of [[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]] as const) set(r, c, "DW");
  // 双倍字母
  for (const [r, c] of [[0, 3], [2, 6], [3, 7], [6, 6], [6, 2], [7, 3]] as const)
    set(r, c, "DL");
  return grid;
}

export const PREMIUM_GRID = buildPremiumGrid();

export function letterScore(letter: string, scores: Record<string, number>): number {
  return scores[letter] ?? 0;
}
