import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BoardState, emptyBoard, applyPlacements, evaluateMove, MoveResult, PlacementInput } from './engine';
import { getDictionary, DEFAULT_DICTIONARY } from './dictionary';
import { LETTER_SCORES, BINGO_BONUS } from './letters';

export interface GameRow {
  id: string;
  dictionary: string;
  rules_json: string;
  board_json: string;
  version: number;
  created_at: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        dictionary TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        board_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        request_id TEXT NOT NULL,
        placements_json TEXT NOT NULL,
        rack_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (game_id, request_id)
      );
    `);
  }

  createGame(dictionaryName?: string): GameRow {
    const name = dictionaryName ?? DEFAULT_DICTIONARY;
    const dict = getDictionary(name);
    if (!dict) throw Object.assign(new Error(`未知词典 "${name}"`), { code: 'UNKNOWN_DICTIONARY' });
    const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const rules = { letterScores: LETTER_SCORES, bingoBonus: BINGO_BONUS, boardSize: 15, dictionary: name };
    this.db.prepare(
      'INSERT INTO games (id, dictionary, rules_json, board_json, version, created_at) VALUES (?,?,?,?,0,?)'
    ).run(id, name, JSON.stringify(rules), JSON.stringify(emptyBoard()), new Date().toISOString());
    return this.getGame(id)!;
  }

  getGame(id: string): GameRow | null {
    const row = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined;
    return row ?? null;
  }

  boardOf(game: GameRow): BoardState {
    return JSON.parse(game.board_json) as BoardState;
  }

  // 原子提交：同一 request_id 重复提交返回首次结果，不重复加分
  commitMove(gameId: string, requestId: string, placements: PlacementInput[], rack: string[]):
    { status: 'ok' | 'duplicate' | 'invalid'; game?: GameRow; result?: MoveResult; errors?: unknown; seq?: number } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const game = this.getGame(gameId);
      if (!game) { this.db.exec('ROLLBACK'); return { status: 'invalid', errors: [{ code: 'GAME_NOT_FOUND', message: '局面不存在' }] }; }

      const dup = this.db.prepare('SELECT seq, result_json FROM moves WHERE game_id = ? AND request_id = ?')
        .get(gameId, requestId) as { seq: number; result_json: string } | undefined;
      if (dup) {
        this.db.exec('COMMIT');
        return { status: 'duplicate', game: this.getGame(gameId)!, result: JSON.parse(dup.result_json), seq: dup.seq };
      }

      const dict = getDictionary(game.dictionary)!;
      const board = this.boardOf(game);
      const result = evaluateMove(board, placements, rack, dict);
      if (!result.ok) {
        this.db.exec('ROLLBACK'); // 失败请求不改变棋盘
        return { status: 'invalid', errors: result.errors };
      }

      const newBoard = applyPlacements(board, placements);
      const seq = game.version + 1;
      this.db.prepare('UPDATE games SET board_json = ?, version = ? WHERE id = ? AND version = ?')
        .run(JSON.stringify(newBoard), seq, gameId, game.version);
      this.db.prepare(
        'INSERT INTO moves (game_id, seq, request_id, placements_json, rack_json, result_json, created_at) VALUES (?,?,?,?,?,?,?)'
      ).run(gameId, seq, requestId, JSON.stringify(placements), JSON.stringify(rack),
        JSON.stringify(result), new Date().toISOString());
      this.db.exec('COMMIT');
      return { status: 'ok', game: this.getGame(gameId)!, result, seq };
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  listMoves(gameId: string) {
    return this.db.prepare('SELECT seq, request_id, placements_json, rack_json, result_json, created_at FROM moves WHERE game_id = ? ORDER BY seq')
      .all(gameId) as unknown as { seq: number; request_id: string; placements_json: string; rack_json: string; result_json: string; created_at: string }[];
  }

  getMove(gameId: string, seq: number) {
    return this.db.prepare('SELECT * FROM moves WHERE game_id = ? AND seq = ?').get(gameId, seq) as
      { seq: number; request_id: string; placements_json: string; rack_json: string; result_json: string; created_at: string } | undefined;
  }

  close() { this.db.close(); }
}
