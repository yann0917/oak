"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal, Select, Switch, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Perm } from "@/components/Perm";

interface MenuItem {
  id: number;
  parentId: number | null;
  type: "dir" | "menu" | "button";
  name: string;
  path: string;
  icon: string;
  perms: string;
  sort: number;
  visible: number;
  children?: MenuItem[];
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  dir: { label: "目录", color: "app-orange" },
  menu: { label: "菜单", color: "app-blue" },
  button: { label: "按钮", color: "app-green" },
};

const EMPTY_FORM = {
  parentId: "",
  type: "menu" as string,
  name: "",
  path: "",
  icon: "",
  perms: "",
  sort: "0",
  visible: true,
};

export default function SystemMenusPage() {
  const [tree, setTree] = useState<MenuItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setTree(await api<MenuItem[]>("/api/system/menus"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // 父级下拉选项（排除自身及子树，避免把子孙挂到自己下）
  const parentOptions = useMemo(() => {
    const exclude = (editing ? collect(editing) : []).map((m) => m.id);
    const flat: { id: number; name: string; type: string; depth: number }[] = [];
    const walk = (nodes: MenuItem[], depth: number) => {
      for (const n of nodes) {
        if (!exclude.includes(n.id) && n.type !== "button") flat.push({ id: n.id, name: n.name, type: n.type, depth });
        walk(n.children ?? [], depth + 1);
      }
    };
    walk(tree, 0);
    return flat;
  }, [tree, editing]);

  const openCreate = (parent?: MenuItem) => {
    setEditing(null);
    setFormError("");
    setForm({
      ...EMPTY_FORM,
      parentId: parent ? String(parent.id) : "",
      // 在按钮下新增默认同类型按钮；目录下新增默认菜单
      type: parent?.type === "button" ? "button" : "menu",
    });
    setShowForm(true);
  };

  const openEdit = (m: MenuItem) => {
    setEditing(m);
    setFormError("");
    setForm({
      parentId: m.parentId != null ? String(m.parentId) : "",
      type: m.type,
      name: m.name,
      path: m.path,
      icon: m.icon,
      perms: m.perms,
      sort: String(m.sort),
      visible: !!m.visible,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError("");
    try {
      if (!form.name.trim()) throw new Error("菜单名称不能为空");
      if (form.type !== "button" && !form.path.trim()) throw new Error("目录/菜单需要填写路由路径");
      if (editing && form.parentId === String(editing.id)) throw new Error("父级不能是自身");
      const payload = {
        parentId: form.parentId ? Number(form.parentId) : null,
        type: form.type,
        name: form.name.trim(),
        path: form.path,
        icon: form.icon,
        perms: form.perms,
        sort: Number(form.sort) || 0,
        visible: form.visible,
      };
      if (editing) {
        await api(`/api/system/menus/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        Notification.success("修改已保存");
      } else {
        await api("/api/system/menus", { method: "POST", body: JSON.stringify(payload) });
        Notification.success("菜单已创建");
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
      await api(`/api/system/menus/${deleting.id}`, { method: "DELETE" });
      Notification.success("删除成功");
      setDeleting(null);
      await load();
    } catch (e: any) {
      Notification.error(e.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderTree = (nodes: MenuItem[], depth = 0): React.ReactNode =>
    nodes.map((m) => (
      <div key={m.id}>
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ marginLeft: depth * 18 }}>
              {m.name}
            </span>
            <Tag size="small" variant="soft" color={(TYPE_META[m.type]?.color ?? "default") as any}>
              {TYPE_META[m.type]?.label ?? m.type}
            </Tag>
            {m.perms && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                style={{ background: "var(--animal-primary-color-bg)", color: "var(--animal-primary-color)" }}
              >
                {m.perms}
              </span>
            )}
            {m.path && (
              <span className="text-xs font-mono" style={{ color: "var(--animal-text-color-secondary)" }}>
                {m.path}
              </span>
            )}
            <Tag size="small" variant="soft" color={m.visible ? "app-green" : ("default" as any)}>
              {m.visible ? "可见" : "隐藏"}
            </Tag>
            <div className="ml-auto flex gap-2 shrink-0">
              <Perm perm="system:menu:create">
                <Button size="small" onClick={() => openCreate(m)}>
                  新增子项
                </Button>
              </Perm>
              <Perm perm="system:menu:update">
                <Button size="small" onClick={() => openEdit(m)}>
                  编辑
                </Button>
              </Perm>
              <Perm perm="system:menu:delete">
                <Button size="small" danger onClick={() => setDeleting(m)}>
                  删除
                </Button>
              </Perm>
            </div>
          </div>
        </Card>
        {m.children?.length ? renderTree(m.children, depth + 1) : null}
      </div>
    ));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <Title size="middle" color="app-teal">
            菜单管理
          </Title>
          <p className="text-sm mt-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            侧边栏结构 + 按钮权限点（perms 为权限标识，如 system:user:list）
          </p>
        </div>
        <Perm perm="system:menu:create">
          <Button type="primary" onClick={() => openCreate()}>
            新增菜单
          </Button>
        </Perm>
      </div>

      {tree.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            暂无菜单
          </div>
        </Card>
      ) : (
        <div className="grid gap-2">{renderTree(tree)}</div>
      )}

      <Modal
        open={showForm}
        title={editing ? `编辑菜单 ${editing.name}` : "新增菜单"}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                父级（留空为顶级）
              </label>
              <Select
                value={form.parentId}
                options={parentOptions.map((p) => ({ key: String(p.id), label: `${"　".repeat(p.depth)}${p.name}（${TYPE_META[p.type]?.label ?? p.type}）` }))}
                placeholder="顶级"
                onChange={(key) => setForm({ ...form, parentId: key })}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                类型
              </label>
              <Select
                value={form.type}
                options={[
                  { key: "dir", label: "目录（分组）" },
                  { key: "menu", label: "菜单（页面）" },
                  { key: "button", label: "按钮（权限点）" },
                ]}
                onChange={(key) => setForm({ ...form, type: key })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              名称 <span style={{ color: "var(--animal-error-color)" }}>*</span>
            </label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                路由路径（按钮留空）
              </label>
              <Input
                placeholder="如 /system/users"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                图标（icon- 开头）
              </label>
              <Input
                placeholder="如 icon-miles"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                权限标识 perms
              </label>
              <Input
                placeholder="如 system:user:list"
                value={form.perms}
                onChange={(e) => setForm({ ...form, perms: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                排序（越小越靠前）
              </label>
              <Input
                type="number"
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.visible}
              onChange={(v) => setForm({ ...form, visible: v })}
              checkedChildren="可见"
              unCheckedChildren="隐藏"
              aria-label="菜单可见性"
            />
            <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
              隐藏后不出现在侧边栏与权限勾选
            </span>
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
        content={`确定删除「${deleting?.name ?? ""}」吗？需先删除其子项。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function collect(m: MenuItem): MenuItem[] {
  return [m, ...(m.children ?? []).flatMap(collect)];
}
