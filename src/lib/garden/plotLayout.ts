// 花园地块布局：格号 ↔ 3D 坐标（纯函数）
export const PLOT_COLS = 6;
export const PLOT_ROWS = 6;
export const PLOT_CAPACITY = PLOT_COLS * PLOT_ROWS;
/** 每格边长（米） */
export const TILE = 1.2;

/** 格号 → 以地块中心为原点的平面坐标 */
export function slotToPosition(slot: number): { x: number; z: number } {
  const col = slot % PLOT_COLS;
  const row = Math.floor(slot / PLOT_COLS);
  return {
    x: (col - (PLOT_COLS - 1) / 2) * TILE,
    z: (row - (PLOT_ROWS - 1) / 2) * TILE,
  };
}

/** 平面坐标 → 最近的格号；超出地块范围返回 null */
export function positionToSlot(x: number, z: number): number | null {
  const col = Math.round(x / TILE + (PLOT_COLS - 1) / 2);
  const row = Math.round(z / TILE + (PLOT_ROWS - 1) / 2);
  if (col < 0 || col >= PLOT_COLS || row < 0 || row >= PLOT_ROWS) return null;
  return row * PLOT_COLS + col;
}

/** 取最小的空格号；已满返回 null */
export function nextFreeSlot(taken: number[]): number | null {
  const used = new Set(taken);
  for (let i = 0; i < PLOT_CAPACITY; i++) if (!used.has(i)) return i;
  return null;
}
