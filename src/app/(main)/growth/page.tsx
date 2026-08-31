"use client";

import { useEffect, useState } from "react";
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

export default function GrowthPage() {
  const { currentChild } = useChildren();
  const [records, setRecords] = useState<any[]>([]);

  const load = () => {
    if (currentChild) {
      api(`/api/growth-records?childId=${currentChild.id}`)
        .then(setRecords)
        .catch(() => {});
    }
  };

  useEffect(load, [currentChild]);

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  // X 轴标签：同年显示 MM-DD，跨年显示完整 YYYY-MM-DD
  const list = [...records]
    .filter((r) => r.height != null || r.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const crossYear = list.length > 0 && new Set(list.map((r) => r.date.slice(0, 4))).size > 1;
  const chartData = list.map((r) => ({
    date: crossYear ? r.date : r.date.slice(5),
    height: r.height,
    weight: r.weight,
  }));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Title size="middle" color="lime-green">
            成长记录
          </Title>
          <Link href="/growth/assessment">
            <Button type="primary" size="small">
              儿童生长标准测评
            </Button>
          </Link>
        </div>
        <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
          记录 {currentChild.name} 的身高体重，观察成长曲线，并对照国标参考图测评发育等级
        </p>
        {chartData.length > 1 && (
          <Card>
            <p className="text-sm font-bold mb-3">成长曲线</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--animal-border-color-light)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--animal-text-color-secondary)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--animal-text-color-secondary)" }}
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
                  <Line
                    type="monotone"
                    dataKey="height"
                    name="身高 (cm)"
                    stroke="var(--animal-primary-color)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "var(--animal-primary-color)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="体重 (kg)"
                    stroke="var(--animal-success-color)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "var(--animal-success-color)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      <CrudSection
        title="身高体重记录"
        endpoint={`/api/growth-records?childId=${currentChild.id}`} childId={currentChild.id}
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
