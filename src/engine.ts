import { SIZE, premiumAt, CENTER } from './board';
import { LETTER_SCORES, BINGO_BONUS, RACK_SIZE } from './letters';
import type { Dictionary } from './dictionary';

export interface Tile {
  letter: string; // 大写 A-Z；空白牌为其声明的字母
  blank: boolean; // 空白牌永久为零分身份
}

export type BoardState = (Tile | null)[][];

export function emptyBoard(): BoardState {
  return Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
}

export interface PlacementInput {
  row: number;
  col: number;
  letter: string;
  blank?: boolean;
}

export interface MoveError {
  code: string;
  message: string;
}

export interface WordCell {
  row: number;
  col: number;
  letter: string;
  blank: boolean;
  isNew: boolean;
  letterScore: number;   // 应用字母倍格后的分值
  letterMultiplier: number;
  premium: string | null; // 仅新牌触发
}

export interface WordScore {
  word: string;
  dir: 'H' | 'V';
  row: number;
  col: number;
  cells: WordCell[];
  baseScore: number;
  wordMultiplier: number;
  score: number;
}

export interface MoveResult {
  ok: boolean;
  errors?: MoveError[];
  words?: WordScore[];
  wordScoreTotal?: number;
  bingoBonus?: number;
  score?: number;
  remainingRack?: string[];
}

const LETTER_RE = /^[A-Z]$/;

function err(code: string, message: string): MoveResult {
  return { ok: false, errors: [{ code, message }] };
}

// rack 元素："A".."Z" 普通牌，"?" 空白牌
export function evaluateMove(
  board: BoardState,
  placements: PlacementInput[],
  rack: string[],
  dict: Dictionary,
): MoveResult {
  const errors: MoveError[] = [];

  if (!Array.isArray(placements) || placements.length === 0) {
    return err('NO_PLACEMENTS', '本次请求未包含任何落子');
  }
  if (placements.length > RACK_SIZE) {
    return err('TOO_MANY_TILES', `一次最多放置 ${RACK_SIZE} 枚牌`);
  }

  // 1. 基础校验：坐标、字母、越界、重复、覆盖
  const seen = new Set<string>();
  for (const p of placements) {
    if (!Number.isInteger(p.row) || !Number.isInteger(p.col) ||
        p.row < 0 || p.row >= SIZE || p.col < 0 || p.col >= SIZE) {
      errors.push({ code: 'OUT_OF_BOUNDS', message: `坐标 (${p.row},${p.col}) 越界` });
      continue;
    }
    const key = `${p.row},${p.col}`;
    if (seen.has(key)) {
      errors.push({ code: 'DUPLICATE_COORD', message: `坐标 (${p.row},${p.col}) 重复` });
    }
    seen.add(key);
    if (board[p.row][p.col]) {
      errors.push({ code: 'CELL_OCCUPIED', message: `坐标 (${p.row},${p.col}) 已有牌，禁止覆盖` });
    }
    const letter = (p.letter ?? '').toUpperCase();
    if (!LETTER_RE.test(letter)) {
      errors.push({ code: 'INVALID_LETTER', message: `非法字母 "${p.letter}"，仅允许大写 ASCII A-Z` });
    }
    if (p.blank && !LETTER_RE.test(letter)) {
      errors.push({ code: 'BLANK_REQUIRES_LETTER', message: '空白牌必须声明代替的字母' });
    }
    p.letter = letter;
  }
  if (errors.length) return { ok: false, errors };

  // 2. 手牌多重集校验
  const pool = [...rack];
  for (const r of pool) {
    if (!(r === '?' || LETTER_RE.test(r))) {
      return err('INVALID_RACK', `手牌含非法元素 "${r}"，允许 "A"-"Z" 或 "?"（空白牌）`);
    }
  }
  for (const p of placements) {
    const want = p.blank ? '?' : p.letter;
    const idx = pool.indexOf(want);
    if (idx === -1) {
      // 普通字母牌也可用空白牌代替？不允许：空白必须显式声明
      errors.push({ code: 'RACK_INSUFFICIENT', message: `手牌不足：需要 ${p.blank ? '空白牌' : p.letter}` });
    } else {
      pool.splice(idx, 1);
    }
  }
  if (errors.length) return { ok: false, errors };

  // 3. 共线校验
  const rows = new Set(placements.map((p) => p.row));
  const cols = new Set(placements.map((p) => p.col));
  let dir: 'H' | 'V';
  if (rows.size === 1) dir = 'H';
  else if (cols.size === 1) dir = 'V';
  else return err('NOT_ALIGNED', '多枚新牌必须在同一行或同一列');

  // 4. 合成局面
  const merged: BoardState = board.map((r) => r.slice());
  for (const p of placements) {
    merged[p.row][p.col] = { letter: p.letter, blank: !!p.blank };
  }
  const isNew = (r: number, c: number) => placements.some((p) => p.row === r && p.col === c);

  // 5. 主方向连续性（已有牌可填补间隔）
  if (placements.length > 1) {
    if (dir === 'H') {
      const r = placements[0].row;
      const cs = placements.map((p) => p.col);
      for (let c = Math.min(...cs); c <= Math.max(...cs); c++) {
        if (!merged[r][c]) return err('GAP', `主方向第 ${r} 行在列 ${c} 存在未填空隙`);
      }
    } else {
      const c = placements[0].col;
      const rs = placements.map((p) => p.row);
      for (let r = Math.min(...rs); r <= Math.max(...rs); r++) {
        if (!merged[r][c]) return err('GAP', `主方向第 ${c} 列在行 ${r} 存在未填空隙`);
      }
    }
  }

  // 6. 首步中心 / 后续连接
  const boardEmpty = board.every((row) => row.every((t) => t === null));
  if (boardEmpty) {
    if (!placements.some((p) => p.row === CENTER && p.col === CENTER)) {
      return err('FIRST_MOVE_CENTER', `首步必须覆盖中心格 (${CENTER},${CENTER})`);
    }
  } else {
    let connected = false;
    for (const p of placements) {
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dr, dc] of nb) {
        const r = p.row + dr, c = p.col + dc;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c]) connected = true;
      }
    }
    if (!connected) return err('NOT_CONNECTED', '新落子必须与已有字母相连');
  }

  // 7. 提取经过新牌的最长横/纵单词（去重）
  const words: { dir: 'H' | 'V'; cells: { r: number; c: number }[] }[] = [];
  const seenWord = new Set<string>();
  const extract = (r: number, c: number, dr: number, dc: number, d: 'H' | 'V') => {
    let sr = r, sc = c;
    while (sr - dr >= 0 && sc - dc >= 0 && merged[sr - dr][sc - dc]) { sr -= dr; sc -= dc; }
    const cells: { r: number; c: number }[] = [];
    let cr = sr, cc = sc;
    while (cr < SIZE && cc < SIZE && merged[cr][cc]) { cells.push({ r: cr, c: cc }); cr += dr; cc += dc; }
    if (cells.length < 2) return;
    const key = `${d}:${sr},${sc}`;
    if (seenWord.has(key)) return;
    seenWord.add(key);
    words.push({ dir: d, cells });
  };
  for (const p of placements) {
    extract(p.row, p.col, 0, 1, 'H');
    extract(p.row, p.col, 1, 0, 'V');
  }

  // 8. 词典校验与计分
  const wordScores: WordScore[] = [];
  for (const w of words) {
    const word = w.cells.map((cell) => merged[cell.r][cell.c]!.letter).join('');
    if (!dict.words.has(word)) {
      errors.push({ code: 'WORD_NOT_IN_DICTIONARY', message: `单词 "${word}" 不在词典 ${dict.name} 中` });
      continue;
    }
    let base = 0;
    let wordMult = 1;
    const cells: WordCell[] = w.cells.map((cell) => {
      const t = merged[cell.r][cell.c]!;
      const fresh = isNew(cell.r, cell.c);
      const raw = t.blank ? 0 : LETTER_SCORES[t.letter];
      let lm = 1;
      let premium: string | null = null;
      if (fresh) {
        premium = premiumAt(cell.r, cell.c);
        if (premium === 'DL') lm = 2;
        else if (premium === 'TL') lm = 3;
        else if (premium === 'DW') wordMult *= 2;
        else if (premium === 'TW') wordMult *= 3;
      }
      const letterScore = raw * lm;
      base += letterScore;
      return { row: cell.r, col: cell.c, letter: t.letter, blank: t.blank, isNew: fresh, letterScore, letterMultiplier: lm, premium };
    });
    wordScores.push({
      word, dir: w.dir, row: w.cells[0].r, col: w.cells[0].c,
      cells, baseScore: base, wordMultiplier: wordMult, score: base * wordMult,
    });
  }
  if (errors.length) return { ok: false, errors };

  const wordScoreTotal = wordScores.reduce((s, w) => s + w.score, 0);
  const bingoBonus = placements.length === RACK_SIZE ? BINGO_BONUS : 0;
  return {
    ok: true,
    words: wordScores,
    wordScoreTotal,
    bingoBonus,
    score: wordScoreTotal + bingoBonus,
    remainingRack: pool,
  };
}

export function applyPlacements(board: BoardState, placements: PlacementInput[]): BoardState {
  const next = board.map((r) => r.slice());
  for (const p of placements) {
    next[p.row][p.col] = { letter: p.letter.toUpperCase(), blank: !!p.blank };
  }
  return next;
}
