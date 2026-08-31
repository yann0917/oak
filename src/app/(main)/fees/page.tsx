"use client";

import { useEffect, useState } from "react";
import { Card, Tag, Title } from "animal-island-ui";
import { api, OptionItem } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, Chip, PhotoGrid, parseJsonArray } from "@/components/CrudSection";

const FEE_TYPES = ["学费", "餐费", "校车费", "兴趣班", "杂费", "其他"];

const TYPE_COLOR: Record<string, string> = {
  学费: "app-blue",
  餐费: "app-orange",
  校车费: "purple",
  兴趣班: "warm-peach-pink",
  杂费: "default",
  其他: "default",
};

export default function FeesPage() {
  const { currentChild } = useChildren();
  const [records, setRecords] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<OptionItem[]>([]);

  useEffect(() => {
    if (currentChild) {
      api(`/api/fee-records?childId=${currentChild.id}`).then(setRecords).catch(() => {});
      api<OptionItem[]>(`/api/semesters?childId=${currentChild.id}`).then(setSemesters).catch(() => {});
    }
  }, [currentChild]);

  const semesterName = (id: any) =>
    semesters.find((s) => s.id === id)?.name ?? (id ? "（学期已删除）" : "");

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  const paid = records.filter((r) => r.status === "已缴").reduce((s, r) => s + (r.amount || 0), 0);
  const unpaid = records.filter((r) => r.status !== "已缴").reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div>
      <Title size="middle" color="yellow-green">
        学费记录
      </Title>
      <p className="text-sm mt-3 mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录 {currentChild.name} 的学费、餐费等各类缴费
      </p>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card color="app-green">
          <div className="text-center py-2">
            <p className="text-xs opacity-80">已缴合计</p>
            <p className="text-2xl font-black mt-1">{paid.toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {records.filter((r) => r.status === "已缴").length} 笔</p>
          </div>
        </Card>
        <Card color={unpaid > 0 ? "app-red" : "default"}>
          <div className="text-center py-2">
            <p className="text-xs opacity-80">未缴合计</p>
            <p className="text-2xl font-black mt-1">{unpaid.toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {records.filter((r) => r.status !== "已缴").length} 笔</p>
          </div>
        </Card>
      </div>
      <CrudSection
        title="缴费记录"
        endpoint={`/api/fee-records?childId=${currentChild.id}`} childId={currentChild.id}
        onDataChange={() => api(`/api/fee-records?childId=${currentChild.id}`).then(setRecords).catch(() => {})}
        fields={[
          { name: "title", label: "项目", required: true, placeholder: "如：2026秋季学费" },
          { name: "type", label: "类型", type: "select", options: FEE_TYPES, defaultValue: "学费" },
          { name: "amount", label: "金额（元）", type: "number", required: true },
          { name: "status", label: "状态", type: "select", options: ["已缴", "未缴"], defaultValue: "已缴" },
          { name: "date", label: "缴费日期", type: "date" },
          { name: "semesterId", label: "所属学期", type: "select", refList: "semesters" },
          { name: "organization", label: "收费单位" },
          { name: "notes", label: "备注", type: "textarea" },
          { name: "attachments", label: "凭证照片", type: "photos" },
        ]}
        renderItem={(item, actions) => (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Chip color={TYPE_COLOR[item.type] ?? "default"}>{item.type}</Chip>
              <span className="font-bold">{item.title}</span>
              <span className="font-black" style={{ color: item.status === "已缴" ? "var(--animal-success-color)" : "var(--animal-error-color)" }}>
                ¥{(item.amount ?? 0).toLocaleString()}
              </span>
              <Tag size="small" variant="soft" color={item.status === "已缴" ? "app-green" : "app-red"}>
                {item.status}
              </Tag>
              <span className="text-xs ml-auto" style={{ color: "var(--animal-text-color-secondary)" }}>
                {[semesterName(item.semesterId), item.date].filter(Boolean).join(" · ")}
              </span>
              <ItemActions {...actions} />
            </div>
            {item.organization && (
              <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                收费单位：{item.organization}
              </p>
            )}
            {item.notes && (
              <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "var(--animal-text-color-secondary)" }}>
                {item.notes}
              </p>
            )}
            <PhotoGrid photos={parseJsonArray(item.attachments)} />
          </div>
        )}
      />
    </div>
  );
}
