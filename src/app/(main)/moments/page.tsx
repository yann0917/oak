"use client";

import { Tag, Title } from "animal-island-ui";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, PhotoGrid, parseJsonArray } from "@/components/CrudSection";

export default function MomentsPage() {
  const { currentChild } = useChildren();

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  return (
    <div>
      <Title size="middle" color="app-pink">
        时光相册
      </Title>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        用照片和文字记录 {currentChild.name} 的难忘瞬间
      </p>
      <CrudSection
        title="时光瞬间"
        endpoint={`/api/moments?childId=${currentChild.id}`} childId={currentChild.id}
        fields={[
          { name: "title", label: "标题", required: true, placeholder: "如：第一天上幼儿园" },
          { name: "date", label: "日期", type: "date" },
          { name: "tags", label: "标签", placeholder: "多个用逗号分隔，如：成长,幼儿园" },
          { name: "description", label: "描述", type: "textarea" },
          { name: "photos", label: "照片", type: "photos" },
        ]}
        renderItem={(item, actions) => {
          const tags = (item.tags || "")
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
          return (
            <div className="group">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{item.title}</span>
                <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {item.date}
                </span>
                <div className="ml-auto">
                  <ItemActions {...actions} />
                </div>
              </div>
              {tags.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {tags.map((t: string) => (
                    <Tag key={t} size="small" variant="soft" color="app-yellow">
                      {t}
                    </Tag>
                  ))}
                </div>
              )}
              {item.description && (
                <p
                  className="text-sm mt-2 whitespace-pre-wrap line-clamp-3 group-hover:line-clamp-none"
                  style={{ color: "var(--animal-text-color-secondary)" }}
                >
                  {item.description}
                </p>
              )}
              <PhotoGrid photos={parseJsonArray(item.photos)} />
            </div>
          );
        }}
      />
    </div>
  );
}
