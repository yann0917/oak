"use client";

import { STAGES } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { Chip, CrudSection, ItemActions } from "@/components/CrudSection";

export default function SemestersSection() {
  const { currentChild } = useChildren();

  if (!currentChild) {
    return (
      <p className="text-center py-10 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  return (
    <div>
      <CrudSection
        title="学期管理"
        endpoint={`/api/semesters?childId=${currentChild.id}`} childId={currentChild.id}
        fields={[
          { name: "name", label: "学期名称", required: true, placeholder: "如：一年级上学期 / 2026 秋季" },
          { name: "year", label: "年份", placeholder: "如：2026" },
          { name: "stage", label: "学习阶段", type: "select", options: STAGES },
          { name: "startDate", label: "开始日期", type: "date" },
          { name: "endDate", label: "结束日期", type: "date" },
          { name: "notes", label: "备注", type: "textarea", placeholder: "可选" },
        ]}
        renderItem={(item, actions) => (
          <div className="flex items-start gap-3">
            <div
              className="w-1.5 self-stretch rounded-full shrink-0"
              style={{ background: "var(--animal-primary-color)" }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{item.name}</span>
                {item.stage && <Chip color="app-blue">{item.stage}</Chip>}
                {item.year && <Chip color="app-teal">{item.year}</Chip>}
                <span
                  className="text-xs ml-auto"
                  style={{ color: "var(--animal-text-color-secondary)" }}
                >
                  {[item.startDate, item.endDate].filter(Boolean).join(" ~ ")}
                </span>
                <ItemActions {...actions} />
              </div>
              {item.notes && (
                <p
                  className="text-sm mt-2 whitespace-pre-wrap"
                  style={{ color: "var(--animal-text-color-secondary)" }}
                >
                  {item.notes}
                </p>
              )}
            </div>
          </div>
        )}
      />
    </div>
  );
}
