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
  const { children: kids } = useChildren();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    api("/api/enrollments")
      .then((list: any[]) => setEnrollments(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api("/api/quick-notes?limit=20")
      .then(setNotes)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {kids.length === 0 ? (
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
        <div className="grid gap-4 md:grid-cols-2">
          {kids.map((kid) => {
            const currentEnrollment = enrollments.find(
              (e) => e.childId === kid.id && !e.endDate
            );
            return (
              <Card key={kid.id} color="app-teal" pattern="app-blue">
                <div className="flex items-center gap-4 py-2">
                  {kid.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kid.photo}
                      alt={kid.name}
                      className="rounded-2xl border-4 shrink-0"
                      style={{
                        height: 80,
                        width: "auto",
                        maxWidth: 120,
                        objectFit: "cover",
                        borderColor: "rgba(255,255,255,0.5)",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black shrink-0 border-4"
                      style={{
                        background: "var(--animal-bg-color)",
                        borderColor: "rgba(255,255,255,0.5)",
                        color: "var(--animal-primary-color-active)",
                      }}
                    >
                      {kid.nickname?.[0] || kid.name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h1 className="text-xl font-black">
                      {kid.name}
                      {kid.nickname && `（${kid.nickname}）`}
                    </h1>
                    <p className="text-sm mt-1 opacity-90">
                      {kid.gender === "male" ? "男孩" : "女孩"}
                      {kid.birthday && ` · 生日 ${kid.birthday} · ${calcAge(kid.birthday)}`}
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
            );
          })}
        </div>
      )}

      <QuickNoteInput childId={null} onSaved={(n) => setNotes((prev) => [n, ...prev])} />

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
