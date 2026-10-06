import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, evaluateMove, applyPlacements, BoardState } from '../src/engine';
import { getDictionary } from '../src/dictionary';

const dict = getDictionary('core-v1')!;

function boardWith(moves: { placements: any[]; rack: string[] }[]): BoardState {
  let b = emptyBoard();
  for (const m of moves) {
    const r = evaluateMove(b, m.placements, m.rack, dict);
    assert.ok(r.ok, JSON.stringify(r.errors));
    b = applyPlacements(b, m.placements);
  }
  return b;
}

test('首步 CAT：中心 A 在双倍单词格，总分 10', () => {
  const r = evaluateMove(emptyBoard(),
    [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }],
    ['C', 'A', 'T'], dict);
  assert.ok(r.ok);
  assert.equal(r.score, 10); // (3+1+1) * 2
  assert.equal(r.words![0].word, 'CAT');
  assert.equal(r.words![0].wordMultiplier, 2);
  assert.deepEqual(r.remainingRack, []);
});

test('接 S 成 CATS：旧中心倍格不复用，得 6', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }], rack: ['C', 'A', 'T'] }]);
  const r = evaluateMove(b, [{ row: 7, col: 9, letter: 'S' }], ['S'], dict);
  assert.ok(r.ok);
  assert.equal(r.score, 6);
  assert.equal(r.words![0].wordMultiplier, 1);
});

test('一枚牌同时形成两个交叉词，两个都必须合法', () => {
  const b = boardWith([
    { placements: [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }], rack: ['C', 'A', 'T'] },
    { placements: [{ row: 8, col: 8, letter: 'O' }], rack: ['O'] },
  ]);
  const r = evaluateMove(b, [{ row: 8, col: 7, letter: 'T' }], ['T'], dict);
  assert.ok(r.ok);
  assert.deepEqual(r.words!.map((w) => w.word).sort(), ['AT', 'TO']);
  assert.equal(r.score, 4); // AT=2, TO=2
});

test('词不在词典 → 整步拒绝', () => {
  const b = boardWith([
    { placements: [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }], rack: ['C', 'A', 'T'] },
  ]);
  const r = evaluateMove(b, [{ row: 7, col: 9, letter: 'Z' }], ['Z'], dict);
  assert.equal(r.ok, false);
  assert.equal(r.errors![0].code, 'WORD_NOT_IN_DICTIONARY');
});

test('空白牌：零分但单词倍格仍生效，且永久保留空白身份', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 7, letter: 'A' }], rack: ['A'] }]);
  const r = evaluateMove(b, [{ row: 7, col: 8, letter: 'T', blank: true }], ['?'], dict);
  assert.ok(r.ok);
  assert.equal(r.score, 1); // A(1，旧牌，中心 DW 不再触发) + 空白 T(0)
  const b2 = applyPlacements(b, [{ row: 7, col: 8, letter: 'T', blank: true }]);
  assert.equal(b2[7][8]!.blank, true);
  assert.equal(b2[7][8]!.letter, 'T');
});

test('空白牌首步：单词倍格生效、字母分为零', () => {
  const r = evaluateMove(emptyBoard(),
    [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A', blank: true }, { row: 7, col: 8, letter: 'T' }],
    ['C', '?', 'T'], dict);
  assert.ok(r.ok);
  assert.equal(r.score, 8); // (3+0+1)*2
});

test('旧牌填补主方向间隔', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 7, letter: 'A' }], rack: ['A'] }]);
  const r = evaluateMove(b, [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 8, letter: 'T' }], ['C', 'T'], dict);
  assert.ok(r.ok);
  assert.equal(r.words![0].word, 'CAT');
  assert.equal(r.score, 5); // 中心 DW 属旧牌，不再触发
});

test('主方向存在未填空隙 → 拒绝', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 7, letter: 'A' }], rack: ['A'] }]);
  const r = evaluateMove(b, [{ row: 7, col: 5, letter: 'C' }, { row: 7, col: 8, letter: 'T' }], ['C', 'T'], dict);
  assert.equal(r.ok, false);
  assert.equal(r.errors![0].code, 'GAP');
});

test('多个单词倍格叠乘（TW × TW = 9）', () => {
  // 同行两个单词倍格相距 8 格，需旧牌填补中间间隔。
  let b = emptyBoard();
  b = applyPlacements(b, [
    { row: 0, col: 1, letter: 'A' }, { row: 0, col: 2, letter: 'C' }, { row: 0, col: 3, letter: 'K' },
    { row: 0, col: 4, letter: 'P' }, { row: 0, col: 5, letter: 'O' }, { row: 0, col: 6, letter: 'T' },
  ]);
  const r = evaluateMove(b,
    [{ row: 0, col: 0, letter: 'J' }, { row: 0, col: 7, letter: 'S' }],
    ['J', 'S'], dict);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.words![0].word, 'JACKPOTS');
  assert.equal(r.words![0].wordMultiplier, 9);
  assert.equal(r.score, 207); // 23 * 9
});

test('字母倍格与单词倍格同时作用于新牌', () => {
  let b = emptyBoard();
  b = applyPlacements(b, [
    { row: 7, col: 4, letter: 'E' }, { row: 7, col: 5, letter: 'A' }, { row: 7, col: 6, letter: 'T' },
  ]);
  const r = evaluateMove(b,
    [{ row: 7, col: 3, letter: 'S' }, { row: 7, col: 7, letter: 'S' }],
    ['S', 'S'], dict);
  assert.ok(r.ok);
  assert.equal(r.words![0].word, 'SEATS');
  assert.equal(r.words![0].baseScore, 6); // (7,3) DL 使首枚 S=2
  assert.equal(r.score, 12); // (7,7) DW → 6*2
});

test('七牌奖励 +50', () => {
  const r = evaluateMove(emptyBoard(),
    [
      { row: 7, col: 2, letter: 'J' }, { row: 7, col: 3, letter: 'A' }, { row: 7, col: 4, letter: 'C' },
      { row: 7, col: 5, letter: 'K' }, { row: 7, col: 6, letter: 'P' }, { row: 7, col: 7, letter: 'O' },
      { row: 7, col: 8, letter: 'T' },
    ],
    ['J', 'A', 'C', 'K', 'P', 'O', 'T'], dict);
  assert.ok(r.ok, JSON.stringify(r.errors));
  // JACKPOT 基础 = 8+2+3+5+3+1+1 = 23（(7,3) DL 使 A=2），(7,7) DW → 46，+50 = 96
  assert.equal(r.bingoBonus, 50);
  assert.equal(r.score, 96);
});

test('非法断开：新牌不与已有字母相连 → 拒绝', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 7, letter: 'A' }], rack: ['A'] }]);
  const r = evaluateMove(b, [{ row: 0, col: 0, letter: 'D' }, { row: 0, col: 1, letter: 'O' }], ['D', 'O'], dict);
  assert.equal(r.ok, false);
  assert.equal(r.errors![0].code, 'NOT_CONNECTED');
});

test('首步必须覆盖中心格', () => {
  const r = evaluateMove(emptyBoard(), [{ row: 0, col: 0, letter: 'D' }, { row: 0, col: 1, letter: 'O' }], ['D', 'O'], dict);
  assert.equal(r.ok, false);
  assert.equal(r.errors![0].code, 'FIRST_MOVE_CENTER');
});

test('越界、重复坐标、覆盖、非法字母、手牌不足', () => {
  const b = boardWith([{ placements: [{ row: 7, col: 7, letter: 'A' }], rack: ['A'] }]);
  assert.equal(evaluateMove(b, [{ row: 15, col: 0, letter: 'A' }], ['A'], dict).errors![0].code, 'OUT_OF_BOUNDS');
  assert.equal(evaluateMove(b, [{ row: 0, col: 0, letter: 'A' }, { row: 0, col: 0, letter: 'B' }], ['A', 'B'], dict).errors![0].code, 'DUPLICATE_COORD');
  assert.equal(evaluateMove(b, [{ row: 7, col: 7, letter: 'B' }], ['B'], dict).errors![0].code, 'CELL_OCCUPIED');
  assert.equal(evaluateMove(b, [{ row: 0, col: 0, letter: '1' as any }], ['A'], dict).errors![0].code, 'INVALID_LETTER');
  assert.equal(evaluateMove(b, [{ row: 7, col: 8, letter: 'Q' }], ['A'], dict).errors![0].code, 'RACK_INSUFFICIENT');
  assert.equal(evaluateMove(b, [{ row: 7, col: 8, letter: 'T', blank: true }], ['T'], dict).errors![0].code, 'RACK_INSUFFICIENT');
});
