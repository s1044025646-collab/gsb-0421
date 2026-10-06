import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Store } from '../src/store';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
  return { store: new Store(path.join(dir, 't.db')), dir };
}

test('提交落子：原子保存、版本递增、重复 requestId 不重复加分', () => {
  const { store } = tempStore();
  const g = store.createGame();
  const placements = [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }];
  const r1 = store.commitMove(g.id, 'req-1', placements, ['C', 'A', 'T']);
  assert.equal(r1.status, 'ok');
  assert.equal(r1.result!.score, 10);
  assert.equal(r1.seq, 1);

  const r2 = store.commitMove(g.id, 'req-1', placements, ['C', 'A', 'T']);
  assert.equal(r2.status, 'duplicate');
  assert.equal(r2.result!.score, 10);
  assert.equal(store.getGame(g.id)!.version, 1); // 未重复加分/推进版本

  const r3 = store.commitMove(g.id, 'req-2', [{ row: 7, col: 9, letter: 'S' }], ['S']);
  assert.equal(r3.status, 'ok');
  assert.equal(r3.result!.score, 6);
  assert.equal(store.getGame(g.id)!.version, 2);
});

test('失败请求不改变棋盘', () => {
  const { store } = tempStore();
  const g = store.createGame();
  const bad = store.commitMove(g.id, 'req-bad', [{ row: 0, col: 0, letter: 'D' }], ['D']);
  assert.equal(bad.status, 'invalid');
  assert.equal(store.getGame(g.id)!.version, 0);
  assert.equal(store.listMoves(g.id).length, 0);
});

test('重启后按原规则快照核对旧落子', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
  const dbPath = path.join(dir, 't.db');
  const s1 = new Store(dbPath);
  const g = s1.createGame();
  const r = s1.commitMove(g.id, 'req-1',
    [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }],
    ['C', 'A', 'T']);
  assert.equal(r.status, 'ok');
  s1.close();
  const s2 = new Store(dbPath); // 模拟重启
  const g2 = s2.getGame(g.id)!;
  assert.equal(g2.version, 1);
  assert.equal(JSON.parse(g2.rules_json).dictionary, 'core-v1');
  const moves = s2.listMoves(g.id);
  assert.equal(moves.length, 1);
  assert.equal(JSON.parse(moves[0].result_json).score, 10);
  s2.close();
});
