"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Modal, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Perm } from "@/components/Perm";
import { MenuTreeCheckbox } from "@/components/MenuTreeCheckbox";
import type { ProfileMenu } from "@/lib/profileContext";

interface RoleItem {
  id: number;
  code: string;
  name: string;
  remark: string;
}

export default function SystemRolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [form, setForm] = useState({ code: "", name: "", remark: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [assigning, setAssigning] = useState<RoleItem | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [deleting, setDeleting] = useState<RoleItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoles(await api<RoleItem[]>("/api/system/roles"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // 角色勾选的菜单集合（用于分配权限弹窗回显）
  const openAssign = (r: RoleItem) => {
    setAssigning(r);
  };

  const openCreate = () => {
    setEditing(null);
    setFormError("");
    setForm({ code: "", name: "", remark: "" });
    setShowForm(true);
  };

  const openEdit = (r: RoleItem) => {
    setEditing(r);
    setFormError("");
    setForm({ code: r.code, name: r.name, remark: r.remark });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError("");
    try {
      if (!form.code.trim() || !form.name.trim()) throw new Error("角色编码和名称不能为空");
      if (editing) {
        await api(`/api/system/roles/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        Notification.success("修改已保存");
      } else {
        await api("/api/system/roles", { method: "POST", body: JSON.stringify(form) });
        Notification.success("角色已创建，记得分配权限");
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveAssign = async () => {
    if (!assigning) return;
    setAssignSaving(true);
    try {
      await api(`/api/system/roles/${assigning.id}/menus?`, {
        method: "PUT",
        body: JSON.stringify({ menuIds: checkedIds }),
      });
      Notification.success("权限已保存并即时生效");
      setAssigning(null);
    } catch (e: any) {
      Notification.error(e.message || "保存失败");
    } finally {
      setAssignSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/system/roles/${deleting.id}`, { method: "DELETE" });
      Notification.success("删除成功");
      setDeleting(null);
      await load();
    } catch (e: any) {
      Notification.error(e.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <Title size="middle" color="app-teal">
            角色管理
          </Title>
          <p className="text-sm mt-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            角色即权限集合：分配菜单与按钮权限点后，所属用户登录即生效
          </p>
        </div>
        <Perm perm="system:role:create">
          <Button type="primary" onClick={openCreate}>
            新增角色
          </Button>
        </Perm>
      </div>

      {roles.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            暂无角色，点击「新增角色」创建
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roles.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{r.name}</span>
                <Tag size="small" variant="soft" color="app-blue">
                  {r.code}
                </Tag>
                {r.remark && (
                  <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {r.remark}
                  </span>
                )}
                <div className="ml-auto flex gap-2 shrink-0">
                  <Perm perm="system:role:assign">
                    <Button size="small" type="primary" onClick={() => openAssign(r)}>
                      分配权限
                    </Button>
                  </Perm>
                  <Perm perm="system:role:update">
                    <Button size="small" onClick={() => openEdit(r)}>
                      编辑
                    </Button>
                  </Perm>
                  <Perm perm="system:role:delete">
                    <Button size="small" danger onClick={() => setDeleting(r)}>
                      删除
                    </Button>
                  </Perm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 角色编辑 */}
      <Modal
        open={showForm}
        title={editing ? `编辑角色 ${editing.name}` : "新增角色"}
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              角色编码 <span style={{ color: "var(--animal-error-color)" }}>*</span>（建议英文，如 editor）
            </label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              角色名称 <span style={{ color: "var(--animal-error-color)" }}>*</span>
            </label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              备注
            </label>
            <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          {formError && (
            <p className="text-sm" style={{ color: "var(--animal-error-color)" }}>
              {formError}
            </p>
          )}
        </div>
      </Modal>

      {/* 分配权限（勾选菜单与按钮权限点） */}
      <Modal
        open={assigning != null}
        title={`分配权限 · ${assigning?.name ?? ""}`}
        onClose={() => setAssigning(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setAssigning(null)}>取消</Button>
            <Button type="primary" loading={assignSaving} onClick={saveAssign}>
              保存并生效
            </Button>
          </>
        }
      >
        <AssignMenuPanel roleId={assigning?.id ?? 0} onLoaded={setCheckedIds} onChange={setCheckedIds} />
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        title="删除确认"
        content={`确定删除角色「${deleting?.name ?? ""}」吗？相关用户的该角色将解除。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/** 分配权限面板：加载菜单树与角色当前勾选，级联勾选 */
function AssignMenuPanel({
  roleId,
  onLoaded,
  onChange,
}: {
  roleId: number;
  onLoaded: (ids: number[]) => void;
  onChange: (ids: number[]) => void;
}) {
  const [tree, setTree] = useState<ProfileMenu[]>([]);
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    if (!roleId) return;
    Promise.all([
      api<ProfileMenu[]>("/api/system/menus"),
      api<number[]>(`/api/system/roles/${roleId}/menus`),
    ])
      .then(([t, ids]) => {
        setTree(t);
        setChecked(ids);
        onLoaded(ids);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
        勾选菜单控制登录后的侧边栏可见性；勾选按钮（权限点）控制 API 与操作按钮权限。保存后即时生效。
      </p>
      <MenuTreeCheckbox
        tree={tree}
        value={checked}
        onChange={(ids) => {
          setChecked(ids);
          onChange(ids);
        }}
      />
    </div>
  );
}
