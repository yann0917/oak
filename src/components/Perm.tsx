"use client";

import { ReactNode } from "react";
import { useProfile } from "@/lib/profileContext";

/** 按钮级权限：超管或拥有该权限点（perms）时渲染，否则隐藏 */
export function Perm({ perm, children }: { perm: string; children: ReactNode }) {
  const { isAdmin, perms } = useProfile();
  if (isAdmin || perms.includes(perm)) return <>{children}</>;
  return null;
}
