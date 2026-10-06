import { BOARD_SIZE } from "./rules.js";

/** 解析如 "H8" 的坐标为 0 基 {row,col}；列 A-O，行 1-15（行号从上到下） */
export function parseCoord(text: string): { row: number; col: number } {
  if (typeof text !== "string") throw new Error("坐标必须是字符串，例如 H8");
  const m = /^([A-Oa-o])(\d{1,2})$/.exec(text.trim());
  if (!m) throw new Error(`坐标格式非法: ${text}（应为 列A-O + 行1-15，例如 H8）`);
  const col = m[1].toUpperCase().charCodeAt(0) - 65;
  const row = Number(m[2]) - 1;
  if (row < 0 || row >= BOARD_SIZE) throw new Error(`行号越界: ${text}`);
  return { row, col };
}

export function formatCoord(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}
