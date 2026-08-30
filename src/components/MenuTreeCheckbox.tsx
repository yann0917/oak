"use client";

import { useMemo } from "react";
import type { ProfileMenu } from "@/lib/profileContext";

interface MenuTreeCheckboxProps {
  tree: (ProfileMenu & { type: string })[];
  value: number[];
  onChange: (ids: number[]) => void;
}

const TYPE_LABEL: Record<string, string> = {
  dir: "目录",
  menu: "菜单",
  button: "按钮",
};

const TYPE_COLOR: Record<string, string> = {
  dir: "app-orange",
  menu: "app-blue",
  button: "app-green",
};

/** 级联勾选：勾选/取消父节点时同步全部子孙；部分选中时父节点显示半选 */
export function MenuTreeCheckbox({ tree, value, onChange }: MenuTreeCheckboxProps) {
  const idSet = useMemo(() => new Set(value), [value]);
  const set = (ids: number[], on: boolean) => {
    const next = new Set(idSet);
    if (on) ids.forEach((id) => next.add(id));
    else ids.forEach((id) => next.delete(id));
    onChange([...next]);
  };

  const toggle = (node: any) => {
    const descendants = collect(node);
    const all = descendants.every((id) => idSet.has(id));
    set(descendants, !all);
  };

  const render = (nodes: any[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const descendants = collect(node);
      const all = descendants.every((id) => idSet.has(id));
      const some = descendants.some((id) => idSet.has(id));
      return (
        <div key={node.id}>
          <label
            className="flex items-center gap-2 py-1.5 rounded-xl px-2 hover:opacity-80 cursor-pointer select-none"
            style={{ marginLeft: depth * 18 }}
          >
            <input
              type="checkbox"
              className="accent-[var(--animal-primary-color)] w-4 h-4"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some && !all;
              }}
              onChange={() => toggle(node)}
            />
            <span className="text-sm font-medium" style={{ color: "var(--animal-text-color)" }}>
              {node.name}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: "var(--animal-bg-color)", color: "var(--animal-text-color-secondary)" }}
            >
              {TYPE_LABEL[node.type] ?? node.type}
            </span>
            {node.perms && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                style={{ background: "var(--animal-primary-color-bg)", color: "var(--animal-primary-color)" }}
              >
                {node.perms}
              </span>
            )}
          </label>
          {node.children?.length ? render(node.children, depth + 1) : null}
        </div>
      );
    });

  return <div className="max-h-96 overflow-y-auto pr-1">{render(tree, 0)}</div>;
}

function collect(node: any): number[] {
  const ids = [node.id];
  for (const child of node.children ?? []) ids.push(...collect(child));
  return ids;
}
