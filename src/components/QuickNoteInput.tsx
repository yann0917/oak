"use client";

import Link from "next/link";
import { ChangeEvent, useRef, useState } from "react";
import { Button, Card, Modal } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api, uploadFiles } from "@/lib/api";

const MAX_PHOTOS = 6;

/** 已添加照片：id 保证同一链接可重复添加且能单张删除 */
interface PhotoItem {
  id: number;
  url: string;
}

/** 从正文提取图片链接（路径以常见图片扩展名结尾，忽略 query），提交时自动作为照片保存 */
function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s\u3000，。！？；：、"”'（）【】\[\]<>]+/gi)) {
    if (/\.(jpe?g|png|gif|webp)$/i.test(m[0].split(/[?#]/)[0])) urls.push(m[0]);
  }
  return urls;
}

/** 首页一句话快记入口：可附照片，提交后由服务端落原始流水 + AI 识图归类（可选） */
export default function QuickNoteInput({
  childId,
  onSaved,
}: {
  childId?: number | null;
  onSaved: (note: any) => void;
}) {
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const snapshotRef = useRef<PhotoItem[]>([]);

  const openPicker = () => {
    snapshotRef.current = photos;
    setPickerOpen(true);
  };

  /** apply=false（取消/X/遮罩）时还原打开时的照片列表 */
  const closePicker = (apply: boolean) => {
    if (!apply) setPhotos(snapshotRef.current);
    setLinkInput("");
    setPickerOpen(false);
  };

  const removePhoto = (id: number) => setPhotos((prev) => prev.filter((x) => x.id !== id));

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      Notification.warning("链接需以 http(s):// 开头");
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      Notification.warning(`最多 ${MAX_PHOTOS} 张照片`);
      return;
    }
    if (photos.some((p) => p.url === url)) {
      Notification.warning("该链接已添加过了");
      return;
    }
    setPhotos((prev) => [...prev, { id: ++idRef.current, url }]);
    setLinkInput("");
  };

  // 弹窗内待确认的链接列表（外链；本地照片在页面预览区看）
  const linkLinks = photos.filter((p) => /^https?:\/\//i.test(p.url));

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
      setPhotos((prev) => [...prev, ...paths.map((url) => ({ id: ++idRef.current, url }))]);
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
    // 正文里直接粘贴的图片链接、链接框里输入未点添加的，都自动带上（下载保存+识图）
    const autoPhotos = extractImageUrls(text);
    const pendingLink = linkInput.trim();
    if (pendingLink && /^https?:\/\//i.test(pendingLink)) autoPhotos.push(pendingLink);
    // 去重：同一链接只保留一张（正文重复引用也归一）
    const allPhotos = [...new Set([...photos.map((p) => p.url), ...autoPhotos])];
    if (autoPhotos.length > 0 && photos.length + autoPhotos.length > MAX_PHOTOS) {
      Notification.warning(`最多 ${MAX_PHOTOS} 张照片`);
      return;
    }
    setSubmitting(true);
    try {
      const note = await api("/api/quick-notes", {
        method: "POST",
        body: JSON.stringify({ content: text, childId: childId ?? null, photos: allPhotos }),
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
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="快记照片" className="h-16 w-16 rounded-xl border-2 object-cover" style={{ borderColor: "var(--animal-border-color-light)" }} />
              <button
                type="button"
                aria-label="移除照片"
                onClick={() => removePhoto(p.id)}
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
          <Button loading={uploading} onClick={openPicker} className="shrink-0">
            添加图片
          </Button>
          <Button type="primary" loading={submitting} onClick={submit} className="shrink-0">
            记一笔
          </Button>
        </div>
      </div>
      <Modal
        open={pickerOpen}
        title="添加图片"
        onClose={() => closePicker(false)}
        typewriter={false}
        width={440}
        footer={
          <>
            <Button onClick={() => closePicker(false)}>取消</Button>
            <Button type="primary" onClick={() => closePicker(true)}>
              确定
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
              上传本地图片
            </p>
            <Button loading={uploading} onClick={() => fileRef.current?.click()} className="w-full">
              选择照片文件（jpg / png / gif / webp）
            </Button>
          </div>
          <div className="text-center text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
            或
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
              粘贴图片链接（可加多张）
            </p>
            <div className="flex items-center gap-2">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://…"
                className="flex-1 min-w-0 px-3 py-1.5 text-sm"
                style={{
                  border: "2px solid var(--animal-border-color-light)",
                  borderRadius: 12,
                  background: "#fff",
                  color: "var(--animal-text-color)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                aria-label="添加链接"
                onClick={addLink}
                className="w-7 h-7 shrink-0 rounded-full border-0 text-white text-lg leading-7 text-center cursor-pointer"
                style={{ background: "var(--animal-primary-color)" }}
              >
                +
              </button>
            </div>
            {linkLinks.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {linkLinks.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="图片链接" className="h-16 w-16 rounded-xl border-2 object-cover" style={{ borderColor: "var(--animal-border-color-light)" }} />
                    <button
                      type="button"
                      aria-label="移除链接"
                      onClick={() => removePhoto(p.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-sm leading-5 text-center border-0 cursor-pointer"
                      style={{ background: "var(--animal-error-color)" }}
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
              也可以直接把图片链接贴在正文里
            </p>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
