import * as path from 'node:path';
import { Store } from './store';
import { evaluateMove, PlacementInput, BoardState } from './engine';
import { SIZE } from './board';
import { getDictionary, listDictionaries } from './dictionary';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

function parseArgs(argv: string[]): { cmd: string; positional: string[]; opts: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      opts[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
    } else positional.push(rest[i]);
  }
  return { cmd, positional, opts };
}

// --place "7,7,C 7,8,A 7,9,T?"  或 JSON 数组
function parsePlacements(s: string): PlacementInput[] {
  const t = s.trim();
  if (t.startsWith('[')) return JSON.parse(t);
  return t.split(/\s+/).map((tok) => {
    const m = tok.match(/^(\d+),(\d+),([A-Za-z])(\?)?$/);
    if (!m) throw new Error(`无法解析落子 "${tok}"，格式：row,col,letter（空白牌加 ? 后缀）`);
    return { row: Number(m[1]), col: Number(m[2]), letter: m[3].toUpperCase(), blank: !!m[4] };
  });
}

function parseRack(s: string): string[] {
  return s.split('').map((c) => (c === '?' ? '?' : c.toUpperCase()));
}

function printBoard(board: BoardState): string {
  const lines: string[] = ['    ' + Array.from({ length: SIZE }, (_, c) => String(c).padStart(2)).join(' ')];
  for (let r = 0; r < SIZE; r++) {
    lines.push(String(r).padStart(2) + '  ' + board[r].map((t) => (t ? (t.blank ? t.letter.toLowerCase() : t.letter) : '.').padStart(2)).join(' '));
  }
  return lines.join('\n');
}

function printResult(result: any) {
  if (!result.ok) {
    console.log('非法落子：');
    for (const e of result.errors) console.log(`  [${e.code}] ${e.message}`);
    return;
  }
  console.log('合法落子，逐词计分：');
  for (const w of result.words) {
    console.log(`  ${w.word} (${w.dir} @ ${w.row},${w.col}) 基础分 ${w.baseScore} × 单词倍率 ${w.wordMultiplier} = ${w.score}`);
    for (const c of w.cells) {
      console.log(`    (${c.row},${c.col}) ${c.letter}${c.blank ? '(空白牌)' : ''} ${c.isNew ? '新牌' : '旧牌'} 字母倍率×${c.letterMultiplier}${c.premium ? ` 触发${c.premium}` : ''} → ${c.letterScore}`);
    }
  }
  if (result.bingoBonus) console.log(`  七牌奖励 +${result.bingoBonus}`);
  console.log(`  本步总分: ${result.score}`);
  console.log(`  剩余手牌: ${result.remainingRack.join(' ')}`);
}

function openStore(opts: Record<string, string>) {
  return new Store(opts.db ? path.resolve(opts.db) : path.join(DATA_DIR, 'crossword.db'));
}

const { cmd, positional, opts } = parseArgs(process.argv.slice(2));

try {
  switch (cmd) {
    case 'dictionaries': {
      console.log(listDictionaries().join('\n'));
      break;
    }
    case 'new': {
      const store = openStore(opts);
      const g = store.createGame(opts.dictionary);
      console.log(`创建局面 ${g.id}（词典 ${g.dictionary}）`);
      break;
    }
    case 'show': {
      const store = openStore(opts);
      const g = store.getGame(positional[0]);
      if (!g) throw new Error('局面不存在');
      console.log(`局面 ${g.id} 版本 ${g.version} 词典 ${g.dictionary}`);
      console.log(printBoard(JSON.parse(g.board_json)));
      break;
    }
    case 'preview': {
      const store = openStore(opts);
      const g = store.getGame(positional[0]);
      if (!g) throw new Error('局面不存在');
      const result = evaluateMove(JSON.parse(g.board_json), parsePlacements(opts.place), parseRack(opts.rack), getDictionary(g.dictionary)!);
      printResult(result);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case 'commit': {
      const store = openStore(opts);
      const requestId = opts['request-id'] ?? `cli-${Date.now()}`;
      const out = store.commitMove(positional[0], requestId, parsePlacements(opts.place), parseRack(opts.rack));
      if (out.status === 'invalid') {
        console.log('落子被拒绝，棋盘未变化：');
        for (const e of out.errors as any[]) console.log(`  [${e.code}] ${e.message}`);
        process.exitCode = 1;
      } else {
        console.log(`已提交（${out.status === 'duplicate' ? '重复请求，返回首次结果' : '新局面版本 ' + out.seq}，requestId=${requestId}）`);
        printResult(out.result);
      }
      break;
    }
    case 'moves': {
      const store = openStore(opts);
      for (const m of store.listMoves(positional[0])) {
        const r = JSON.parse(m.result_json);
        console.log(`#${m.seq} requestId=${m.request_id} 得分 ${r.score} 词: ${r.words.map((w: any) => w.word).join(', ')}`);
      }
      break;
    }
    case 'export': {
      const store = openStore(opts);
      const g = store.getGame(positional[0]);
      if (!g) throw new Error('局面不存在');
      const moves = store.listMoves(g.id).map((m) => ({ seq: m.seq, requestId: m.request_id, placements: JSON.parse(m.placements_json), rack: JSON.parse(m.rack_json), result: JSON.parse(m.result_json) }));
      console.log(JSON.stringify({ game: { id: g.id, version: g.version, dictionary: g.dictionary, rules: JSON.parse(g.rules_json), board: JSON.parse(g.board_json) }, moves }, null, 2));
      break;
    }
    case 'demo': {
      runDemo(openStore(opts));
      break;
    }
    default:
      console.log([
        '用法：npm run cli -- <命令>',
        '  dictionaries                        列出可用词典',
        '  new [--dictionary core-v1]          创建局面',
        '  show <gameId>                       显示棋盘',
        '  preview <gameId> --rack CAT --place "7,7,C 7,8,A 7,9,T"',
        '  commit  <gameId> --rack CAT --place "..." --request-id r1',
        '  moves <gameId>                      列出已接受落子',
        '  export <gameId>                     导出 JSON',
        '  demo                                运行内置演示',
      ].join('\n'));
  }
} catch (e: any) {
  console.error(`错误: ${e.message}`);
  process.exitCode = 1;
}

function runDemo(store: Store) {
  const g = store.createGame();
  console.log(`=== 演示 1：空棋盘首步 CAT（中心 A 在双倍单词格）===`);
  const r1 = store.commitMove(g.id, 'demo-1',
    [{ row: 7, col: 6, letter: 'C' }, { row: 7, col: 7, letter: 'A' }, { row: 7, col: 8, letter: 'T' }],
    ['C', 'A', 'T']);
  printResult(r1.result);

  console.log('\n=== 演示 2：接 S 成为 CATS（旧中心倍格不复用）===');
  const r2 = store.commitMove(g.id, 'demo-2', [{ row: 7, col: 9, letter: 'S' }], ['S']);
  printResult(r2.result);

  console.log('\n=== 演示 3a：在 (8,8) 放 O，纵向形成 TO ===');
  const r3a = store.commitMove(g.id, 'demo-3a', [{ row: 8, col: 8, letter: 'O' }], ['O']);
  printResult(r3a.result);

  console.log('\n=== 演示 3b：一枚 T 同时形成两个词（纵向 AT + 横向 TO）===');
  const r3b = store.commitMove(g.id, 'demo-3b', [{ row: 8, col: 7, letter: 'T' }], ['T']);
  printResult(r3b.result);

  console.log('\n=== 演示 4：整步拒绝——词不在词典 ===');
  const r4 = store.commitMove(g.id, 'demo-4', [{ row: 7, col: 10, letter: 'Z' }], ['Z']);
  if (r4.status === 'invalid') {
    console.log('已拒绝（CATSZ 不在词典），棋盘未变化：');
    for (const e of r4.errors as any[]) console.log(`  [${e.code}] ${e.message}`);
  }

  console.log('\n=== 演示 5：重复提交（幂等）===');
  const r5 = store.commitMove(g.id, 'demo-2', [{ row: 7, col: 9, letter: 'S' }], ['S']);
  console.log(`状态: ${r5.status}（重复请求返回首次结果，不重复加分），得分 ${r5.result!.score}`);

  console.log('\n最终棋盘：');
  const final = store.getGame(g.id)!;
  console.log(printBoard(JSON.parse(final.board_json)));
  console.log(`\n局面 ID: ${g.id}，版本 ${final.version}`);
}
