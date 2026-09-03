"use client";

import { useEffect, useState } from "react";
import { Button, Divider, Icon, Input, Modal, Select, DatePicker, Tag } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import type { Child } from "@/lib/childContext";
import { memberName } from "@/components/MemberFilter";
import { CrudSection, ItemActions } from "@/components/CrudSection";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const emptyLink = { teacherId: "", childId: "", stage: "", startDate: "", endDate: "", notes: "" };

export default function TeachersSection({
  childId,
  members,
}: {
  childId: number | null;
  members?: Child[];
}) {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [showLink, setShowLink] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [linkForm, setLinkForm] = useState({ ...emptyLink });
  const [deletingLink, setDeletingLink] = useState<number | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);

  const loadTeachers = () => {
    api("/api/teachers").then(setTeachers).catch(() => {});
  };

  const loadLinks = () => {
    api(childId != null ? `/api/child-teachers?childId=${childId}` : "/api/child-teachers")
      .then(setLinks)
      .catch(() => {});
  };

  useEffect(() => {
    loadTeachers();
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const teacherName = (id: number) => teachers.find((t) => t.id === id)?.name ?? "（已删除）";

  const openAddLink = () => {
    setEditingLinkId(null);
    setLinkForm({ ...emptyLink });
    setShowLink(true);
  };

  const openEditLink = (link: any) => {
    setEditingLinkId(link.id);
    setLinkForm({
      teacherId: String(link.teacherId ?? ""),
      childId: link.childId != null ? String(link.childId) : "",
      stage: link.stage ?? "",
      startDate: link.startDate ?? "",
      endDate: link.endDate ?? "",
      notes: link.notes ?? "",
    });
    setShowLink(true);
  };

  const saveLink = async () => {
    if (!linkForm.teacherId) return;
    const targetChildId = childId ?? (linkForm.childId ? Number(linkForm.childId) : null);
    if (!targetChildId) {
      Notification.error("请选择成员");
      return;
    }
    setLinkSaving(true);
    try {
      const payload = {
        childId: targetChildId,
        teacherId: Number(linkForm.teacherId),
        stage: linkForm.stage,
        startDate: linkForm.startDate,
        endDate: linkForm.endDate,
        notes: linkForm.notes,
      };
      if (editingLinkId) {
        await api(`/api/child-teachers/${editingLinkId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/child-teachers", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowLink(false);
      Notification.success(editingLinkId ? "修改已保存" : "关联成功");
      loadLinks();
    } catch (e: any) {
      Notification.error(e.message || "保存失败");
    } finally {
      setLinkSaving(false);
    }
  };

  const removeLink = async (id: number) => {
    await api(`/api/child-teachers/${id}`, { method: "DELETE" });
    Notification.success("已移除关联");
    setDeletingLink(null);
    loadLinks();
  };

  return (
    <div className="space-y-8">
      <div>
        <CrudSection
          title="老师列表"
          endpoint="/api/teachers"
          onDataChange={loadTeachers}
          fields={[
            { name: "avatar", label: "头像（可选）", type: "avatar" },
            { name: "name", label: "姓名", required: true },
            { name: "gender", label: "性别", type: "select", options: ["男", "女"] },
            { name: "age", label: "年龄", type: "number", placeholder: "如：45" },
            { name: "subject", label: "科目/职务", placeholder: "如：班主任、语文" },
            { name: "phone", label: "联系方式" },
            { name: "notes", label: "备注", type: "textarea" },
          ]}
          renderItem={(item, actions) => (
            <div className="flex items-center gap-3">
              {item.avatar ? (
                <img
                  src={item.avatar}
                  alt={item.name}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                  style={{ border: "2px solid var(--animal-border-color-light)" }}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--animal-primary-color-bg)" }}
                >
                  <Icon name="icon-chat" size={22} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {item.name}
                  {item.subject && (
                    <span className="text-xs ml-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                      {item.subject}
                    </span>
                  )}
                </p>
                {(item.phone || item.gender || item.age > 0) && (
                  <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {item.gender && (
                      <span>
                        {item.gender}
                        {(item.age > 0 || item.phone) && " · "}
                      </span>
                    )}
                    {item.age > 0 && (
                      <span>
                        {item.age} 岁{(item.phone && " · ") || ""}
                      </span>
                    )}
                    {item.phone}
                  </p>
                )}
              </div>
              <ItemActions {...actions} />
            </div>
          )}
        />
      </div>

      <div>
        <Divider type="wave-yellow" />
        <div className="flex items-center justify-between mt-6 mb-4">
          <h3 className="font-bold" style={{ color: "var(--animal-text-color)" }}>
            老师关联
          </h3>
          <Button type="primary" onClick={openAddLink}>
            关联老师
          </Button>
        </div>
        {links.length === 0 ? (
          <div
            className="text-center py-10 text-sm rounded-3xl border-2 border-dashed"
            style={{
              color: "var(--animal-text-color-secondary)",
              borderColor: "var(--animal-border-color-light)",
            }}
          >
            还没有关联老师
          </div>
        ) : (
          <div className="grid gap-3">
            {links.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-3 p-4 rounded-3xl border-2"
                style={{
                  background: "var(--animal-bg-color)",
                  borderColor: "var(--animal-border-color-light)",
                }}
              >
                <div className="flex-1">
                  <p className="font-bold">
                    {teacherName(link.teacherId)}
                    {members && memberName(members, link.childId) && (
                      <Tag size="small" variant="soft" color="app-blue" className="ml-2">
                        {memberName(members, link.childId)}
                      </Tag>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {link.stage && `${link.stage} · `}
                    {link.startDate || "?"} ~ {link.endDate || "至今"}
                    {link.notes && ` · ${link.notes}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="small" onClick={() => openEditLink(link)}>
                    编辑
                  </Button>
                  <Button size="small" danger onClick={() => setDeletingLink(link.id)}>
                    移除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showLink}
        title={editingLinkId ? "编辑关联" : "关联老师"}
        onClose={() => setShowLink(false)}
        width={560}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setShowLink(false)}>取消</Button>
            <Button type="primary" loading={linkSaving} onClick={saveLink}>
              保存
            </Button>
          </>
        }
      >
        <div className="w-full max-h-[60vh] overflow-y-auto pr-1 pb-24 space-y-4">
          {childId == null && members && (
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                成员 <span style={{ color: "var(--animal-error-color)" }}>*</span>
              </label>
              <Select
                value={linkForm.childId ?? ""}
                onChange={(key) => setLinkForm({ ...linkForm, childId: key })}
                options={members.map((c) => ({ key: String(c.id), label: c.nickname || c.name }))}
              />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              老师
            </label>
            <Select
              value={linkForm.teacherId}
              onChange={(key) => setLinkForm({ ...linkForm, teacherId: key })}
              options={teachers.map((t) => ({
                key: String(t.id),
                label: t.subject ? `${t.name}（${t.subject}）` : t.name,
              }))}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              阶段/说明
            </label>
            <Input
              placeholder="如：幼儿园小班"
              value={linkForm.stage}
              onChange={(e) => setLinkForm({ ...linkForm, stage: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                开始
              </label>
              <DatePicker
                className="w-full"
                value={linkForm.startDate || null}
                allowClear
                onChange={(v) => setLinkForm({ ...linkForm, startDate: typeof v === "string" ? v : "" })}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                结束（空=至今）
              </label>
              <DatePicker
                className="w-full"
                value={linkForm.endDate || null}
                allowClear
                onChange={(v) => setLinkForm({ ...linkForm, endDate: typeof v === "string" ? v : "" })}
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deletingLink != null}
        title="移除确认"
        content="确定移除这位老师与孩子的关联吗？"
        confirmText="移除"
        danger
        onConfirm={() => deletingLink != null && removeLink(deletingLink)}
        onClose={() => setDeletingLink(null)}
      />
    </div>
  );
}
