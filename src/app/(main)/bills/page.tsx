"use client";

import { useEffect, useState } from "react";
import { Button, Card, Tag, Title } from "animal-island-ui";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { api, OptionItem } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, Chip, PhotoGrid, parseJsonArray } from "@/components/CrudSection";
import { MemberFilter, useMemberFilter } from "@/components/MemberFilter";
import {
  BILL_DIRECTIONS,
  BILL_STATUSES,
  BILL_TYPES,
  BILL_TYPE_COLOR,
  BILL_TYPE_HEX,
  BILL_TYPE_HEX_FALLBACK,
} from "@/lib/bills";

type Period = "week" | "month" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
  { key: "all", label: "全部" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 光标所在周期 [start, end]（YYYY-MM-DD，闭区间）；all 返回 null 表示不过滤 */
const periodRange = (period: Period, cursor: Date): { start: string; end: string } | null => {
  if (period === "all") return null;
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  if (period === "week") {
    // 周一为一周开始
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: fmtDate(start), end: fmtDate(end) };
  }
  if (period === "month") return { start: fmtDate(new Date(y, m, 1)), end: fmtDate(new Date(y, m + 1, 0)) };
  return { start: `${y}-01-01`, end: `${y}-12-31` };
};

/** 包含今天的周期起点光标（周一 / 月初 / 年初） */
const todayCursor = (period: Period): Date => {
  const now = new Date();
  if (period === "week") {
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return now;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return now;
};

export default function BillsPage() {
  const { children: kids } = useChildren();
  const { memberId, setMemberId } = useMemberFilter();
  const [records, setRecords] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<OptionItem[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [pieDirection, setPieDirection] = useState("支出");

  useEffect(() => {
    const q = memberId != null ? `?childId=${memberId}` : "";
    api(`/api/bills${q}`).then(setRecords).catch(() => {});
    api<OptionItem[]>(`/api/semesters${q}`).then(setSemesters).catch(() => {});
  }, [memberId]);

  const semesterName = (id: any) =>
    semesters.find((s) => s.id === id)?.name ?? (id ? "（学期已删除）" : "");

  if (kids.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  const range = periodRange(period, cursor);
  const inRange = (date: string) => !!range && date >= range.start && date <= range.end;
  const periodRecords = period === "all" ? records : records.filter((r) => inRange(r.date || ""));

  const shift = (delta: number) =>
    setCursor((c) => {
      if (period === "week") {
        const d = new Date(c);
        d.setDate(d.getDate() + delta * 7);
        return d;
      }
      if (period === "month") return new Date(c.getFullYear(), c.getMonth() + delta, 1);
      return new Date(c.getFullYear() + delta, 0, 1);
    });

  const goToday = () => setCursor(todayCursor(period));

  const selectPeriod = (p: Period) => {
    setPeriod(p);
    // 切换粒度一律回到包含今天的周期，避免从年视图切到月视图落在 1 月这类错位
    setCursor(todayCursor(p));
  };

  const periodLabel = () => {
    if (period === "all") return "全部时间";
    if (period === "year") return `${cursor.getFullYear()}年`;
    if (period === "month") return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
    return `${range!.start} ~ ${range!.end.slice(5)}`;
  };
  const isCurrentPeriod =
    period === "all" || periodRange(period, new Date())?.start === range?.start;

  const byDirection = (d: string) => periodRecords.filter((r) => (r.direction || "支出") === d);
  const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.amount || 0), 0);
  const expense = byDirection("支出");
  const income = byDirection("收入");

  // 饼图数据：当前期间按类型聚合的金额，降序
  const pieRows = byDirection(pieDirection);
  const pieTotal = sum(pieRows);
  const typeSum = new Map<string, number>();
  for (const r of pieRows) {
    const key = r.type || "其他";
    typeSum.set(key, (typeSum.get(key) || 0) + (r.amount || 0));
  }
  const pieData = [...typeSum.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const pieColor = (name: string, i: number) =>
    BILL_TYPE_HEX[name] ?? BILL_TYPE_HEX_FALLBACK[i % BILL_TYPE_HEX_FALLBACK.length];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="yellow-green">
          账单
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录家庭各类收支，支持凭证照片与自定义标签
      </p>

      {/* 期间筛选：粒度 + 前后切换 + 回今天 */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="small"
              type={period === p.key ? "primary" : "text"}
              onClick={() => selectPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {period !== "all" && range && (
          <div className="flex items-center gap-1.5">
            <Button size="small" type="text" onClick={() => shift(-1)}>
              ‹
            </Button>
            <span
              className="text-sm font-bold min-w-[130px] text-center"
              style={{ color: "var(--animal-text-color)" }}
            >
              {periodLabel()}
            </span>
            <Button size="small" type="text" onClick={() => shift(1)}>
              ›
            </Button>
            {!isCurrentPeriod && (
              <Button size="small" onClick={goToday}>
                今天
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card color="app-blue">
          <div className="text-center py-2">
            <p className="text-xs opacity-80">支出合计</p>
            <p className="text-2xl font-black mt-1">{sum(expense).toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {expense.length} 笔</p>
          </div>
        </Card>
        <Card color={income.length > 0 ? "app-green" : "default"}>
          <div className="text-center py-2">
            <p className="text-xs opacity-80">收入合计</p>
            <p className="text-2xl font-black mt-1">{sum(income).toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {income.length} 笔</p>
          </div>
        </Card>
      </div>

      {/* 分类占比环形图 */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <p className="text-sm font-bold">分类占比</p>
          <div className="flex gap-1.5">
            {BILL_DIRECTIONS.map((d) => (
              <Button
                key={d}
                size="small"
                type={pieDirection === d ? "primary" : "text"}
                onClick={() => setPieDirection(d)}
              >
                {d}
              </Button>
            ))}
          </div>
        </div>
        {pieData.length === 0 ? (
          <div
            className="py-10 text-center text-sm"
            style={{ color: "var(--animal-text-color-secondary)" }}
          >
            当前期间暂无{pieDirection}记录
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative w-56 h-56 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={d.name} fill={pieColor(d.name, i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => [`¥${Number(value).toLocaleString()}`, name]}
                    contentStyle={{
                      borderRadius: 16,
                      border: "2px solid var(--animal-border-color-light)",
                      fontFamily: "inherit",
                      color: "var(--animal-text-color)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {pieDirection}合计
                </p>
                <p className="text-xl font-black">{pieTotal.toLocaleString()}</p>
              </div>
            </div>
            <ul className="flex-1 min-w-[180px] space-y-1.5">
              {pieData.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: pieColor(d.name, i) }}
                  />
                  <span>{d.name}</span>
                  <span className="ml-auto font-bold">{d.value.toLocaleString()}</span>
                  <span
                    className="w-12 text-right text-xs"
                    style={{ color: "var(--animal-text-color-secondary)" }}
                  >
                    {((d.value / pieTotal) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <CrudSection
        title="收支记录"
        endpoint={memberId != null ? `/api/bills?childId=${memberId}` : "/api/bills"}
        childId={memberId}
        members={kids}
        filterItem={period === "all" ? undefined : (item) => inRange(item.date || "")}
        onDataChange={() =>
          api(memberId != null ? `/api/bills?childId=${memberId}` : "/api/bills")
            .then(setRecords)
            .catch(() => {})
        }
        fields={[
          { name: "title", label: "项目", required: true, placeholder: "如：2026秋季学费 / 交电费" },
          { name: "direction", label: "收支方向", type: "select", options: BILL_DIRECTIONS, defaultValue: "支出" },
          { name: "type", label: "类型", type: "options", options: BILL_TYPES, optionColors: BILL_TYPE_COLOR, defaultValue: "学费" },
          { name: "amount", label: "金额（元）", type: "number", required: true },
          { name: "status", label: "状态", type: "select", options: BILL_STATUSES, defaultValue: "已缴" },
          { name: "date", label: "收支日期", type: "date", defaultValue: fmtDate(new Date()) },
          { name: "semesterId", label: "所属学期", type: "select", refList: "semesters" },
          { name: "organization", label: "收款单位" },
          { name: "notes", label: "备注", type: "textarea" },
          { name: "tags", label: "标签", type: "tags", placeholder: "自定义，如：报销" },
          { name: "attachments", label: "凭证照片", type: "photos" },
        ]}
        renderItem={(item, actions) => {
          const isExpense = (item.direction || "支出") === "支出";
          return (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip color={BILL_TYPE_COLOR[item.type] ?? "default"}>{item.type}</Chip>
                <Tag size="small" variant="soft" color={isExpense ? "app-orange" : "app-green"}>
                  {isExpense ? "支出" : "收入"}
                </Tag>
                <span className="font-bold">{item.title}</span>
                <span
                  className="font-black"
                  style={{ color: isExpense ? "var(--animal-error-color)" : "var(--animal-success-color)" }}
                >
                  {isExpense ? "-" : "+"}¥{(item.amount ?? 0).toLocaleString()}
                </span>
                <Tag size="small" variant="soft" color={item.status === "已缴" ? "app-green" : "app-red"}>
                  {item.status}
                </Tag>
                <span className="text-xs ml-auto" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {[semesterName(item.semesterId), item.date].filter(Boolean).join(" · ")}
                </span>
                <ItemActions {...actions} />
              </div>
              {item.organization && (
                <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  收款单位：{item.organization}
                </p>
              )}
              {item.notes && (
                <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {item.notes}
                </p>
              )}
              {parseJsonArray(item.tags).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {parseJsonArray(item.tags).map((t: string) => (
                    <Chip key={t} color="default">
                      {t}
                    </Chip>
                  ))}
                </div>
              )}
              <PhotoGrid photos={parseJsonArray(item.attachments)} />
            </div>
          );
        }}
      />
    </div>
  );
}
