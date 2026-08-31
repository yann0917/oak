"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Modal, Select, Tag } from "animal-island-ui";
import type { TagColor } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PhotoGrid } from "@/components/CrudSection";
import { MANUAL_TYPES, QUICK_TYPE_META, type QuickType } from "@/lib/quick/meta";

function parseNote(n: any): any {
  const out = { ...n };
  if (n && typeof n.result === "string") {
    try {
      out.result = JSON.parse(n.result);
    } catch {
      out.result = {};
    }
  }
  if (n && typeof n.photos === "string") {
    try {
      out.photos = JSON.parse(n.photos);
    } catch {
      out.photos = [];
    }
  }
  return out;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 首页「最近的记录」：快记流水 feed + 未归类项的手动归类/删除 */
export default function QuickNoteFeed({
  notes,
  onUpdated,
  onDeleted,
}: {
  notes: any[];
  onUpdated: (note: any) => void;
  onDeleted: (id: number) => void;
}) {
  const { children } = useChildren();
  const [manual, setManual] = useState<any>(null);
  const [manualType, setManualType] = useState<string>("");
  const [manualChildId, setManualChildId] = useState<string>("");
  const [manualSaving, setManualSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const childName = (id: any) => {
    const c = children.find((x) => x.id === id);
    return c ? c.nickname || c.name : "";
  };

  const openManual = (n: any) => {
    setManual(n);
    setManualType("");
    setManualChildId(String(n.childId ?? ""));
  };

  const confirmManual = async () => {
    if (!manualType) {
      Notification.warning("请选择归类类型");
      return;
    }
    const childScoped = QUICK_TYPE_META[manualType as QuickType]?.childScoped;
    if (childScoped && !manualChildId) {
      Notification.warning("该类型需要选择归属成员");
      return;
    }
    setManualSaving(true);
    try {
      const updated = await api(`/api/quick-notes/${manual.id}`, {
        method: "PUT",
        body: JSON.stringify({ type: manualType, childId: manualChildId ? Number(manualChildId) : null }),
      });
      const note = parseNote(updated);
      Notification.success(note.result?.summary || "已归类");
      onUpdated(note);
      setManual(null);
    } catch (err: any) {
      Notification.error(err.message || "归类失败");
    } finally {
      setManualSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/quick-notes/${deleting.id}`, { method: "DELETE" });
      Notification.success("已删除");
      onDeleted(deleting.id);
      setDeleting(null);
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const manualMeta = QUICK_TYPE_META[manualType as QuickType];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black">最近的记录</h2>
        <Tag size="small" variant="soft" color="default">
          原始流水 + 归类结果
        </Tag>
      </div>
      {notes.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-6 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有快记，在上方记第一笔吧
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {notes.map((n0) => {
            const n = parseNote(n0);
            const res = n.result ?? {};
            const entries: any[] = Array.isArray(res.entries) ? res.entries : [];
            const statusLabel =
              n.status === "pending" ? "待归类" : n.status === "failed" ? "识别失败" : entries.length > 1 ? `${entries.length} 条记录` : entries[0]?.label ?? "原始记录";
            const statusColor: TagColor =
              n.status === "failed"
                ? "app-red"
                : n.status === "pending"
                  ? "default"
                  : (QUICK_TYPE_META[entries[0]?.module as QuickType]?.color ?? "default") as TagColor;
            const viewEntries = entries.filter((e) => e.path);
            return (
              <Card key={n.id}>
                <div className="flex items-start gap-3">
                  <Tag size="small" variant="soft" color={statusColor} className="shrink-0">
                    {statusLabel}
                  </Tag>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold break-all">{n.content}</p>
                    {n.status === "processed" && res.summary && (
                      <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                        {res.summary}
                      </p>
                    )}
                    {entries.length > 1 && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                        {entries.map((e, i) => `${i + 1}. ${e.label}`).join(" · ")}
                      </p>
                    )}
                    {Array.isArray(n.photos) && n.photos.length > 0 && <PhotoGrid photos={n.photos} />}
                    <p className="text-[11px] mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                      {fmtTime(n.createdAt)}
                      {childName(n.childId) && ` · ${childName(n.childId)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {n.status === "processed" &&
                      viewEntries.map((e, i) => (
                        <Link
                          key={`${e.path}-${i}`}
                          href={e.path}
                          className="text-xs font-semibold"
                          style={{ color: "var(--animal-primary-color)" }}
                        >
                          查看{e.label}
                        </Link>
                      ))}
                    {(n.status === "pending" || n.status === "failed") && (
                      <>
                        <Button size="small" onClick={() => openManual(n)}>
                          归类
                        </Button>
                        <Button size="small" onClick={() => setDeleting(n)}>
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!manual}
        title="手动归类"
        onClose={() => setManual(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setManual(null)}>取消</Button>
            <Button type="primary" loading={manualSaving} onClick={confirmManual}>
              归类
            </Button>
          </>
        }
      >
        {manual && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                归类类型
              </label>
              <Select
                value={manualType}
                placeholder="请选择"
                options={MANUAL_TYPES.map((t) => ({ key: t, label: QUICK_TYPE_META[t].label }))}
                onChange={(key) => setManualType(key)}
              />
            </div>
            {manualMeta?.childScoped && (
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  归属成员
                </label>
                <Select
                  value={manualChildId}
                  placeholder="请选择"
                  options={children.map((c) => ({ key: String(c.id), label: c.nickname || c.name }))}
                  onChange={(key) => setManualChildId(key)}
                />
              </div>
            )}
            <p className="text-xs bg-gray-100 rounded-xl px-3 py-2" style={{ color: "var(--animal-text-color-secondary)" }}>
              {manual.content}
            </p>
            {manualMeta?.childScoped && children.length === 0 && (
              <p className="text-xs" style={{ color: "var(--animal-error-color)" }}>
                暂无成员，请先到「成员管理」添加
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="删除确认"
        content="确定删除这条快记吗？已归类写入的目标记录需要到对应模块删除。"
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
