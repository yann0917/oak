"use client";

import { Tag, Title } from "animal-island-ui";
import { CrudSection, ItemActions, PhotoGrid, parseJsonArray } from "@/components/CrudSection";

const CATEGORIES = ["招生入学", "升学政策", "健康疫苗", "减负规定", "其他"];

const CATEGORY_COLOR: Record<string, string> = {
  招生入学: "app-blue",
  升学政策: "purple",
  健康疫苗: "app-green",
  减负规定: "app-orange",
  其他: "default",
};

export default function PoliciesPage() {
  return (
    <div>
      <Title size="middle" color="brown">
        政策动态
      </Title>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        收集教育局、学校发布的通知与政策，方便随时查阅
      </p>
      <CrudSection
        title="政策记录"
        endpoint="/api/policy-notes"
        pageSize={10}
        fields={[
          { name: "title", label: "标题", required: true, placeholder: "如：2026年幼儿园招生工作通知" },
          { name: "issuer", label: "发布单位", placeholder: "如：XX市教育局" },
          { name: "category", label: "分类", type: "select", options: CATEGORIES, defaultValue: "招生入学" },
          { name: "date", label: "发布日期", type: "date" },
          { name: "link", label: "原文链接", placeholder: "https://..." },
          { name: "content", label: "要点摘录", type: "textarea", placeholder: "政策要点、对自己孩子的影响等" },
          { name: "attachments", label: "附件/截图", type: "photos" },
        ]}
        renderItem={(item, actions) => (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size="small" variant="soft" color={(CATEGORY_COLOR[item.category] ?? "default") as any}>
                {item.category}
              </Tag>
              <span className="font-bold">{item.title}</span>
              <span className="text-xs ml-auto" style={{ color: "var(--animal-text-color-secondary)" }}>
                {[item.issuer, item.date].filter(Boolean).join(" · ")}
              </span>
              <ItemActions {...actions} />
            </div>
            {item.content && (
              <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--animal-text-color-secondary)" }}>
                {item.content}
              </p>
            )}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm mt-2 underline underline-offset-4"
                style={{ color: "var(--animal-primary-color)" }}
              >
                查看原文
              </a>
            )}
            <PhotoGrid photos={parseJsonArray(item.attachments)} />
          </div>
        )}
      />
    </div>
  );
}
