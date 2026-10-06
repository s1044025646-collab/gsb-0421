// 共享类型定义

/** 棋盘格内容：null 表示空；普通牌 letter 为 A-Z；空白牌 blank 为 true 且 letter 为其声明的字母 */
export interface Cell {
  letter: string;
  blank: boolean;
}

export type Board = (Cell | null)[][]; // board[row][col]，row/col 0..14

/** 倍格类型 */
export type PremiumType = "TL" | "DL" | "TW" | "DW" | null;

/** 本次落子请求中的单枚牌：row/col 为 0 基坐标；isBlank 表示使用空白牌并声明 letter */
export interface PlacedTile {
  row: number;
  col: number;
  letter: string;
  isBlank?: boolean;
}

export interface TileScore {
  letter: string;
  base: number; // 字母基础分（空白牌为 0）
  letterMultiplier: number; // 生效的字母倍数（新牌 1/2/3，旧牌恒为 1）
  wordMultiplier: number; // 该格贡献的单词倍数（新牌 1/2/3，旧牌恒为 1）
  isNew: boolean;
  isBlank: boolean;
}

export interface WordScore {
  word: string;
  direction: "horizontal" | "vertical";
  cells: { row: number; col: number }[];
  tileScores: TileScore[];
  wordMultiplierProduct: number; // 本词所有新落子单词倍格乘积
  subtotal: number; // 字母分（含字母倍格）
  score: number; // subtotal * 单词倍数乘积
}

export interface ScoreExplanation {
  words: WordScore[];
  wordsTotal: number;
  bingoBonus: number; // 恰好 7 枚为 50，否则 0
  total: number;
  tileCount: number;
}

export interface PreviewResult {
  ok: boolean;
  errorCode?: string;
  error?: string;
  explanation?: ScoreExplanation;
  words?: string[];
  remainingRack?: (string | "?")[];
}

export interface MoveRecord {
  id: number;
  game_id: string;
  seq: number;
  request_id: string | null;
  tiles: PlacedTile[];
  words: string[];
  total: number;
  explanation: ScoreExplanation;
  created_at: string;
}
