"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, Title, Button } from "animal-island-ui";
import Link from "next/link";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions } from "@/components/CrudSection";
import { MemberFilter, useMemberFilter, memberName } from "@/components/MemberFilter";

const MEMBER_COLORS = [
  "var(--animal-primary-color)",
  "var(--animal-success-color)",
  "var(--animal-peach-color)",
  "var(--animal-purple-color)",
  "var(--animal-error-color)",
  "var(--animal-warning-color)",
];

export default function GrowthPage() {
  const { children: kids } = useChildren();
  const { memberId, setMemberId } = useMemberFilter();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    const q = memberId != null ? `?childId=${memberId}` : "";
    api(`/api/growth-records${q}`)
      .then(setRecords)
      .catch(() => {});
  }, [memberId]);

  // 当前筛选记录（全部成员模式会保留全部，图表按成员分组绘制）
  const list = useMemo(
    () =>
      records
        .filter((r) => r.height != null || r.weight != null)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [records]
  );

  if (kids.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  // 曲线数据：按成员分组；全部成员时每组一条曲线
  const groupRows = (rows: any[], key: "height" | "weight") =>
    rows
      .filter((r) => r[key] != null)
      .map((r) => ({ childId: r.childId, date: r.date, value: r[key] }));

  const renderChart = (rows: any[], labelKey: "height" | "weight", label: string) => {
    if (labelKey === "height" && list.length < 2) return null;
    const crossYear = rows.length > 0 && new Set(rows.map((r) => r.date.slice(0, 4))).size > 1;
    const data = rows.map((r) => ({
      date: crossYear ? r.date : r.date.slice(5),
      [`${r.childId}-${labelKey}`]: r.value,
    }));
    const ids = [...new Set(rows.map((r) => r.childId))];
    const unit = labelKey === "height" ? "cm" : "kg";
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--animal-border-color-light)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--animal-text-color-secondary)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--animal-text-color-secondary)" }}
              label={{
                value: unit,
                position: "insideTop",
                offset: 10,
                style: { fontSize: 11, fontWeight: 600, fill: "var(--animal-text-color-secondary)" },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 16,
                border: "2px solid var(--animal-border-color-light)",
                fontFamily: "inherit",
                color: "var(--animal-text-color)",
              }}
            />
            <Legend />
            {ids.map((id, i) => (
              <Line
                key={`${id}-${labelKey}`}
                type="monotone"
                dataKey={`${id}-${labelKey}`}
                name={`${memberName(kids, id)} ${label}`}
                stroke={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                strokeWidth={3}
                dot={{ r: 4, fill: MEMBER_COLORS[i % MEMBER_COLORS.length] }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Title size="middle" color="lime-green">
            成长记录
          </Title>
          <div className="flex items-center gap-3">
            <MemberFilter value={memberId} onChange={setMemberId} className="w-44" />
            <Link href="/growth/assessment">
              <Button type="primary" size="small">
                儿童生长标准测评
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
          记录身高体重，观察成长曲线，并对照国标参考图测评发育等级
        </p>
        {list.length > 1 && (
          <Card>
            <p className="text-sm font-bold mb-3">成长曲线</p>
            <div className="space-y-4">
              {renderChart(groupRows(list, "height"), "height", "身高")}
              <div className="h-0.5" style={{ background: "var(--animal-border-color-light)" }} />
              {renderChart(groupRows(list, "weight"), "weight", "体重")}
            </div>
          </Card>
        )}
      </div>

      <CrudSection
        title="身高体重记录"
        endpoint={memberId != null ? `/api/growth-records?childId=${memberId}` : "/api/growth-records"}
        childId={memberId}
        members={kids}
        fields={[
          { name: "date", label: "测量日期", type: "date", required: true },
          { name: "height", label: "身高 (cm)", type: "number" },
          { name: "weight", label: "体重 (kg)", type: "number" },
          { name: "notes", label: "备注", type: "textarea" },
        ]}
        renderItem={(item, actions) => (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm w-24 shrink-0" style={{ color: "var(--animal-text-color-secondary)" }}>
              {item.date}
            </span>
            <span className="font-bold">身高 {item.height != null ? `${item.height} cm` : "—"}</span>
            <span className="font-bold">体重 {item.weight != null ? `${item.weight} kg` : "—"}</span>
            <div className="ml-auto flex items-center gap-2">
              {item.notes && (
                <span
                  className="text-xs truncate max-w-[160px] hidden sm:inline"
                  style={{ color: "var(--animal-text-color-secondary)" }}
                >
                  {item.notes}
                </span>
              )}
              <ItemActions {...actions} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
