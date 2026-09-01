"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Tabs } from "animal-island-ui";
import { api, calcAge } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import QuickNoteInput from "@/components/QuickNoteInput";
import QuickNoteFeed from "@/components/QuickNoteFeed";
import InsightPanel from "@/components/InsightPanel";

export default function DashboardPage() {
  const { currentChild } = useChildren();
  const [currentEnrollment, setCurrentEnrollment] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    if (!currentChild) return;
    const cid = currentChild.id;
    api(`/api/enrollments?childId=${cid}`)
      .then((list: any[]) => setCurrentEnrollment(list.find((e) => !e.endDate)))
      .catch(() => {});
  }, [currentChild]);

  useEffect(() => {
    api("/api/quick-notes?limit=20")
      .then(setNotes)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {!currentChild ? (
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
      ) : (
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
      )}

      <QuickNoteInput childId={currentChild?.id ?? null} onSaved={(n) => setNotes((prev) => [n, ...prev])} />

      <Tabs
        items={[
          {
            key: "records",
            label: "最近的记录",
            children: (
              <QuickNoteFeed
                notes={notes}
                onUpdated={(n) => setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)))}
                onDeleted={(id) => setNotes((prev) => prev.filter((x) => x.id !== id))}
              />
            ),
          },
          {
            key: "insights",
            label: "家庭洞察",
            children: <InsightPanel />,
          },
        ]}
      />
    </div>
  );
}
