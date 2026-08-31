"use client";

import { useEffect, useState } from "react";
import { Tabs, Tag, Title } from "animal-island-ui";
import { api, STAGES } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, Chip, OptionItem } from "@/components/CrudSection";
import SemestersSection from "@/components/SemestersSection";
import TeachersSection from "@/components/TeachersSection";

const TAB_KEYS = ["enrollments", "schools", "semesters", "teachers"];

export default function EducationTabs({ initialTab }: { initialTab?: string }) {
  const { currentChild } = useChildren();
  const [schools, setSchools] = useState<OptionItem[]>([]);
  const [tab, setTab] = useState(
    TAB_KEYS.includes(initialTab ?? "") ? (initialTab as string) : "enrollments"
  );

  const loadSchools = () => {
    api<OptionItem[]>("/api/schools").then(setSchools).catch(() => {});
  };

  useEffect(loadSchools, []);

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  return (
    <div>
      <Title size="middle" color="app-blue">
        教育经历
      </Title>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录 {currentChild.name} 的学校、学期、老师与各学习阶段（幼儿园、小学、初中……均可记录）
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
                endpoint={`/api/enrollments?childId=${currentChild.id}`} childId={currentChild.id}
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
            children: <SemestersSection />,
          },
          {
            key: "teachers",
            label: "老师",
            children: <TeachersSection />,
          },
        ]}
      />
    </div>
  );
}
