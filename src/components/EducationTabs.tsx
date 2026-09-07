"use client";

import { useEffect, useState } from "react";
import { Tabs, Tag, Title } from "animal-island-ui";
import { api, STAGES } from "@/lib/api";
import { CrudSection, ItemActions, Chip, OptionItem } from "@/components/CrudSection";
import { MemberFilter, useMemberFilter } from "@/components/MemberFilter";
import SemestersSection from "@/components/SemestersSection";
import TeachersSection from "@/components/TeachersSection";

const TAB_KEYS = ["enrollments", "schools", "semesters", "teachers", "records", "activities"];

const EVALUATION_LABEL: Record<string, { text: string; color: string }> = {
  great: { text: "优秀", color: "app-green" },
  good: { text: "良好", color: "app-blue" },
  ok: { text: "一般", color: "app-yellow" },
  poor: { text: "需努力", color: "app-red" },
};

export default function EducationTabs({ initialTab }: { initialTab?: string }) {
  const { children: kids, memberId, setMemberId } = useMemberFilter();
  const [schools, setSchools] = useState<OptionItem[]>([]);
  const [semesters, setSemesters] = useState<OptionItem[]>([]);
  const [tab, setTab] = useState(
    TAB_KEYS.includes(initialTab ?? "") ? (initialTab as string) : "enrollments"
  );

  const loadSchools = () => {
    api<OptionItem[]>("/api/schools").then(setSchools).catch(() => {});
  };

  useEffect(loadSchools, []);

  useEffect(() => {
    const q = memberId != null ? `?childId=${memberId}` : "";
    api<OptionItem[]>(`/api/semesters${q}`).then(setSemesters).catch(() => {});
  }, [memberId]);

  const semesterName = (id: any) =>
    semesters.find((s) => s.id === id)?.name ?? (id ? "（学期已删除）" : "");

  const memberQuery = memberId != null ? `?childId=${memberId}` : "";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="app-blue">
          教育经历
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录学校、学期、老师与各学习阶段
      </p>
      <Tabs
        aria-label="教育经历分区"
        activeKey={tab}
        onChange={(key) => setTab(key)}
        items={[
          {
            key: "enrollments",
            label: "阶段记录",
            children: (
              <CrudSection
                title="入学/阶段记录"
                endpoint={`/api/enrollments${memberQuery}`} childId={memberId} members={kids}
                fields={[
                  { name: "schoolId", label: "学校", type: "select", refList: "schools", required: true },
                  { name: "stage", label: "学习阶段", type: "select", options: STAGES, required: true },
                  { name: "className", label: "班级", placeholder: "如：小一班 / 三年级2班" },
                  { name: "studentNo", label: "学号（该阶段）", placeholder: "如：20260901" },
                  { name: "startDate", label: "入学时间", type: "date" },
                  { name: "endDate", label: "毕业/离校时间", type: "date" },
                  { name: "notes", label: "备注", type: "textarea" },
                ]}
                renderItem={(item, actions) => {
                  const school = schools.find((s) => s.id === item.schoolId);
                  return (
                    <div className="flex items-start gap-3">
                      <div
                        className="w-1.5 self-stretch rounded-full shrink-0"
                        style={{ background: "var(--animal-primary-color)" }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Chip color="app-blue">{item.stage}</Chip>
                          <span className="font-bold">{school?.name ?? "（学校已删除）"}</span>
                          {item.className && (
                            <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                              {item.className}
                            </span>
                          )}
                          {item.studentNo && (
                            <Tag size="small" variant="soft" color="app-yellow">
                              学号 {item.studentNo}
                            </Tag>
                          )}
                          {!item.endDate && <Chip color="app-green">在读</Chip>}
                        </div>
                        <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                          {item.startDate || "?"} ~ {item.endDate || "至今"}
                        </p>
                        {item.notes && (
                          <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <ItemActions {...actions} />
                    </div>
                  );
                }}
              />
            ),
          },
          {
            key: "schools",
            label: "学校",
            children: (
              <div>
                <CrudSection
                  title="学校管理"
                  endpoint="/api/schools"
                  onDataChange={loadSchools}
                  fields={[
                    { name: "name", label: "学校名称", required: true },
                    { name: "type", label: "类型", type: "select", options: STAGES, defaultValue: "幼儿园" },
                    { name: "address", label: "地址" },
                    { name: "website", label: "官网", placeholder: "https://..." },
                    { name: "phone", label: "联系电话" },
                    { name: "intro", label: "学校简介", type: "textarea", placeholder: "办学特色、师资情况等" },
                    { name: "notes", label: "备注", type: "textarea" },
                  ]}
                  renderItem={(item, actions) => (
                    <div className="flex items-start gap-3">
                      <Tag size="small" variant="soft" color="yellow-green">
                        {item.type}
                      </Tag>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                          {[item.address, item.phone].filter(Boolean).join(" · ")}
                        </p>
                        {item.website && (
                          <a
                            href={item.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline underline-offset-4"
                            style={{ color: "var(--animal-primary-color)" }}
                          >
                            官网
                          </a>
                        )}
                        {item.intro && (
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                            {item.intro}
                          </p>
                        )}
                      </div>
                      <ItemActions {...actions} />
                    </div>
                  )}
                />
              </div>
            ),
          },
          {
            key: "semesters",
            label: "学期",
            children: <SemestersSection childId={memberId} members={kids} />,
          },
          {
            key: "teachers",
            label: "老师",
            children: <TeachersSection childId={memberId} members={kids} />,
          },
          {
            key: "records",
            label: "学习记录",
            children: (
              <CrudSection
                title="学习记录"
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
                  title="兴趣班"
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
