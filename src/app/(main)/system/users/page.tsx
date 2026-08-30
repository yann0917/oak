"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Checkbox, Input, Modal, Switch, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { useProfile } from "@/lib/profileContext";
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Perm } from "@/components/Perm";

interface RoleItem {
  id: number;
  code: string;
  name: string;
}

interface UserItem {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  status: number;
  createdAt: string;
  roles: RoleItem[];
}

export default function SystemUsersPage() {
  const { user: me } = useProfile();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", isAdmin: false, status: true, roleIds: [] as number[] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<UserItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api<UserItem[]>("/api/system/users"));
      setRoles(await api<RoleItem[]>("/api/system/roles"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFormError("");
    setForm({ username: "", password: "", displayName: "", isAdmin: false, status: true, roleIds: [] });
    setShowForm(true);
  };

  const openEdit = (u: UserItem) => {
    setEditing(u);
    setFormError("");
    setForm({
      username: u.username,
      password: "",
      displayName: u.displayName,
      isAdmin: u.isAdmin,
      status: !!u.status,
      roleIds: u.roles.map((r) => r.id),
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError("");
    try {
      if (!editing && !form.password) throw new Error("请设置初始密码（至少 6 位）");
      const payload: Record<string, any> = {
        username: form.username.trim(),
        displayName: form.displayName,
        isAdmin: form.isAdmin,
        status: form.status,
        roleIds: form.roleIds,
      };
      if (form.password) payload.password = form.password;
      if (editing) {
        await api(`/api/system/users/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        Notification.success("修改已保存");
      } else {
        await api("/api/system/users", { method: "POST", body: JSON.stringify(payload) });
        Notification.success("用户已创建");
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/system/users/${deleting.id}`, { method: "DELETE" });
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
            用户管理
          </Title>
          <p className="text-sm mt-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            账号、超管标记与角色分配
          </p>
        </div>
        <Perm perm="system:user:create">
          <Button type="primary" onClick={openCreate}>
            新增用户
          </Button>
        </Perm>
      </div>

      {users.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            暂无用户
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {users.map((u) => (
            <Card key={u.id}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{u.displayName || u.username}</span>
                <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                  @{u.username}
                </span>
                {u.isAdmin && (
                  <Tag size="small" variant="soft" color="app-red">
                    超管
                  </Tag>
                )}
                <Tag size="small" variant="soft" color={u.status ? "app-green" : "default" as any}>
                  {u.status ? "启用" : "停用"}
                </Tag>
                {u.roles.map((r) => (
                  <Tag key={r.id} size="small" variant="soft">
                    {r.name}
                  </Tag>
                ))}
                {u.id === me?.id && (
                  <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    当前账号
                  </span>
                )}
                <div className="ml-auto flex gap-2 shrink-0">
                  <Perm perm="system:user:update">
                    <Button size="small" onClick={() => openEdit(u)}>
                      编辑
                    </Button>
                  </Perm>
                  <Perm perm="system:user:delete">
                    <Button size="small" danger disabled={u.id === me?.id} onClick={() => setDeleting(u)}>
                      删除
                    </Button>
                  </Perm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        title={editing ? `编辑用户 ${editing.displayName || editing.username}` : "新增用户"}
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
              用户名 <span style={{ color: "var(--animal-error-color)" }}>*</span>
            </label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              {editing ? "新密码（留空则不修改）" : "初始密码（至少 6 位）"}
            </label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              昵称
            </label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                checkedChildren="启用"
                unCheckedChildren="停用"
                aria-label="账号状态"
              />
              <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                账号状态
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isAdmin}
                onChange={(v) => setForm({ ...form, isAdmin: v })}
                checkedChildren="超管"
                unCheckedChildren="普通"
                aria-label="超管标记"
              />
              <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                超管（跳过权限校验）
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              角色
            </label>
            <Checkbox
              options={roles.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
              value={form.roleIds}
              onChange={(values) => setForm({ ...form, roleIds: values.map(Number) })}
            />
            {roles.length === 0 && (
              <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                暂无角色可分配，请先到「角色管理」创建
              </p>
            )}
          </div>
          {formError && (
            <p className="text-sm" style={{ color: "var(--animal-error-color)" }}>
              {formError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting != null}
        title="删除确认"
        content={`确定删除用户「${deleting?.displayName || deleting?.username}」吗？其角色关联将一并清除。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
