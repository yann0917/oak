"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Tag, Title, Tabs } from "animal-island-ui";
import { api } from "@/lib/api";
import { MemberFilter, useMemberSelect } from "@/components/MemberFilter";
import { Chip, parseJsonArray } from "@/components/CrudSection";
import {
  ACTIVITY_MAP,
  ACTIVITY_PALETTE,
  GARDEN_ACTIVITIES,
  GARDEN_STAGES,
} from "@/lib/garden/registry";
import { GAME_MAP } from "@/lib/games/registry";
import { formatDuration } from "@/lib/garden/types";
import GamesMenu from "@/components/games/GamesMenu";

// 动态颜色一律走 Chip（color 为 any）；静态颜色才用 Tag 字面量
const DIFF_COLOR: Record<string, string> = {
  简单: "app-green",
  中等: "app-yellow",
  困难: "app-orange",
};

interface GardenRecord {
  id: number;
  activity: string;
  difficulty: string;
  total: number;
  correct: number;
  durationSec: number;
  wrongItems: string;
  createdAt: string;
}

interface GardenSetting {
  id: number;
  activity: string;
  difficulty: string;
  config: string;
}

export default function GardenHome({ initialTab }: { initialTab?: string }) {
  const { children: kids, member, memberId, setMemberId } = useMemberSelect();
  const router = useRouter();
  const [records, setRecords] = useState<GardenRecord[]>([]);
  const [settings, setSettings] = useState<GardenSetting[]>([]);
  const [stage, setStage] = useState("全部");
  const [tab, setTab] = useState(initialTab === "records" ? "records" : "cards");

  useEffect(() => {
    if (memberId == null) return;
    const cid = memberId;
    Promise.all([
      api<GardenRecord[]>(`/api/garden-records?childId=${cid}`),
      api<GardenSetting[]>(`/api/garden-settings?childId=${cid}`),
    ])
      .then(([recs, sets]) => {
        setRecords(recs);
        setSettings(sets);
      })
      .catch(() => {});
  }, [memberId]);

  const settingsMap = useMemo(
    () => Object.fromEntries(settings.map((s) => [s.activity, s])),
    [settings]
  );

  const visible = useMemo(
    () =>
      stage === "全部" ? GARDEN_ACTIVITIES : GARDEN_ACTIVITIES.filter((a) => a.stages.includes(stage)),
    [stage]
  );

  const stats = useMemo(() => {
    const totalQ = records.reduce((s, r) => s + r.total, 0);
    const totalC = records.reduce((s, r) => s + r.correct, 0);
    return {
      sessions: records.length,
      accuracy: totalQ ? Math.round((totalC / totalQ) * 100) : 0,
      activities: new Set(records.map((r) => r.activity)).size,
    };
  }, [records]);

  if (kids.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="app-green">
          学习园地
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} allowAll={false} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        和 {member?.name ?? ""} 一起玩中学：翻卡片、闯关卡、背唐诗，练习自动记入学习档案
      </p>
      <Tabs
        aria-label="学习园地分区"
        activeKey={tab}
        onChange={(key) => setTab(key)}
        items={[
          { key: "cards", label: "活动卡片", children: renderCardsTab() },
          { key: "games", label: "益智游戏", children: <GamesMenu /> },
          { key: "records", label: "学习记录", children: renderRecordsTab() },
        ]}
      />
    </div>
  );

  function renderCardsTab() {
    return (
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {["全部", ...GARDEN_STAGES].map((s) => (
            <Tag
              key={s}
              onClick={() => setStage(s)}
              color={stage === s ? "app-green" : "default"}
              variant={stage === s ? "solid" : "soft"}
            >
              {s}
            </Tag>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map((a) => {
            const setting = settingsMap[a.key];
            const count = records.filter((r) => r.activity === a.key).length;
            const difficulty = setting?.difficulty ?? "简单";
            return (
              <Card key={a.key} hoverable onClick={() => router.push(`/garden/${a.key}`)}>
                <div className="flex flex-col items-center text-center gap-2 py-3 px-1">
                  <div
                    className="w-14 h-14 rounded-3xl flex items-center justify-center text-3xl font-black"
                    style={{
                      background: ACTIVITY_PALETTE[a.color] ?? "var(--animal-primary-color)",
                      color: "#fff",
                    }}
                  >
                    {a.glyph}
                  </div>
                  <div className="font-bold" style={{ color: "var(--animal-text-color)" }}>
                    {a.name}
                  </div>
                  <p
                    className="text-xs leading-snug min-h-8"
                    style={{ color: "var(--animal-text-color-secondary)" }}
                  >
                    {a.desc}
                  </p>
                  <div className="flex gap-1.5 flex-wrap justify-center">
                    {a.stages.map((s) => (
                      <Tag key={s} size="small" variant="soft">
                        {s}
                      </Tag>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip color={DIFF_COLOR[difficulty]}>{difficulty}</Chip>
                    <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                      练过 {count} 次
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  function renderRecordsTab() {
    return (
      <div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { value: stats.sessions, label: "练习次数" },
            { value: `${stats.accuracy}%`, label: "总正确率" },
            { value: stats.activities, label: "玩过的活动" },
          ].map((item) => (
            <Card key={item.label}>
              <div className="text-center py-3">
                <div className="text-2xl font-black" style={{ color: "var(--animal-primary-color)" }}>
                  {item.value}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {item.label}
                </div>
              </div>
            </Card>
          ))}
        </div>
        {records.length === 0 ? (
          <Card type="dashed">
            <div
              className="text-center py-10 text-sm"
              style={{ color: "var(--animal-text-color-secondary)" }}
            >
              还没有练习记录，去「活动卡片」里玩一轮吧
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const meta = ACTIVITY_MAP[r.activity] ?? GAME_MAP[r.activity];
              const pct = r.total ? Math.round((r.correct / r.total) * 100) : 0;
              const wrong = parseJsonArray(r.wrongItems) as string[];
              return (
                <Card key={r.id}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {meta && <Chip color={meta.color}>{meta.name}</Chip>}
                    <Chip color={DIFF_COLOR[r.difficulty]}>{r.difficulty}</Chip>
                    <span className="font-bold text-sm">
                      {r.correct}/{r.total} 正确（{pct}%）
                    </span>
                    <span
                      className="text-xs ml-auto"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      {r.createdAt.slice(0, 16).replace("T", " ")} · 用时{" "}
                      {formatDuration(r.durationSec)}
                    </span>
                  </div>
                  {wrong.length > 0 && (
                    <p
                      className="text-xs mt-2"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      答错：{wrong.join("、")}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}
