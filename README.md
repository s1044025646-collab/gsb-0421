# 交叉拼字落子合法性与倍格计分核验后端

本地可运行的受限英文交叉拼字（Scrabble 风格）单步落子核验服务。只做 **API 与 CLI**，不含在线对战、随机牌袋、电脑选词或完整赛事规则。

技术栈：TypeScript + Node.js（≥ 22.5，使用内置 `node:sqlite`，无原生依赖、无需 Docker/WSL/外部服务）。

## 快速开始

```powershell
npm install        # 仅安装开发依赖 typescript / @types/node
npm run build      # 编译到 dist/
npm test           # 构建并运行全部单元测试
npm run demo       # 运行内置演示（CAT → CATS → 交叉词 → 整步拒绝 → 幂等）
npm start          # 启动 HTTP API（默认自动选择空闲端口）
npm start -- --port 8080   # 指定端口；也可用环境变量 PORT
npm run cli -- <命令>      # 使用 CLI
```

数据默认保存在项目内 `data/crossword.db`（可用环境变量 `DATA_DIR` 或 CLI 的 `--db` 覆盖）。

## 坐标与数据约定

- 棋盘 15×15，坐标 `(row, col)` 从 **0** 开始，中心格为 `(7,7)`。
- 字母一律大写 ASCII `A-Z`；非法字符报 `INVALID_LETTER`。
- 手牌 `rack` 为字符串数组：`"A".."Z"` 为普通牌，`"?"` 为空白牌。手牌由每次请求明确给出，服务端不补牌，响应返回 `remainingRack`。
- 落子 `placements`：`{row, col, letter, blank?}`。空白牌必须 `blank: true` 并声明 `letter`，该牌永久零分（棋盘上以小写显示），但所在单词倍格仍生效。
- 倍格采用标准布局：TW/DW/TL/DL，中心 `(7,7)` 为 DW。**只有本次新落的牌触发所在格倍格**，旧牌倍格不复用；同一新牌同时属于横纵两词时，其倍格分别参与两词计分。
- 一步恰好放 7 枚牌额外 +50。

## 落子规则（简化边界）

1. 多枚新牌必须同行或同列；主方向上不允许未填空隙（已有牌可填补间隔）。
2. 首步必须覆盖中心格；后续落子必须与已有字母相邻连接。
3. 禁止越界、重复坐标、覆盖已有牌；手牌多重集必须足够（空白牌只能由 `"?"` 支付）。
4. 合成局面后，提取**所有经过新牌**的最长横/纵单词（同一坐标区间只计一次），长度 ≥ 2 的词全部必须在冻结词典中；任何一个词无效则**整步拒绝**，棋盘不变。
5. 单枚落子形成的长度为 1 的孤立“词”不计分（但连接性规则保证正常落子至少形成一个 ≥2 的词）。
- 不做：轮流对战、牌袋抽牌、挑战/换手、计分板持久累计（总分由导出数据自行汇总）。

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dictionaries` | 列出可用冻结词典 |
| POST | `/games` | 创建局面，body `{"dictionary": "core-v1"}`（可省略），规则快照随局面冻结 |
| GET | `/games/:id` | 查询局面（棋盘、版本、规则快照） |
| POST | `/games/:id/preview` | 预览落子，body `{placements, rack}`，不改变棋盘 |
| POST | `/games/:id/commit` | 确认落子，body `{placements, rack, requestId}`，原子写入并生成新版本 |
| GET | `/games/:id/moves` / `/games/:id/moves/:seq` | 查询已接受落子及逐词逐格计分解释 |
| GET | `/games/:id/export` | 导出局面 + 全部落子 JSON |

- `requestId` 保证幂等：同一 `(gameId, requestId)` 重复提交返回首次结果，不重复加分。
- 预览与失败请求（HTTP 422）不改变棋盘。
- 更换词典/规则请另建新局面（新的分析版本）；旧局面重启后仍按原规则快照核对。

### 错误码

`BAD_JSON` `BAD_REQUEST` `GAME_NOT_FOUND` `MOVE_NOT_FOUND` `UNKNOWN_DICTIONARY` `REQUEST_ID_REQUIRED` `NO_PLACEMENTS` `TOO_MANY_TILES` `OUT_OF_BOUNDS` `DUPLICATE_COORD` `CELL_OCCUPIED` `INVALID_LETTER` `BLANK_REQUIRES_LETTER` `INVALID_RACK` `RACK_INSUFFICIENT` `NOT_ALIGNED` `GAP` `FIRST_MOVE_CENTER` `NOT_CONNECTED` `WORD_NOT_IN_DICTIONARY`

## CLI

```powershell
npm run cli -- new                          # 创建局面，输出 gameId
npm run cli -- show <gameId>                # 显示棋盘（空白牌小写）
npm run cli -- preview <gameId> --rack CAT --place "7,7,C 7,8,A 7,9,T"
npm run cli -- commit  <gameId> --rack CAT --place "7,7,C 7,8,A 7,9,T" --request-id r1
npm run cli -- moves <gameId>               # 已接受落子列表
npm run cli -- export <gameId>              # 导出 JSON
npm run cli -- dictionaries
```

`--place` 格式：`行,列,字母`，空白牌加 `?` 后缀（如 `7,8,T?`），多个落子用空格分隔；也接受 JSON 数组。

## 演示内容（npm run demo）

1. 空棋盘首步 CAT：C=3、A=1、T=1，中心 A 落 DW，`(3+1+1)×2 = 10`。
2. 接 S 成 CATS：旧中心倍格不复用，`3+1+1+1 = 6`。
3. 一枚 T 同时形成纵向 AT 与横向 TO，两个词都计分。
4. 放 Z 形成 CATSZ，不在词典 → 整步拒绝，棋盘不变。
5. 相同 `requestId` 重复提交 → 返回首次结果，不重复加分。

## 测试

`npm test` 覆盖：首步 CAT=10、CATS=6、单牌双交叉词、词不在词典整步拒绝、空白牌（零分 + 倍格生效 + 身份保留）、旧牌补间隔、TW×TW 叠乘（JACKPOTS，23×9=207）、字母倍格+单词倍格组合、七牌奖励（JACKPOT，46+50=96）、非法断开、首步中心、越界/重复/覆盖/非法字母/手牌不足、提交幂等、失败不落盘、重启后按快照核对。

## 已知限制

- 内置词典 `core-v1` 为人工列举的小型冻结词表（约 120 词），仅用于演示与测试；扩充词汇请在 `src/dictionary.ts` 新增版本（如 `core-v2`），旧局面仍按 `core-v1` 核对。
- `node:sqlite` 在 Node 25 仍为实验特性（启动时有 ExperimentalWarning，不影响功能）。
- 单进程服务；并发提交依赖 SQLite 事务串行化。
