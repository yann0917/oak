"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { api } from "@/lib/api";
import "tldraw/tldraw.css";

// tldraw 体积较大且仅浏览器端可用：按路由懒加载 + 关闭 SSR
const Tldraw = dynamic(() => import("tldraw").then((m) => m.Tldraw), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full text-sm"
      style={{ color: "var(--animal-text-color-secondary)" }}
    >
      白板加载中…
    </div>
  ),
});

export default function WhiteboardPage() {
  const [uid, setUid] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 按账号隔离：白板内容存在浏览器本地，persistenceKey 必须带上用户 id
    api<{ id: number }>("/api/auth/me")
      .then((d) => setUid(d.id))
      .catch(() => {});
  }, []);

  // 全屏状态跟随浏览器的 fullscreenchange（兼容 Esc 退出全屏）
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      // 浏览器不支持或被拒绝时静默忽略
    }
  };

  return (
    <div
      ref={shellRef}
      className="whiteboard-shell h-[calc(100dvh-8rem)] relative rounded-3xl overflow-hidden border-2"
      style={{ borderColor: "var(--animal-border-color-light)" }}
    >
      {/* 全屏/退出全屏按钮（演示时铺满整个浏览器） */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "退出全屏" : "全屏演示"}
        title={isFullscreen ? "退出全屏（Esc）" : "全屏演示"}
        className="absolute top-3 right-3 z-40 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center backdrop-blur transition-all hover:scale-110"
        style={{
          background: isFullscreen ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.75)",
          color: isFullscreen ? "#fff" : "var(--animal-text-color-secondary)",
          boxShadow: "0 4px 12px rgba(61,52,40,0.18)",
        }}
      >
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>

      <div className="absolute inset-0">
        {uid === null ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--animal-text-color-secondary)" }}
          >
            白板加载中…
          </div>
        ) : (
          <Tldraw persistenceKey={`oak-whiteboard-${uid}`} />
        )}
      </div>
    </div>
  );
}
