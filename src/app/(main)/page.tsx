"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Icon, Image, Tag, Title } from "animal-island-ui";
import type { IconName } from "animal-island-ui";
import { api, calcAge } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { parseJsonArray } from "@/components/CrudSection";

export default function DashboardPage() {
  const { currentChild } = useChildren();
  const [stats, setStats] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!currentChild) return;
    const cid = currentChild.id;
    Promise.all([
      api(`/api/enrollments?childId=${cid}`),
      api(`/api/learning-records?childId=${cid}`),
      api(`/api/health-records?childId=${cid}`),
      api(`/api/activities?childId=${cid}`),
      api(`/api/moments?childId=${cid}`),
      api(`/api/growth-records?childId=${cid}`),
      api(`/api/fee-records?childId=${cid}`),
      api(`/api/policy-notes`),
      api(`/api/timetable-slots?childId=${cid}`),
      api(`/api/garden-records?childId=${cid}`),
    ])
      .then(([enrollments, learning, health, activities, moments, growth, fees, policies, timetable, garden]) => {
        setStats({ enrollments, learning, health, activities, moments, growth, fees, policies, timetable, garden });
      })
      .catch(() => {});
  }, [currentChild]);

  if (!currentChild) {
    return (
      <Card type="dashed">
        <div className="text-center py-14">
          <p className="mb-5" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有添加成员档案，先去创建一个吧
          </p>
          <Link href="/children">
            <Button type="primary" size="large">
              去添加成员
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const latestGrowth = [...(stats.growth ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  )[0];
  const currentEnrollment = (stats.enrollments ?? []).find((e) => !e.endDate);
  const recentMoments = (stats.moments ?? []).slice(0, 3);

  const cards: { href: string; label: string; icon: IconName; value: number }[] = [
    { href: "/education", label: "学校/阶段", value: (stats.enrollments ?? []).length, icon: "icon-critterpedia" },
    { href: "/timetable", label: "课程表", value: (stats.timetable ?? []).length, icon: "icon-design" },
    { href: "/learning", label: "学习记录", value: (stats.learning ?? []).length, icon: "icon-diy" },
    { href: "/garden", label: "学习园地", value: (stats.garden ?? []).length, icon: "icon-miles" },
    { href: "/health", label: "健康档案", value: (stats.health ?? []).length, icon: "icon-variant" },
    { href: "/learning?tab=activities", label: "兴趣班", value: (stats.activities ?? []).length, icon: "icon-shopping" },
    { href: "/moments", label: "时光瞬间", value: (stats.moments ?? []).length, icon: "icon-camera" },
    { href: "/fees", label: "学费记录", value: (stats.fees ?? []).length, icon: "icon-shopping" },
    { href: "/policies", label: "政策动态", value: (stats.policies ?? []).length, icon: "icon-chat" },
  ];

  return (
    <div className="space-y-6">
            {/* 成员档案卡 */}
      <Card color="app-teal" pattern="app-blue">
        <div className="flex items-center gap-5 py-2">
          {currentChild.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentChild.photo}
              alt={currentChild.name}
              className="rounded-2xl border-4 shrink-0"
              style={{
                height: 96,
                width: "auto",
                maxWidth: 140,
                objectFit: "cover",
                borderColor: "rgba(255,255,255,0.5)",
                background: "#fff",
              }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black shrink-0 border-4"
              style={{
                background: "var(--animal-bg-color)",
                borderColor: "rgba(255,255,255,0.5)",
                color: "var(--animal-primary-color-active)",
              }}
            >
              {currentChild.nickname?.[0] || currentChild.name[0]}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black">
              {currentChild.name}
              {currentChild.nickname && `（${currentChild.nickname}）`}
            </h1>
            <p className="text-sm mt-1 opacity-90">
              {currentChild.gender === "male" ? "男孩" : "女孩"}
              {currentChild.birthday &&
                ` · 生日 ${currentChild.birthday} · ${calcAge(currentChild.birthday)}`}
            </p>
            {currentEnrollment && (
              <p className="text-sm mt-0.5 opacity-90">
                现就读：{currentEnrollment.stage}
                {currentEnrollment.className && ` · ${currentEnrollment.className}`}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 最新成长数据 */}
      {latestGrowth && (
        <div className="grid grid-cols-2 gap-3">
          <Card color="app-blue">
            <div className="text-center py-2">
              <p className="text-xs opacity-80">最新身高</p>
              <p className="text-2xl font-black mt-1">{latestGrowth.height ?? "—"}</p>
              <p className="text-xs opacity-70">cm · {latestGrowth.date}</p>
            </div>
          </Card>
          <Card color="app-green">
            <div className="text-center py-2">
              <p className="text-xs opacity-80">最新体重</p>
              <p className="text-2xl font-black mt-1">{latestGrowth.weight ?? "—"}</p>
              <p className="text-xs opacity-70">kg · {latestGrowth.date}</p>
            </div>
          </Card>
        </div>
      )}

      {/* 模块入口 */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card hoverable className="text-center">
              <div className="py-2">
                <Icon name={c.icon} size={26} bounce />
                <div className="text-lg font-black mt-1">{c.value}</div>
                <div className="text-[10px] sm:text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {c.label}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* 学习资源 */}
      <div>
        <Title size="small" color="app-teal">
          学习资源
        </Title>
        <a
          href="https://basic.smartedu.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block"
        >
          <Card hoverable>
            <div className="flex items-center gap-3 py-1">
              <Icon name="icon-map" size={26} bounce />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">国家中小学智慧教育平台</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  教育部官方平台，免费课程、教材与家庭教育资源
                </p>
              </div>
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--animal-primary-color)" }}>
                前往学习
              </span>
            </div>
          </Card>
        </a>
      </div>

      {/* 最近时光 */}
      {recentMoments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <Title size="small" color="app-yellow">
              最近的时光
            </Title>
            <Link
              href="/moments"
              className="text-sm font-semibold"
              style={{ color: "var(--animal-primary-color)" }}
            >
              查看全部
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentMoments.map((m) => {
              const photos = parseJsonArray(m.photos);
              return (
                <Card key={m.id} hoverable>
                  <Link href="/moments">
                    {photos[0] && <Image src={photos[0]} alt={m.title} width="100%" height={140} lazy />}
                    <div className="pt-2">
                      <p className="font-bold text-sm">{m.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        {m.date}
                      </p>
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
