"use client";

import { Tag, Title } from "animal-island-ui";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, PhotoGrid, parseJsonArray } from "@/components/CrudSection";
import { HEALTH_TYPES } from "@/lib/api";

const TYPE_COLOR: Record<string, string> = {
  体检: "app-blue",
  疫苗: "app-green",
  用药: "app-orange",
  病历: "app-red",
};

export default function HealthPage() {
  const { currentChild } = useChildren();

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「子女管理」中添加孩子
      </p>
    );
  }

  return (
    <div>
      <Title size="middle" color="app-red">
        健康档案
      </Title>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录 {currentChild.name} 的体检、疫苗接种、用药与病历
      </p>
      <CrudSection
        title="健康记录"
        endpoint={`/api/health-records?childId=${currentChild.id}`} childId={currentChild.id}
        fields={[
          { name: "title", label: "标题", required: true, placeholder: "如：入园体检 / 流感疫苗第2针" },
          { name: "type", label: "类型", type: "select", options: HEALTH_TYPES, defaultValue: "体检" },
          { name: "date", label: "日期", type: "date" },
          { name: "detail", label: "详情", type: "textarea", placeholder: "检查结果、疫苗批次、用药说明等" },
          { name: "attachments", label: "附件/照片", type: "photos" },
        ]}
        renderItem={(item, actions) => (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block">
                <Tag size="small" variant="soft" color={(TYPE_COLOR[item.type] ?? "default") as any}>
                  {item.type}
                </Tag>
              </span>
              <span className="font-bold">{item.title}</span>
              <span className="text-xs ml-auto" style={{ color: "var(--animal-text-color-secondary)" }}>
                {item.date}
              </span>
              <ItemActions {...actions} />
            </div>
            {item.detail && (
              <p
                className="text-sm mt-2 whitespace-pre-wrap"
                style={{ color: "var(--animal-text-color-secondary)" }}
              >
                {item.detail}
              </p>
            )}
            <PhotoGrid photos={parseJsonArray(item.attachments)} />
          </div>
        )}
      />
    </div>
  );
}
