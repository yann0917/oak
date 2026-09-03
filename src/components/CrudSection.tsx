"use client";

import { ReactNode, useEffect, useState } from "react";
import { Button, Card, DatePicker, Image, Input, Modal, Pagination, Select, Tag } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api, OptionItem } from "@/lib/api";
import { PhotoUploader } from "./PhotoUploader";
import { PhotoLightbox } from "./PhotoLightbox";
import { ConfirmDialog } from "./ConfirmDialog";
import { memberName } from "./MemberFilter";
import type { Child } from "@/lib/childContext";

export type { OptionItem } from "@/lib/api";

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "date" | "select" | "photos" | "avatar";
  options?: string[];
  /** select 选项的显示文案映射（key 为字段值） */
  optionLabels?: Record<string, string>;
  /** 从外部数据源取选项（如学校列表） */
  refList?: "schools" | "teachers" | "semesters";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  full?: boolean; // 占整行
}

export function CrudSection({
  title,
  endpoint,
  fields,
  renderItem,
  onDataChange,
  childId,
  members,
  filterItem,
  pageSize,
}: {
  title: string;
  endpoint: string;
  fields: FieldDef[];
  renderItem: (item: any, actions: { edit: () => void; remove: () => void }) => ReactNode;
  /** 列表发生增删改后回调（用于联动刷新页面其他区域） */
  onDataChange?: () => void;
  /** 孩子维度的表：新建时自动附带 childId；传 null 且提供 members 时，表单出现成员选择字段 */
  childId?: number | null;
  /** 成员列表：用于在每条记录上展示关联成员标签 */
  members?: Child[];
  /** 客户端过滤（接口不支持 childId 筛选时用，如卡证档案） */
  filterItem?: (item: any) => boolean;
  /** 传入即开启分页，每次只加载一页数据 */
  pageSize?: number;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [refLists, setRefLists] = useState<Record<string, OptionItem[]>>({});
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // 分页状态（pageSize 未传时固定为 1，一次加载全部）
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // 全部成员模式：不固定 childId，新建/编辑时需在表单中选择成员
  const allMembersMode = childId == null && !!members?.length;

  const load = async (targetPage = page) => {
    if (pageSize) {
      // endpoint 可能已带查询串（如 ?childId=1），分页参数用 & 拼接
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await api<{ total: number; list: any[] }>(
        `${endpoint}${sep}page=${targetPage}&pageSize=${pageSize}`
      );
      setItems(res.list);
      setTotal(res.total);
    } else {
      setItems(await api<any[]>(endpoint));
    }
  };
  useEffect(() => {
    load().catch(() => {});
  }, [endpoint, page, pageSize]);

  const loadRefs = async () => {
    const needSchools = fields.some((f) => f.refList === "schools");
    const needTeachers = fields.some((f) => f.refList === "teachers");
    const needSemesters = fields.some((f) => f.refList === "semesters");
    const lists: Record<string, OptionItem[]> = {};
    if (needSchools) lists.schools = await api("/api/schools");
    if (needTeachers) lists.teachers = await api("/api/teachers");
    if (needSemesters) {
      lists.semesters = await api(
        childId != null ? `/api/semesters?childId=${childId}` : "/api/semesters"
      );
    }
    setRefLists(lists);
  };
  useEffect(() => {
    loadRefs().catch(() => {});
  }, [endpoint]);

  const openCreate = () => {
    const init: Record<string, any> = {};
    for (const f of fields) {
      init[f.name] = f.type === "photos" ? [] : f.defaultValue ?? "";
    }
    if (allMembersMode) init.childId = "";
    setForm(init);
    setEditing(null);
    setError("");
    setShowForm(true);
    loadRefs().catch(() => {});
  };
  const openEdit = (item: any) => {
    const init: Record<string, any> = {};
    for (const f of fields) {
      const raw = item[f.name];
      if (f.type === "photos") {
        let arr = raw;
        if (typeof raw === "string") {
          try {
            arr = JSON.parse(raw || "[]");
          } catch {
            arr = [];
          }
        }
        init[f.name] = Array.isArray(arr) ? arr : [];
      } else {
        init[f.name] = raw ?? "";
      }
    }
    if (allMembersMode) init.childId = item.childId != null ? String(item.childId) : "";
    setForm(init);
    setEditing(item);
    setError("");
    setShowForm(true);
    loadRefs().catch(() => {});
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, any> = {};
      for (const f of fields) {
        payload[f.name] = form[f.name];
        if (f.type === "photos") payload[f.name] = JSON.stringify(form[f.name] ?? []);
        if (f.type === "number" && form[f.name] !== "" && form[f.name] != null) {
          payload[f.name] = Number(form[f.name]);
        }
        if (f.refList) {
          payload[f.name] =
            form[f.name] !== "" && form[f.name] != null ? Number(form[f.name]) : null;
        }
      }
      if (childId != null) {
        payload.childId = childId;
      } else if (allMembersMode) {
        if (!form.childId) {
          setError("请选择成员");
          return;
        }
        payload.childId = Number(form.childId);
      }
      if (editing) {
        await api(`${baseEndpoint}/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      Notification.success(editing ? "修改已保存" : "添加成功");
      if (editing) {
        await load();
      } else {
        // 新建排在列表最前，回到第 1 页才能看到
        setPage(1);
        await load(1);
      }
      onDataChange?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: any) => {
    setDeleteLoading(true);
    try {
      await api(`${baseEndpoint}/${item.id}`, { method: "DELETE" });
      Notification.success("删除成功");
      setDeleting(null);
      // 删掉本页最后一条且不是第一页时，回退一页，避免空页
      if (pageSize && items.length === 1 && page > 1) {
        setPage(page - 1);
        await load(page - 1);
      } else {
        await load();
      }
      onDataChange?.();
    } catch (e: any) {
      Notification.error(e.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const entityName = title.replace(/管理|记录|列表/, "");
  // endpoint 可能带查询串（如 ?childId=1），单条记录的 URL 必须拼在纯路径上
  const baseEndpoint = endpoint.split("?")[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: "var(--animal-text-color)" }}>
          {title}
        </h2>
        <Button type="primary" onClick={openCreate}>
          添加
        </Button>
      </div>

      {items.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-6 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有记录，点击「添加」开始记录
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.filter(filterItem ?? (() => true)).map((item) => {
            const mName = members ? memberName(members, item.childId) : "";
            return (
              <Card key={item.id}>
                {mName && (
                  <div className="mb-2 flex items-center justify-between">
                    <Tag size="small" variant="soft" color="app-blue">
                      {mName}
                    </Tag>
                  </div>
                )}
                {renderItem(item, {
                  edit: () => openEdit(item),
                  remove: () => setDeleting(item),
                })}
              </Card>
            );
          })}
        </div>
      )}

      {pageSize && total > pageSize && (
        <div className="flex justify-center pt-3">
          <Pagination total={total} current={page} pageSize={pageSize} showTotal onChange={(p) => setPage(p)} />
        </div>
      )}

      <Modal
        open={showForm}
        title={editing ? `编辑${entityName}` : `添加${entityName}`}
        onClose={() => setShowForm(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setShowForm(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={save}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allMembersMode && (
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                成员 <span style={{ color: "var(--animal-error-color)" }}>*</span>
              </label>
              <Select
                value={form.childId ? String(form.childId) : ""}
                placeholder="请选择成员"
                options={(members ?? []).map((c) => ({
                  key: String(c.id),
                  label: c.nickname || c.name,
                }))}
                onChange={(key) => setForm({ ...form, childId: key })}
              />
            </div>
          )}
          {fields.map((f) => (
            <div
              key={f.name}
              className={f.full || f.type === "textarea" || f.type === "photos" || f.type === "avatar" ? "sm:col-span-2" : ""}
            >
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                {f.label}
                {f.required && <span style={{ color: "var(--animal-error-color)" }}> *</span>}
              </label>
              {f.type === "avatar" ? (
                <div className="flex items-center gap-4">
                  <PhotoUploader
                    multiple={false}
                    photos={form[f.name] ? [form[f.name]] : []}
                    onChange={(paths) => setForm({ ...form, [f.name]: paths[0] ?? "" })}
                  />
                  {form[f.name] && (
                    <Button
                      size="small"
                      danger
                      type="text"
                      onClick={() => setForm({ ...form, [f.name]: "" })}
                    >
                      移除头像
                    </Button>
                  )}
                </div>
              ) : f.type === "textarea" ? (
                <textarea
                  className="w-full px-4 py-2.5 text-sm"
                  rows={3}
                  placeholder={f.placeholder}
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
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
              ) : f.type === "photos" ? (
                <PhotoUploader
                  photos={form[f.name] ?? []}
                  onChange={(paths) => setForm({ ...form, [f.name]: paths })}
                />
              ) : f.type === "date" ? (
                <DatePicker
                  value={form[f.name] || null}
                  placeholder={f.placeholder || "选择日期"}
                  allowClear
                  onChange={(v) => setForm({ ...form, [f.name]: typeof v === "string" ? v : "" })}
                />
              ) : f.type === "select" ? (
                <Select
                  value={form[f.name] != null ? String(form[f.name]) : ""}
                  placeholder="请选择"
                  options={(f.refList ? refLists[f.refList] ?? [] : f.options ?? []).map((opt: any) => ({
                    key: String(opt.id ?? opt),
                    label: opt.name ?? f.optionLabels?.[opt] ?? String(opt),
                  }))}
                  onChange={(key) => setForm({ ...form, [f.name]: key })}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  placeholder={f.placeholder}
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--animal-error-color)" }}>
            {error}
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        title="删除确认"
        content="确定删除这条记录吗？删除后无法恢复。"
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={() => remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

export function ItemActions({
  edit,
  remove,
}: {
  edit: () => void;
  remove: () => void;
}) {
  return (
    <div className="flex gap-2 shrink-0">
      <Button size="small" onClick={edit}>
        编辑
      </Button>
      <Button size="small" danger onClick={remove}>
        删除
      </Button>
    </div>
  );
}

export function PhotoGrid({ photos }: { photos: string[] }) {
  const [preview, setPreview] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {photos.map((p, i) => (
        <button
          key={p}
          type="button"
          aria-label={`查看第 ${i + 1} 张照片`}
          className="cursor-zoom-in border-0 bg-transparent p-0 leading-none transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderRadius: 8, outlineColor: "var(--animal-focus-yellow)" }}
          onClick={() => setPreview(i)}
        >
          <Image src={p} alt="照片" width={110} height={110} preview={false} />
        </button>
      ))}
      <PhotoLightbox
        photos={photos}
        index={preview}
        onNavigate={setPreview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

export function parseJsonArray(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

export function Chip({ children, color = "default" }: { children: ReactNode; color?: any }) {
  return (
    <Tag size="small" variant="soft" color={color}>
      {children}
    </Tag>
  );
}
