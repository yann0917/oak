"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "animal-island-ui";
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
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);

  useEffect(() => {
    // 按账号隔离：白板内容存在浏览器本地，persistenceKey 必须带上用户 id
    api<{ id: number }>("/api/auth/me")
      .then((d) => setUid(d.id))
      .catch(() => {});
  }, []);

  const goBack = () => {
    // 从侧边栏进入时返回上一页；直接输网址访问时回概览
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="h-dvh flex flex-col" style={{ background: "var(--animal-bg-color)" }}>
      <header
        className="flex items-center gap-3 px-4 h-14 shrink-0 border-b"
        style={{
          background: "var(--animal-bg-color)",
          borderColor: "var(--animal-border-color-light)",
        }}
      >
        <Button size="small" onClick={goBack}>
          返回
        </Button>
        <span className="font-bold" style={{ color: "var(--animal-text-color)" }}>
          白板
        </span>
      </header>
      <main className="flex-1 relative">
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
      </main>
    </div>
  );
}
