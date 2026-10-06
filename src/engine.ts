import {
  BOARD_SIZE, CENTER, RACK_LIMIT, BINGO_BONUS, PREMIUM_GRID, letterScore,
} from "./rules.js";
import type {
  Board, Cell, PlacedTile, ScoreExplanation, TileScore, WordScore,
} from "./types.js";

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<Cell | null>(BOARD_SIZE).fill(null));
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((c) => (c ? { ...c } : null)));
}

export function boardIsEmpty(b: Board): boolean {
  return b.every((row) => row.every((c) => c === null));
}

const isLetter = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Z]$/.test(s);

/** 规范化落子输入（含严格校验），返回 0 基坐标数组 */
export function normalizeTiles(input: unknown): PlacedTile[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new ValidationError("TILES_EMPTY", "tiles 必须是非空数组");
  if (input.length > RACK_LIMIT)
    throw new ValidationError("TOO_MANY_TILES", `一次最多放置 ${RACK_LIMIT} 枚牌`);
  const seen = new Set<string>();
  return input.map((t, i) => {
    if (!t || typeof t !== "object")
      throw new ValidationError("TILE_INVALID", `第 ${i + 1} 枚牌格式非法`);
    const row = Number((t as Record<string, unknown>).row);
    const col = Number((t as Record<string, unknown>).col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
      throw new ValidationError("OUT_OF_BOUNDS", `第 ${i + 1} 枚牌坐标越界（行列必须为 0..14）`);
    const key = `${row},${col}`;
    if (seen.has(key))
      throw new ValidationError("DUPLICATE_COORD", `重复坐标: 行${row} 列${col}`);
    seen.add(key);
    const isBlank = Boolean((t as Record<string, unknown>).isBlank);
    const letter = String((t as Record<string, unknown>).letter ?? "").toUpperCase();
    if (!isLetter(letter))
      throw new ValidationError("INVALID_CHAR", `字母必须为单个 A-Z 大写/英文字母，收到: ${String((t as Record<string, unknown>).letter)}`);
    return { row, col, letter, isBlank };
  });
}

export class ValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 规范化手牌：A-Z 或 '?'（空白牌） */
export function normalizeRack(input: unknown): (string)[] {
  if (input === undefined || input === null) return [];
  if (typeof input === "string") {
    return input.toUpperCase().split("").map((ch) => {
      if (ch === "?") return "?";
      if (!/^[A-Z]$/.test(ch)) throw new ValidationError("INVALID_CHAR", `手牌含非法字符: ${ch}`);
      return ch;
    });
  }
  if (!Array.isArray(input)) throw new ValidationError("RACK_INVALID", "rack 必须是字符串或数组");
  return input.map((x, i) => {
    const ch = String(x).toUpperCase();
    if (ch === "?") return "?";
    if (!/^[A-Z]$/.test(ch)) throw new ValidationError("INVALID_CHAR", `手牌第 ${i + 1} 项非法: ${String(x)}`);
    return ch;
  });
}

/** 校验手牌多重集是否足够支撑本次落子；返回消耗后的剩余手牌（保持顺序，移除被消耗项） */
export function consumeRack(rack: string[], tiles: PlacedTile[]): string[] {
  const need = new Map<string, number>();
  for (const t of tiles) {
    const key = t.isBlank ? "?" : t.letter;
    need.set(key, (need.get(key) ?? 0) + 1);
  }
  const have = new Map<string, number>();
  for (const r of rack) have.set(r, (have.get(r) ?? 0) + 1);
  for (const [k, n] of need) {
    if ((have.get(k) ?? 0) < n)
      throw new ValidationError("RACK_INSUFFICIENT", `手牌不足：需要 ${n} 枚 ${k === "?" ? "空白牌(?)" : k}，只有 ${have.get(k) ?? 0} 枚`);
  }
  if (rack.length < tiles.length)
    throw new ValidationError("RACK_INSUFFICIENT", "手牌总数不足");
  const remaining = [...rack];
  for (const t of tiles) {
    const key = t.isBlank ? "?" : t.letter;
    const idx = remaining.indexOf(key);
    remaining.splice(idx, 1);
  }
  return remaining;
}

export interface EvalOptions {
  dictionary: Set<string>;
  letterScores: Record<string, number>;
}

/**
 * 核心评估：给定当前棋盘与本次新牌，做全部合法性检查并计分。
 * 不修改原棋盘；校验失败抛 ValidationError。
 */
export function evaluate(board: Board, tiles: PlacedTile[], opt: EvalOptions): ScoreExplanation {
  const firstMove = boardIsEmpty(board);

  // 1. 重叠检查
  for (const t of tiles) {
    if (board[t.row][t.col] !== null)
      throw new ValidationError("CELL_OCCUPIED", `行${t.row} 列${t.col} 已有牌，不能覆盖`);
  }

  // 2. 直线与空隙检查
  let direction: "horizontal" | "vertical" | null = null;
  if (tiles.length > 1) {
    const sameRow = tiles.every((t) => t.row === tiles[0].row);
    const sameCol = tiles.every((t) => t.col === tiles[0].col);
    if (!sameRow && !sameCol)
      throw new ValidationError("NOT_STRAIGHT", "多枚新牌必须全部位于同一行或同一列");
    direction = sameRow ? "horizontal" : "vertical";
  }

  const newSet = new Map<string, PlacedTile>();
  for (const t of tiles) newSet.set(`${t.row},${t.col}`, t);

  const merged = cloneBoard(board);
  for (const t of tiles) merged[t.row][t.col] = { letter: t.letter, blank: t.isBlank };

  // 3. 主方向上不得有空隙（已有牌可填补间隔）
  if (direction === "horizontal") {
    const r = tiles[0].row;
    const cols = tiles.map((t) => t.col);
    for (let c = Math.min(...cols); c <= Math.max(...cols); c++) {
      if (merged[r][c] === null)
        throw new ValidationError("GAP_IN_LINE", `主词在 行${r} 列${c} 处存在未填空隙`);
    }
  } else if (direction === "vertical") {
    const c = tiles[0].col;
    const rows = tiles.map((t) => t.row);
    for (let r = Math.min(...rows); r <= Math.max(...rows); r++) {
      if (merged[r][c] === null)
        throw new ValidationError("GAP_IN_LINE", `主词在 行${r} 列${c} 处存在未填空隙`);
    }
  }

  // 4. 首步覆盖中心；后续必须与已有牌相连
  if (firstMove) {
    if (!newSet.has(`${CENTER},${CENTER}`))
      throw new ValidationError("CENTER_REQUIRED", "首步必须覆盖中心格 H8");
  } else {
    const touches = tiles.some((t) => hasNeighbor(board, t.row, t.col));
    if (!touches)
      throw new ValidationError("NOT_CONNECTED", "后续落子必须与棋盘上已有牌相邻相连");
  }

  // 5. 提取经过任一新牌的最长横向 / 纵向单词（长度 >= 2），相同区间只计一次
  const wordSpecs = extractWords(merged, newSet);
  if (wordSpecs.length === 0)
    throw new ValidationError("NO_WORD", "本次落子没有形成长度至少为 2 的单词");

  // 6. 词典核验
  const invalid: string[] = [];
  for (const w of wordSpecs) {
    if (!opt.dictionary.has(w.word)) invalid.push(w.word);
  }
  if (invalid.length > 0)
    throw new ValidationError("WORD_NOT_IN_DICTIONARY", `单词不在冻结词典中: ${invalid.join(", ")}`);

  // 7. 逐词计分
  const wordScores = wordSpecs.map((w) => scoreWord(merged, w, newSet, opt.letterScores));
  const wordsTotal = wordScores.reduce((s, w) => s + w.score, 0);
  const bingoBonus = tiles.length === RACK_LIMIT ? BINGO_BONUS : 0;
  return {
    words: wordScores,
    wordsTotal,
    bingoBonus,
    total: wordsTotal + bingoBonus,
    tileCount: tiles.length,
  };
}

function hasNeighbor(b: Board, row: number, col: number): boolean {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return dirs.some(([dr, dc]) => {
    const r = row + dr, c = col + dc;
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && b[r][c] !== null;
  });
}

interface WordSpec {
  word: string;
  direction: "horizontal" | "vertical";
  cells: { row: number; col: number }[];
}

function extractWords(merged: Board, newSet: Map<string, PlacedTile>): WordSpec[] {
  const specs: WordSpec[] = [];
  const seen = new Set<string>();

  const run = (row: number, col: number, dr: number, dc: number, dir: "horizontal" | "vertical") => {
    let r = row, c = col;
    while (r - dr >= 0 && c - dc >= 0 && r - dr < BOARD_SIZE && c - dc < BOARD_SIZE && merged[r - dr][c - dc]) {
      r -= dr; c -= dc;
    }
    const cells: { row: number; col: number }[] = [];
    let word = "";
    let rr = r, cc = c, touchesNew = false;
    while (rr >= 0 && cc >= 0 && rr < BOARD_SIZE && cc < BOARD_SIZE && merged[rr][cc]) {
      cells.push({ row: rr, col: cc });
      word += merged[rr][cc]!.letter;
      if (newSet.has(`${rr},${cc}`)) touchesNew = true;
      rr += dr; cc += dc;
    }
    if (cells.length >= 2 && touchesNew) {
      const key = `${dir}:${cells[0].row},${cells[0].col}-${cells[cells.length - 1].row},${cells[cells.length - 1].col}`;
      if (!seen.has(key)) {
        seen.add(key);
        specs.push({ word, direction: dir, cells });
      }
    }
  };

  for (const key of newSet.keys()) {
    const [rowStr, colStr] = key.split(",");
    const row = Number(rowStr), col = Number(colStr);
    run(row, col, 0, 1, "horizontal");
    run(row, col, 1, 0, "vertical");
  }
  return specs;
}

function scoreWord(
  merged: Board,
  spec: WordSpec,
  newSet: Map<string, PlacedTile>,
  scores: Record<string, number>,
): WordScore {
  const tileScores: TileScore[] = [];
  let subtotal = 0;
  let wordMult = 1;
  for (const { row, col } of spec.cells) {
    const cell = merged[row][col]!;
    const isNew = newSet.has(`${row},${col}`);
    let lm = 1, wm = 1;
    let base = letterScore(cell.letter, scores);
    if (cell.blank) base = 0;
    if (isNew) {
      const prem = PREMIUM_GRID[row][col];
      if (prem === "DL") lm = 2;
      else if (prem === "TL") lm = 3;
      else if (prem === "DW") wm = 2;
      else if (prem === "TW") wm = 3;
    }
    subtotal += base * lm;
    wordMult *= wm;
    tileScores.push({
      letter: cell.letter,
      base,
      letterMultiplier: lm,
      wordMultiplier: wm,
      isNew,
      isBlank: cell.blank,
    });
  }
  return {
    word: spec.word,
    direction: spec.direction,
    cells: spec.cells,
    tileScores,
    wordMultiplierProduct: wordMult,
    subtotal,
    score: subtotal * wordMult,
  };
}

/** 将新牌合并进棋盘（确认提交时调用） */
export function applyTiles(board: Board, tiles: PlacedTile[]): Board {
  const next = cloneBoard(board);
  for (const t of tiles) next[t.row][t.col] = { letter: t.letter, blank: t.isBlank };
  return next;
}
