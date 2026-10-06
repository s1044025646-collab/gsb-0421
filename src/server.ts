import * as http from 'node:http';
import * as path from 'node:path';
import { Store } from './store';
import { evaluateMove, PlacementInput } from './engine';
import { getDictionary, listDictionaries } from './dictionary';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const store = new Store(path.join(DATA_DIR, 'crossword.db'));

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'BAD_JSON' })); }
    });
    req.on('error', reject);
  });
}

function gameView(g: ReturnType<Store['getGame']> & object) {
  return {
    id: g.id, version: g.version, dictionary: g.dictionary,
    rules: JSON.parse(g.rules_json), board: JSON.parse(g.board_json), createdAt: g.created_at,
  };
}

function parseMoveBody(body: any): { placements: PlacementInput[]; rack: string[]; requestId?: string } {
  if (!body || !Array.isArray(body.placements) || !Array.isArray(body.rack)) {
    throw Object.assign(new Error('请求体需包含 placements 数组与 rack 数组'), { code: 'BAD_REQUEST' });
  }
  return { placements: body.placements, rack: body.rack, requestId: body.requestId };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    // GET /dictionaries
    if (req.method === 'GET' && url.pathname === '/dictionaries') {
      return send(res, 200, { dictionaries: listDictionaries() });
    }
    // POST /games {dictionary?}
    if (req.method === 'POST' && url.pathname === '/games') {
      const body: any = await readBody(req);
      const game = store.createGame(body?.dictionary);
      return send(res, 201, gameView(game));
    }
    if (parts[0] === 'games' && parts.length >= 2) {
      const id = parts[1];
      const game = store.getGame(id);
      if (!game) return send(res, 404, { errors: [{ code: 'GAME_NOT_FOUND', message: '局面不存在' }] });

      // GET /games/:id
      if (req.method === 'GET' && parts.length === 2) return send(res, 200, gameView(game));

      // POST /games/:id/preview
      if (req.method === 'POST' && parts[2] === 'preview') {
        const { placements, rack } = parseMoveBody(await readBody(req));
        const result = evaluateMove(store.boardOf(game), placements, rack, getDictionary(game.dictionary)!);
        return send(res, result.ok ? 200 : 422, result);
      }

      // POST /games/:id/commit  (body: {placements, rack, requestId})
      if (req.method === 'POST' && parts[2] === 'commit') {
        const { placements, rack, requestId } = parseMoveBody(await readBody(req));
        if (!requestId || typeof requestId !== 'string') {
          return send(res, 400, { errors: [{ code: 'REQUEST_ID_REQUIRED', message: 'commit 需要字符串 requestId 以保证幂等' }] });
        }
        const out = store.commitMove(id, requestId, placements, rack);
        if (out.status === 'invalid') return send(res, 422, { errors: out.errors });
        return send(res, out.status === 'duplicate' ? 200 : 201, {
          status: out.status, seq: out.seq, result: out.result, game: gameView(out.game!),
        });
      }

      // GET /games/:id/moves 或 /games/:id/moves/:seq
      if (req.method === 'GET' && parts[2] === 'moves') {
        if (parts.length === 3) {
          const moves = store.listMoves(id).map((m) => ({ ...m, placements: JSON.parse(m.placements_json), rack: JSON.parse(m.rack_json), result: JSON.parse(m.result_json) }));
          return send(res, 200, { moves });
        }
        const seq = Number(parts[3]);
        const m = store.getMove(id, seq);
        if (!m) return send(res, 404, { errors: [{ code: 'MOVE_NOT_FOUND', message: '落子记录不存在' }] });
        return send(res, 200, { seq: m.seq, requestId: m.request_id, placements: JSON.parse(m.placements_json), rack: JSON.parse(m.rack_json), result: JSON.parse(m.result_json), createdAt: m.created_at });
      }

      // GET /games/:id/export
      if (req.method === 'GET' && parts[2] === 'export') {
        const moves = store.listMoves(id).map((m) => ({ seq: m.seq, requestId: m.request_id, placements: JSON.parse(m.placements_json), rack: JSON.parse(m.rack_json), result: JSON.parse(m.result_json), createdAt: m.created_at }));
        return send(res, 200, { game: gameView(game), moves });
      }
    }
    send(res, 404, { errors: [{ code: 'NOT_FOUND', message: '未知路由' }] });
  } catch (e: any) {
    const status = e?.code === 'BAD_JSON' || e?.code === 'BAD_REQUEST' ? 400 : e?.code === 'UNKNOWN_DICTIONARY' ? 422 : 500;
    send(res, status, { errors: [{ code: e?.code ?? 'INTERNAL', message: e?.message ?? String(e) }] });
  }
});

const portArg = process.argv.indexOf('--port');
const envPort = portArg !== -1 ? Number(process.argv[portArg + 1]) : Number(process.env.PORT ?? 0);
server.listen(envPort, () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : envPort;
  console.log(`crossword API listening on http://127.0.0.1:${port} (data: ${DATA_DIR})`);
});
