"use client";

// 复习统计：近 30 天复习量柱状图 + 未来 30 天到期分布
import { useEffect, useState } from "react";
import { Card, Tag, Title } from "animal-island-ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";

interface StatsData {
  summary: { cards: number; enabled: number; reviews: number; dueToday: number };
  ratingCounts: { again: number; hard: number; good: number; easy: number };
  daily: { day: string; count: number }[];
  dueDist: { day: string; count: number }[];
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    api<StatsData>("/api/stats")
      .then(setData)
      .catch((e) => Notification.error(e.message));
  }, []);

  if (!data) {
    return <div className="text-center py-16 text-sm text-secondary">加载中…</div>;
  }

  const { summary, ratingCounts, daily, dueDist } = data;

  return (
    <div className="space-y-4">
      <Title size="middle" color="app-orange">
        复习统计
      </Title>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="卡片总数" value={summary.cards} />
        <StatCard label="参与复习" value={summary.enabled} />
        <StatCard label="累计复习（近 30 天）" value={summary.reviews} />
        <StatCard label="今日到期" value={summary.dueToday} accent />
      </div>

      <Card className="p-4">
        <div className="text-sm font-bold mb-3">近 30 天复习量</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--animal-border-color-light)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={26} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="count" name="张" fill="var(--animal-primary-color)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-bold mb-3">未来 30 天到期分布</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dueDist} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--animal-border-color-light)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={26} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="count" name="张" fill="var(--animal-warning-color)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-bold mb-2">评分分布（近 30 天）</div>
        <div className="flex flex-wrap gap-2">
          <Tag color="app-red" variant="soft">再学一次 {ratingCounts.again}</Tag>
          <Tag color="app-yellow" variant="soft">困难 {ratingCounts.hard}</Tag>
          <Tag color="app-teal" variant="soft">良好 {ratingCounts.good}</Tag>
          <Tag color="app-green" variant="soft">简单 {ratingCounts.easy}</Tag>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-2xl font-black" style={{ color: accent ? "var(--animal-error-color)" : "var(--animal-text-color)" }}>
        {value}
      </div>
      <div className="text-xs mt-1 text-secondary">{label}</div>
    </Card>
  );
}
