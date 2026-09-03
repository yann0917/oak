"use client";

import { useEffect, useState } from "react";
import { Card, Tag, Title } from "animal-island-ui";
import { api, OptionItem } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, Chip, PhotoGrid, parseJsonArray } from "@/components/CrudSection";
import { MemberFilter, useMemberFilter } from "@/components/MemberFilter";
import { BILL_DIRECTIONS, BILL_STATUSES, BILL_TYPES, BILL_TYPE_COLOR } from "@/lib/bills";

export default function BillsPage() {
  const { children: kids } = useChildren();
  const { memberId, setMemberId } = useMemberFilter();
  const [records, setRecords] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<OptionItem[]>([]);

  useEffect(() => {
    const q = memberId != null ? `?childId=${memberId}` : "";
    api(`/api/bills${q}`).then(setRecords).catch(() => {});
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

  const byDirection = (d: string) => records.filter((r) => (r.direction || "支出") === d);
  const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.amount || 0), 0);
  const expense = byDirection("支出");
  const income = byDirection("收入");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="yellow-green">
          账单
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
        记录学费、餐费、医疗、购物等各类收支，支持凭证照片
      </p>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card color="app-blue">
          <div className="text-center py-2">
            <p className="text-xs opacity-80">支出合计</p>
            <p className="text-2xl font-black mt-1">{sum(expense).toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {expense.length} 笔</p>
          </div>
        </Card>
        <Card color={income.length > 0 ? "app-green" : "default"}>
          <div className="text-center py-2">
            <p className="text-xs opacity-80">收入合计</p>
            <p className="text-2xl font-black mt-1">{sum(income).toLocaleString()}</p>
            <p className="text-xs opacity-70">元 · {income.length} 笔</p>
          </div>
        </Card>
      </div>
      <CrudSection
        title="收支记录"
        endpoint={memberId != null ? `/api/bills?childId=${memberId}` : "/api/bills"}
        childId={memberId}
        members={kids}
        onDataChange={() =>
          api(memberId != null ? `/api/bills?childId=${memberId}` : "/api/bills")
            .then(setRecords)
            .catch(() => {})
        }
        fields={[
          { name: "title", label: "项目", required: true, placeholder: "如：2026秋季学费 / 交电费" },
          { name: "direction", label: "收支方向", type: "select", options: BILL_DIRECTIONS, defaultValue: "支出" },
          { name: "type", label: "类型", type: "select", options: BILL_TYPES, defaultValue: "学费" },
          { name: "amount", label: "金额（元）", type: "number", required: true },
          { name: "status", label: "状态", type: "select", options: BILL_STATUSES, defaultValue: "已缴" },
          { name: "date", label: "收支日期", type: "date" },
          { name: "semesterId", label: "所属学期", type: "select", refList: "semesters" },
          { name: "organization", label: "收款单位" },
          { name: "notes", label: "备注", type: "textarea" },
          { name: "attachments", label: "凭证照片", type: "photos" },
        ]}
        renderItem={(item, actions) => {
          const isExpense = (item.direction || "支出") === "支出";
          return (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip color={BILL_TYPE_COLOR[item.type] ?? "default"}>{item.type}</Chip>
                <Tag size="small" variant="soft" color={isExpense ? "app-orange" : "app-green"}>
                  {isExpense ? "支出" : "收入"}
                </Tag>
                <span className="font-bold">{item.title}</span>
                <span
                  className="font-black"
                  style={{ color: isExpense ? "var(--animal-error-color)" : "var(--animal-success-color)" }}
                >
                  {isExpense ? "-" : "+"}¥{(item.amount ?? 0).toLocaleString()}
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
                  收款单位：{item.organization}
                </p>
              )}
              {item.notes && (
                <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {item.notes}
                </p>
              )}
              <PhotoGrid photos={parseJsonArray(item.attachments)} />
            </div>
          );
        }}
      />
    </div>
  );
}
