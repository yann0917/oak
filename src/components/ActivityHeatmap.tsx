"use client";

// 首页记录热力图：近一年各模块每日记录条数（GitHub 贡献格风格），激励持续记录
import { useEffect, useMemo, useState } from "react";
import { Card } from "animal-island-ui";
import { api } from "@/lib/api";

/** 每日条数 → 色阶（0 / 1-2 / 3-5 / 6-9 / 10+） */
function levelOf(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const CELL_OPACITY = [0, 0.2, 0.45, 0.7, 1];

function beijingDay(d: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d);
}

export default function ActivityHeatmap() {
  const [days, setDays] = useState<Record<string, number> | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api<{ days: Record<string, number>; total: number }>("/api/stats/heatmap")
      .then((res) => {
        setDays(res.days);
        setTotal(res.total);
      })
      .catch(() => {});
  }, []);

  // 53 周格子（周一为首列首行），最后一周不足 7 天的留空
  const weeks = useMemo(() => {
    if (!days) return [];
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const start = new Date(monday);
    start.setDate(start.getDate() - 52 * 7);
    const cells: { date: string; count: number; future: boolean }[] = [];
    for (let d = new Date(start); d <= monday; d.setDate(d.getDate() + 1)) {
      const key = beijingDay(d);
      cells.push({ date: key, count: days[key] ?? 0, future: d > now });
    }
    const cols: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [days]);

  // 连续记录天数：从今天（或昨天）往前数有记录的天数
  const streak = useMemo(() => {
    if (!days) return 0;
    let n = 0;
    const d = new Date();
    if (!days[beijingDay(d)]) d.setDate(d.getDate() - 1);
    while (days[beijingDay(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [days]);

  if (!days) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <div className="text-sm font-bold">记录热力图</div>
        <div className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
          近一年 {total} 条记录 · 连续 {streak} 天
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max">
          {weeks.flat().map((cell) => {
            const level = levelOf(cell.count);
            return (
              <div
                key={cell.date}
                title={`${cell.date} · ${cell.count ? `${cell.count} 条记录` : "无记录"}`}
                className="w-[11px] h-[11px] rounded-[3px]"
                style={
                  cell.future
                    ? { background: "transparent" }
                    : level === 0
                      ? { background: "var(--animal-border-color-light)" }
                      : { background: "var(--animal-primary-color)", opacity: CELL_OPACITY[level] }
                }
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
        少
        {[0, 1, 2, 3, 4].map((l) => (
          <div
            key={l}
            className="w-[10px] h-[10px] rounded-[2px]"
            style={
              l === 0
                ? { background: "var(--animal-border-color-light)" }
                : { background: "var(--animal-primary-color)", opacity: CELL_OPACITY[l] }
            }
          />
        ))}
        多
      </div>
    </Card>
  );
}
