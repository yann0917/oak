"use client";

import Link from "next/link";
import { ChangeEvent, useRef, useState } from "react";
import { Button, Card } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api, uploadFiles } from "@/lib/api";

const MAX_PHOTOS = 3;

/** 首页一句话快记入口：可附照片，提交后由服务端落原始流水 + AI 识图归类（可选） */
export default function QuickNoteInput({
  childId,
  onSaved,
}: {
  childId?: number | null;
  onSaved: (note: any) => void;
}) {
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许再次选择同一文件
    if (!files.length) return;
    const remain = MAX_PHOTOS - photos.length;
    if (remain <= 0) {
      Notification.warning(`最多 ${MAX_PHOTOS} 张照片`);
      return;
    }
    if (files.length > remain) {
      Notification.warning(`最多 ${MAX_PHOTOS} 张照片，已取前 ${remain} 张`);
    }
    setUploading(true);
    try {
      const paths = await uploadFiles(files.slice(0, remain));
      setPhotos((prev) => [...prev, ...paths]);
    } catch (err: any) {
      Notification.error(err.message || "照片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const text = content.trim();
    if (!text) {
      Notification.warning("写点什么再记吧");
      return;
    }
    setSubmitting(true);
    try {
      const note = await api("/api/quick-notes", {
        method: "POST",
        body: JSON.stringify({ content: text, childId: childId ?? null, photos }),
      });
      if (note.status === "processed") Notification.success(note.result?.summary || "已自动归类");
      else if (note.status === "failed") Notification.warning("AI 识别失败，已保存为原始记录");
      else Notification.info("已保存为原始记录（未配置 AI 自动归类）");
      setContent("");
      setPhotos([]);
      onSaved(note);
    } catch (err: any) {
      Notification.error(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black">一句话快记</h2>
        <Link
          href="/settings"
          className="text-xs font-semibold"
          style={{ color: "var(--animal-primary-color)" }}
        >
          AI 设置
        </Link>
      </div>
      <textarea
        className="w-full px-4 py-3 text-sm"
        rows={3}
        placeholder="随手记一句，可附照片让 AI 识图归类：如「这张是今天打的疫苗单」"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          border: "2px solid var(--animal-border-color-light)",
          borderRadius: 24,
          background: "#fff",
          color: "var(--animal-text-color)",
          outline: "none",
          fontFamily: "inherit",
          fontWeight: 500,
        }}
      />
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {photos.map((p) => (
            <div key={p} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="快记照片" className="h-16 w-16 rounded-xl border-2 object-cover" style={{ borderColor: "var(--animal-border-color-light)" }} />
              <button
                type="button"
                aria-label="移除照片"
                onClick={() => setPhotos((prev) => prev.filter((x) => x !== p))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-xs leading-5 text-center border-0 cursor-pointer"
                style={{ background: "var(--animal-error-color)" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
            支持：健康 / 账单 / 成长 / 时光 / 学习 / 提醒 / 待办 / 政策 · Enter 提交，Shift+Enter 换行
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={pickPhotos}
          />
          <Button loading={uploading} onClick={() => fileRef.current?.click()} className="shrink-0">
            上传照片
          </Button>
          <Button type="primary" loading={submitting} onClick={submit} className="shrink-0">
            记一笔
          </Button>
        </div>
      </div>
    </Card>
  );
}
