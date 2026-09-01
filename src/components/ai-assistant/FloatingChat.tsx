"use client";

import { useState } from "react";
import { Icon } from "animal-island-ui";
import { useProfile } from "@/lib/profileContext";
import { ChatPanel } from "./ChatPanel";

/** 右下角悬浮 AI 助手入口：圆形按钮，点击开合聊天面板 */
export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const { isAdmin, perms } = useProfile();

  // 无 AI 助手权限点不渲染（服务端仍有权限校验）
  if (!isAdmin && !perms.includes("api:ai-chat:create")) return null;

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
      <button
        type="button"
        aria-label="AI 助手"
        title="AI 助手（查询家庭数据）"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 active:scale-95"
        style={{
          background: "var(--animal-primary-color)",
          color: "#fff",
          boxShadow: "var(--animal-shadow-lg)",
          cursor: open ? "pointer" : "default",
        }}
      >
        <Icon name="icon-chat" size={26} />
      </button>
    </>
  );
}
