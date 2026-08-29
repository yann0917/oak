"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Card, DatePicker, Input, Modal, Radio, Title } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api, calcAge } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { PhotoUploader } from "@/components/PhotoUploader";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const empty = { name: "", nickname: "", gender: "female", birthday: "", studentId: "", photo: "", notes: "" };

export default function ChildrenPage() {
  const { children, refresh, setCurrentChildId } = useChildren();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openCreate = () => {
    setForm({ ...empty });
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setForm({
      name: c.name ?? "",
      nickname: c.nickname ?? "",
      studentId: c.studentId ?? "",
      gender: c.gender ?? "female",
      birthday: c.birthday ?? "",
      photo: c.photo ?? "",
      notes: c.notes ?? "",
    });
    setEditingId(c.id);
    setError("");
    setShowForm(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("请填写姓名");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api(`/api/children/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        const created = await api("/api/children", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setCurrentChildId(created.id);
      }
      setShowForm(false);
      Notification.success(editingId ? "修改已保存" : "添加成功");
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (child: any) => {
    setDeleteLoading(true);
    try {
      await api(`/api/children/${child.id}`, { method: "DELETE" });
      Notification.success("删除成功");
      setDeleting(null);
      await refresh();
    } catch (e: any) {
      Notification.error(e.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <Title size="middle" color="app-teal">
          子女管理
        </Title>
        <Button type="primary" onClick={openCreate}>
          添加孩子
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children.map((c: any) => (
          <Card key={c.id}>
            <div className="flex items-center gap-4">
              {c.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photo}
                  alt={c.name}
                  className="rounded-xl shrink-0"
                  style={{
                    height: 72,
                    width: "auto",
                    maxWidth: 100,
                    objectFit: "cover",
                    border: "2px solid var(--animal-border-color-light)",
                    background: "#fff",
                  }}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black shrink-0"
                  style={{
                    background: "var(--animal-primary-color-bg)",
                    color: "var(--animal-primary-color-active)",
                  }}
                >
                  {c.nickname?.[0] || c.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg">
                  {c.name}
                  {c.nickname && (
                    <span className="text-base font-medium" style={{ color: "var(--animal-text-color-secondary)" }}>
                      （{c.nickname}）
                    </span>
                  )}
                </p>
                <p className="text-sm mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {c.gender === "male" ? "男孩" : "女孩"}
                  {c.birthday && ` · ${c.birthday} · ${calcAge(c.birthday)}`}
                </p>
                {c.studentId && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                    学籍号：{c.studentId}
                  </p>
                )}
                {c.notes && (
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {c.notes}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button block onClick={() => openEdit(c)}>
                编辑
              </Button>
              <Button block danger onClick={() => setDeleting(c)}>
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={showForm}
        title={editingId ? "编辑孩子" : "添加孩子"}
        onClose={() => setShowForm(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setShowForm(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={(e) => submit(e as any)}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              照片
            </label>
            <PhotoUploader
              photos={form.photo ? [form.photo] : []}
              multiple={false}
              onChange={(paths) => setForm({ ...form, photo: paths[0] ?? "" })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                姓名 <span style={{ color: "var(--animal-error-color)" }}>*</span>
              </label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                昵称/小名
              </label>
              <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                性别
              </label>
              <Radio
                value={form.gender}
                onChange={(v) => setForm({ ...form, gender: String(v) })}
                options={[
                  { label: "女", value: "female" },
                  { label: "男", value: "male" },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                生日
              </label>
              <DatePicker
                value={form.birthday || null}
                allowClear
                onChange={(v) => setForm({ ...form, birthday: typeof v === "string" ? v : "" })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              学籍号（全国唯一，如 G + 身份证号）
            </label>
            <Input
              placeholder="可选，如：G330106202209011234"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              备注
            </label>
            <textarea
              className="w-full px-4 py-2.5 text-sm"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--animal-error-color)" }}>
              {error}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        title="删除确认"
        content={`确定删除「${deleting?.name ?? ""}」的档案吗？其所有关联记录也会一并删除，无法恢复。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={() => remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
