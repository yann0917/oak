"use client";

import { useState } from "react";
import { Select } from "animal-island-ui";
import { useChildren, type Child } from "@/lib/childContext";
import { calcAge } from "@/lib/api";

/**
 * 页面级成员筛选：value 为 null 表示全部成员；allowAll=false 时强制选择一个成员（用于课程表/测评等单成员页面）。
 */
export function MemberFilter({
  value,
  onChange,
  allowAll = true,
  className,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  allowAll?: boolean;
  className?: string;
}) {
  const { children } = useChildren();
  const options = [
    ...(allowAll ? [{ key: "", label: "全部成员" }] : []),
    ...children.map((c) => ({
      key: String(c.id),
      label: c.birthday ? `${c.name}（${calcAge(c.birthday)}）` : c.name,
    })),
  ];
  return (
    <div className={className}>
      <Select
        value={value == null ? "" : String(value)}
        onChange={(key) => onChange(key === "" ? null : Number(key))}
        options={options}
        aria-label="成员筛选"
      />
    </div>
  );
}

/**
 * 页面内成员筛选状态：memberId 为 null 表示全部成员；allowAll=false 时派生到第一个成员。
 * 选择值在渲染期派生（成员列表加载后自动落到第一个，选择被删除时回退），不写状态。
 */
export function useMemberFilter(allowAll = true) {
  const { children } = useChildren();
  const [pickedId, setPickedId] = useState<number | null>(null);

  // 派生生效值：单成员模式回落第一个成员；选中的成员不存在时回落全部
  const memberId =
    allowAll || children.length === 0
      ? pickedId != null && children.some((c) => c.id === pickedId)
        ? pickedId
        : null
      : pickedId != null && children.some((c) => c.id === pickedId)
        ? pickedId
        : children[0].id ?? null;

  const member = children.find((c) => c.id === memberId) ?? null;
  return { children, member, memberId, setMemberId: setPickedId };
}

/**
 * 单成员场景（游戏/园地）：选择结果写入全局 childContext，
 * 使不使用选择器的下游组件（如游戏组件）也能直接读到当前成员。
 */
export function useMemberSelect() {
  const { children, currentChild, setCurrentChildId } = useChildren();
  const memberId = currentChild?.id ?? null;
  const setMemberId = (id: number | null) => {
    if (id != null) setCurrentChildId(id);
  };
  return { children, member: currentChild, memberId, setMemberId };
}

/** 成员 id → 显示名（优先昵称） */
export function memberName(children: Child[], id: number | null | undefined): string {
  const c = children.find((x) => x.id === id);
  return c ? c.nickname || c.name : "";
}
