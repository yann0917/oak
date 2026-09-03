"use client";

import { useEffect, useState } from "react";
import { Tabs, Title } from "animal-island-ui";
import { api, OptionItem } from "@/lib/api";
import { CrudSection, ItemActions, Chip } from "@/components/CrudSection";
import { MemberFilter, useMemberFilter } from "@/components/MemberFilter";

const EVALUATION_LABEL: Record<string, { text: string; color: string }> = {
  great: { text: "优秀", color: "app-green" },
  good: { text: "良好", color: "app-blue" },
  ok: { text: "一般", color: "app-yellow" },
  poor: { text: "需努力", color: "app-red" },
};

export default function LearningTabs({ initialTab }: { initialTab?: string }) {
  const { children: kids, memberId, setMemberId } = useMemberFilter();
  const [semesters, setSemesters] = useState<OptionItem[]>([]);
  const [tab, setTab] = useState(initialTab === "activities" ? "activities" : "records");

  useEffect(() => {
    const q = memberId != null ? `?childId=${memberId}` : "";
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

  const memberQuery = memberId != null ? `?childId=${memberId}` : "";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="purple">
          学习情况
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录学习表现、成绩与兴趣班
      </p>
      <Tabs
        aria-label="学习情况分区"
        activeKey={tab}
        onChange={(key) => setTab(key)}
        items={[
          {
            key: "records",
            label: "学习记录",
            children: (
              <CrudSection
                title=""
                endpoint={`/api/learning-records${memberQuery}`} childId={memberId} members={kids}
                fields={[
                  { name: "date", label: "日期", type: "date" },
                  { name: "semesterId", label: "学期", type: "select", refList: "semesters" },
                  { name: "subject", label: "科目/内容", placeholder: "如：语文、数学、绘画" },
                  { name: "grade", label: "成绩/评级", placeholder: "如：95分、A" },
                  {
                    name: "evaluation",
                    label: "表现评价",
                    type: "select",
                    options: ["great", "good", "ok", "poor"],
                    optionLabels: { great: "优秀", good: "良好", ok: "一般", poor: "需努力" },
                  },
                  { name: "content", label: "详细记录", type: "textarea", placeholder: "老师评语、掌握情况等" },
                ]}
                renderItem={(item, actions) => {
                  const ev = EVALUATION_LABEL[item.evaluation];
                  const sem = semesterName(item.semesterId);
                  return (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.subject && <Chip color="purple">{item.subject}</Chip>}
                        {ev && <Chip color={ev.color}>{ev.text}</Chip>}
                        <span className="font-bold">{item.grade || sem || item.date}</span>
                        <span
                          className="text-xs ml-auto"
                          style={{ color: "var(--animal-text-color-secondary)" }}
                        >
                          {[sem, item.date].filter(Boolean).join(" · ")}
                        </span>
                        <ItemActions {...actions} />
                      </div>
                      {item.content && (
                        <p
                          className="text-sm mt-2 whitespace-pre-wrap"
                          style={{ color: "var(--animal-text-color-secondary)" }}
                        >
                          {item.content}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            ),
          },
          {
            key: "activities",
            label: "兴趣班",
            children: (
              <div>
                <CrudSection
                  title=""
                  endpoint={`/api/activities${memberQuery}`} childId={memberId} members={kids}
                  fields={[
                    { name: "name", label: "名称", required: true, placeholder: "如：少儿美术 / 钢琴一对一" },
                    { name: "category", label: "类别", placeholder: "如：美术、音乐、体育、编程" },
                    { name: "organization", label: "机构/地点" },
                    { name: "teacherName", label: "授课老师" },
                    { name: "startDate", label: "开始时间", type: "date" },
                    { name: "endDate", label: "结束时间", type: "date" },
                    { name: "status", label: "状态", type: "select", options: ["在读", "已结课"], defaultValue: "在读" },
                    { name: "progress", label: "进度/成果", type: "textarea", placeholder: "学习进度、考级、作品等" },
                  ]}
                  renderItem={(item, actions) => (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{item.name}</span>
                        {item.category && <Chip color="warm-peach-pink">{item.category}</Chip>}
                        <Chip color={item.status === "在读" ? "app-green" : "default"}>{item.status}</Chip>
                        <div className="ml-auto">
                          <ItemActions {...actions} />
                        </div>
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                        {[item.organization, item.teacherName && `老师：${item.teacherName}`, item.startDate && `${item.startDate} 起`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.progress && (
                        <p
                          className="text-sm mt-2 whitespace-pre-wrap"
                          style={{ color: "var(--animal-text-color-secondary)" }}
                        >
                          {item.progress}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
