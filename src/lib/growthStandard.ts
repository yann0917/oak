// 儿童生长标准测评核心逻辑
// 标准来源：WS/T 423—2022《7 岁以下儿童生长标准》、WS/T 612—2018《7 岁～18岁儿童青少年身高发育等级评价》
import standardData from "@/data/growth_standard_data.json";
import chartSpec from "@/data/chart_spec.json";

export const STANDARD_DATA = standardData;
export const CHART_SPEC = chartSpec;

export const PCT_COLS = ["P3", "P10", "P25", "P50", "P75", "P90", "P97"] as const;
export const SD_COLS = ["-2SD", "-1SD", "+1SD", "+2SD"] as const;

export type PctCol = (typeof PCT_COLS)[number];
export type SdCol = (typeof SD_COLS)[number];

export interface Level {
  lv: string;
  warn: boolean;
}

/** 一天对应的毫秒数之上的月龄换算：天数差 / 30.4375 */
export const MS_PER_MONTH = 86400000 * 30.4375;

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 测量日期与出生日期相差的月龄（天差 / 30.4375） */
export function diffMonths(birth: Date, meas: Date): number {
  return (meas.getTime() - birth.getTime()) / MS_PER_MONTH;
}

export function fmtAge(mo: number): string {
  const y = Math.floor(mo / 12);
  const m = Math.round(mo % 12);
  return y > 0 ? (m > 0 ? `${y} 岁 ${m} 个月` : `${y} 岁`) : `${Math.max(0, m)} 个月`;
}

/** 标准表按 x 值线性插值，超出首末档按边界值取 */
export function interp(
  table: { rows: Record<string, number>[] },
  xkey: string,
  x: number,
  cols: readonly string[]
): Record<string, number> {
  const rows = table.rows;
  const out: Record<string, number> = {};
  if (x <= rows[0][xkey]) {
    cols.forEach((c) => (out[c] = rows[0][c]));
    return out;
  }
  const last = rows[rows.length - 1];
  if (x >= last[xkey]) {
    cols.forEach((c) => (out[c] = last[c]));
    return out;
  }
  let i = 0;
  while (rows[i + 1][xkey] < x) i++;
  const a = rows[i];
  const b = rows[i + 1];
  const t = (x - a[xkey]) / (b[xkey] - a[xkey]);
  cols.forEach((c) => (out[c] = a[c] + (b[c] - a[c]) * t));
  return out;
}

/** WS/T 423 表 1：P3/P25/P75/P97 五级评价 */
export function pctLevel(v: number, cut: Record<string, number>): Level {
  if (v < cut.P3) return { lv: "下等", warn: true };
  if (v < cut.P25) return { lv: "中下等", warn: true };
  if (v < cut.P75) return { lv: "中等", warn: false };
  if (v < cut.P97) return { lv: "中上等", warn: false };
  return { lv: "上等", warn: false };
}

/** WS/T 612：±1SD/±2SD 五级评价 */
export function sdLevel(v: number, cut: Record<string, number>): Level {
  if (v < cut["-2SD"]) return { lv: "下等", warn: true };
  if (v < cut["-1SD"]) return { lv: "中下等", warn: true };
  if (v < cut["+1SD"]) return { lv: "中等", warn: false };
  if (v < cut["+2SD"]) return { lv: "中上等", warn: false };
  return { lv: "上等", warn: false };
}

/** 所处的百分位区间描述，如 "P25 ~ P50" */
export function bandDesc(v: number, all: Record<string, number>): string {
  if (v < all.P3) return "低于 P3";
  if (v >= all.P97) return "≥ P97";
  for (let i = 0; i < PCT_COLS.length - 1; i++) {
    if (v >= all[PCT_COLS[i]] && v < all[PCT_COLS[i + 1]]) return `${PCT_COLS[i]} ~ ${PCT_COLS[i + 1]}`;
  }
  return "";
}

/** 所处的 SD 区间描述，如 "-1SD ~ +1SD" */
export function sdBandDesc(v: number, all: Record<string, number>): string {
  const order = SD_COLS;
  if (v < all["-2SD"]) return "低于 -2SD";
  if (v >= all["+2SD"]) return "≥ +2SD";
  for (let i = 0; i < order.length - 1; i++) {
    if (v >= all[order[i]] && v < all[order[i + 1]]) return `${order[i]} ~ ${order[i + 1]}`;
  }
  return "";
}

export interface PxPos {
  px: number;
  py: number;
  leftPct: number;
  topPct: number;
  vLine: { left: number; top: number; height: number };
  hLine: { top: number; left: number; width: number };
}

/**
 * 数据坐标 → 参考图像素坐标（1600×1200，绘图区见 chart_spec.json）：
 *   px = left + (x−xmin)/(xmax−xmin) × (right−left)
 *   py = top + (1−(y−ymin)/(ymax−ymin)) × (bottom−top)  （y 轴翻转）
 */
export function toPx(chartKey: string, x: number, y: number): PxPos {
  const s = (CHART_SPEC as any).charts[chartKey];
  const p = s.plot_px;
  const px = p.left + ((x - s.x.min) / (s.x.max - s.x.min)) * (p.right - p.left);
  const py = p.top + (1 - (y - s.y.min) / (s.y.max - s.y.min)) * (p.bottom - p.top);
  const W = (CHART_SPEC as any).image_size.width;
  const H = (CHART_SPEC as any).image_size.height;
  return {
    px,
    py,
    leftPct: (px / W) * 100,
    topPct: (py / H) * 100,
    vLine: {
      left: (p.left / W) * 100,
      top: (p.top / H) * 100,
      height: ((p.bottom - p.top) / H) * 100,
    },
    hLine: {
      top: (p.top / H) * 100,
      left: (p.left / W) * 100,
      width: ((p.right - p.left) / W) * 100,
    },
  };
}

/** 参考图静态资源路径（public/growth-charts/） */
export function chartImage(chartKey: string): string {
  return `/growth-charts/${chartKey}.png`;
}
