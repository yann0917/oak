"use client";

// Microsoft To Do 风格待办：智能列表（我的一天/重要/计划/任务）+ 自定义清单 +
// 到期日/提醒（联动提醒中心）/重复/重要星标/备注/子任务步骤
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Modal, Select, Tag } from "animal-island-ui";
import type { TagColor } from "animal-island-ui";
import { AlarmClock, Repeat, Star } from "lucide-react";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type View = "myday" | "important" | "planned" | "tasks" | `list:${number}`;

interface Step {
  id: number;
  todoId: number;
  title: string;
  done: number;
  sort: number;
}
interface Todo {
  id: number;
  title: string;
  listId: number | null;
  note: string;
  dueDate: string;
  remindAt: string;
  repeatRule: string;
  priority: number;
  myDayDate: string;
  reminderId: number | null;
  done: number;
  completedAt: string;
  createdAt: string;
  steps: Step[];
}
interface TodoList {
  id: number;
  name: string;
  color: string;
}

const SMART_VIEWS: { key: View; label: string; emoji: string }[] = [
  { key: "myday", label: "我的一天", emoji: "🌞" },
  { key: "important", label: "重要", emoji: "⭐" },
  { key: "planned", label: "计划", emoji: "📅" },
  { key: "tasks", label: "任务", emoji: "📋" },
];

const LIST_COLORS = ["app-blue", "app-green", "app-orange", "app-teal", "purple", "app-yellow", "warm-peach-pink"];

const REPEAT_OPTIONS = [
  { key: "", label: "不重复" },
  { key: "daily", label: "每天" },
  { key: "2d", label: "每 2 天" },
  { key: "7d", label: "每 7 天" },
  { key: "weekly", label: "每周" },
  { key: "monthly", label: "每月" },
  { key: "yearly", label: "每年" },
];

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueMeta(due: string): { label: string; color: TagColor } | null {
  if (!due) return null;
  const t = todayStr();
  if (due < t) return { label: `逾期 · ${due}`, color: "app-red" };
  if (due === t) return { label: "今天", color: "app-orange" };
  if (due === addDays(t, 1)) return { label: "明天", color: "app-blue" };
  if (due <= addDays(t, 7)) return { label: `本周 · ${due}`, color: "app-teal" };
  return { label: due, color: "default" };
}

export default function TodoPage() {
  const [view, setView] = useState<View>("myday");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [listModal, setListModal] = useState<{ mode: "create" } | { mode: "edit"; item: TodoList } | null>(null);
  const [listName, setListName] = useState("");
  const [listColor, setListColor] = useState("app-blue");
  const [listSaving, setListSaving] = useState(false);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ todos: Todo[]; lists: TodoList[] }>("/api/todos");
      setTodos(d.todos ?? []);
      setLists(d.lists ?? []);
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateTodo = (row: Todo) => setTodos((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));

  const saveTodo = async (id: number, patch: Record<string, any>) => {
    try {
      const row = await api<Todo>(`/api/todos/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      updateTodo(row);
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    }
  };

  const currentListId = view.startsWith("list:") ? Number(view.slice(5)) : null;

  const add = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const row = await api<Todo>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title, listId: currentListId, myDayDate: view === "myday" ? todayStr() : "" }),
      });
      setTodos((prev) => [row, ...prev]);
      setNewTitle("");
    } catch (err: any) {
      Notification.error(err.message || "添加失败");
    }
  };

  const toggle = async (x: Todo) => {
    try {
      const res = await api<{ done: Todo; next: Todo | null }>(`/api/todos/${x.id}/toggle`, { method: "POST", body: JSON.stringify({}) });
      updateTodo(res.done);
      const next = res.next;
      if (next) {
        setTodos((prev) => [next, ...prev]);
        Notification.success("重复任务：已生成下一个实例");
      }
      if (res.done.done) setExpandedId((cur) => (cur === x.id ? null : cur));
    } catch (err: any) {
      Notification.error(err.message || "操作失败");
    }
  };

  const myDayToggle = async (x: Todo) => {
    const inMyDay = x.myDayDate === todayStr();
    try {
      await saveTodo(x.id, { myDayDate: inMyDay ? "" : todayStr() });
      if (!inMyDay) Notification.success("已加入我的一天");
    } catch {
      /* toast 已提示 */
    }
  };

  const stepAdd = async (todoId: number, title: string) => {
    try {
      const row = await api<Step>("/api/todo-steps", { method: "POST", body: JSON.stringify({ todoId, title }) });
      setTodos((prev) =>
        prev.map((x) => (x.id === todoId ? { ...x, steps: [...(x.steps ?? []), row] } : x))
      );
    } catch (err: any) {
      Notification.error(err.message || "添加失败");
    }
  };

  const stepPut = async (todo: Todo, step: Step, patch: Record<string, any>) => {
    try {
      const row = await api<Step>(`/api/todo-steps/${step.id}`, { method: "PUT", body: JSON.stringify(patch) });
      updateTodo({ ...todo, steps: todo.steps.map((s) => (s.id === step.id ? row : s)) });
    } catch (err: any) {
      Notification.error(err.message || "操作失败");
    }
  };

  const stepDelete = async (todo: Todo, step: Step) => {
    try {
      await api(`/api/todo-steps/${step.id}`, { method: "DELETE" });
      updateTodo({ ...todo, steps: todo.steps.filter((s) => s.id !== step.id) });
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/todos/${deleting.id}`, { method: "DELETE" });
      setTodos((prev) => prev.filter((x) => x.id !== deleting.id));
      setExpandedId(null);
      setDeleting(null);
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openListModal = (mode: "create" | "edit", item?: TodoList) => {
    setListModal(mode === "edit" && item ? { mode: "edit", item } : { mode: "create" });
    setListName(item?.name ?? "");
    setListColor(item?.color ?? "app-blue");
  };

  const saveList = async () => {
    const name = listName.trim();
    if (!name) {
      Notification.warning("请输入清单名称");
      return;
    }
    setListSaving(true);
    try {
      if (listModal?.mode === "edit") {
        const row = await api<TodoList>(`/api/todo-lists/${listModal.item.id}`, {
          method: "PUT",
          body: JSON.stringify({ name, color: listColor }),
        });
        setLists((prev) => prev.map((l) => (l.id === row.id ? row : l)));
      } else {
        const row = await api<TodoList>("/api/todo-lists", { method: "POST", body: JSON.stringify({ name, color: listColor }) });
        setLists((prev) => [...prev, row]);
      }
      setListModal(null);
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setListSaving(false);
    }
  };

  const deleteList = async (item: TodoList) => {
    if (!window.confirm(`删除清单「${item.name}」？清单内任务会保留并回到「任务」列表。`)) return;
    try {
      await api(`/api/todo-lists/${item.id}`, { method: "DELETE" });
      setLists((prev) => prev.filter((l) => l.id !== item.id));
      setTodos((prev) => prev.map((x) => (x.listId === item.id ? { ...x, listId: null } : x)));
      if (view === `list:${item.id}`) setView("tasks");
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    }
  };

  // ===== 智能视图过滤 =====
  const t = todayStr();
  let shown = todos.filter((x) => !x.done);
  let groupByDate = false;
  if (view === "myday") shown = shown.filter((x) => x.myDayDate === t);
  else if (view === "important") shown = shown.filter((x) => x.priority === 1);
  else if (view === "planned") {
    shown = shown.filter((x) => !!x.dueDate);
    groupByDate = true;
  } else if (view.startsWith("list:")) shown = shown.filter((x) => x.listId === Number(view.slice(5)));
  const completed = todos.filter((x) => x.done);

  const suggestions = todos
    .filter((x) => !x.done && x.myDayDate !== t && ((x.dueDate && x.dueDate <= t) || x.priority === 1))
    .slice(0, 6);

  const viewLabel =
    SMART_VIEWS.find((v) => v.key === view)?.label ?? lists.find((l) => `list:${l.id}` === view)?.name ?? "任务";

  const groups = [
    { key: "overdue", label: "已过期", match: (d: string) => d < t },
    { key: "today", label: "今天", match: (d: string) => d === t },
    { key: "tomorrow", label: "明天", match: (d: string) => d === addDays(t, 1) },
    { key: "week", label: "本周", match: (d: string) => d > addDays(t, 1) && d <= addDays(t, 7) },
    { key: "later", label: "将来", match: (d: string) => d > addDays(t, 7) },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[230px_1fr] items-start">
      {/* 左栏：智能列表 + 清单 */}
      <div className="space-y-4">
        <Card>
          <div className="flex gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
            {SMART_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className="flex items-center gap-2.5 md:w-full px-3 py-2.5 rounded-2xl text-sm font-semibold border-0 cursor-pointer whitespace-nowrap"
                style={
                  view === v.key
                    ? { background: "var(--animal-primary-color-bg)", color: "var(--animal-primary-color)" }
                    : { background: "transparent", color: "var(--animal-text-color-secondary)" }
                }
                onClick={() => setView(v.key)}
              >
                <span>{v.emoji}</span>
                {v.label}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">我的清单</h3>
            <Button size="small" onClick={() => openListModal("create")}>
              ＋ 新建
            </Button>
          </div>
          {lists.length === 0 && (
            <p className="text-xs mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
              暂无清单
            </p>
          )}
          <div className="flex gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
            {lists.map((l) => {
              const count = todos.filter((x) => x.listId === l.id && !x.done).length;
              return (
                <div key={l.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold border-0 cursor-pointer min-w-0"
                    style={
                      view === `list:${l.id}`
                        ? { background: "var(--animal-primary-color-bg)", color: "var(--animal-primary-color)" }
                        : { background: "transparent", color: "var(--animal-text-color-secondary)" }
                    }
                    onClick={() => setView(`list:${l.id}`)}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `var(--animal-${l.color})` }} />
                    <span className="truncate">{l.name}</span>
                    {count > 0 && <span className="ml-auto text-xs opacity-70">{count}</span>}
                  </button>
                  <span className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="编辑清单"
                      className="text-xs border-0 bg-transparent cursor-pointer"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                      onClick={() => openListModal("edit", l)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="删除清单"
                      className="text-xs border-0 bg-transparent cursor-pointer"
                      style={{ color: "var(--animal-error-color)" }}
                      onClick={() => deleteList(l)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 右栏：任务列表 */}
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-black">{viewLabel}</h2>
              <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                {shown.length} 个未完成{completed.length > 0 && ` · ${completed.length} 个已完成`}
              </p>
            </div>
            {view === "myday" && (
              <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                ☀️ {t}
              </span>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="添加任务，按回车确认…（如：明天去交材料）"
              aria-label="添加任务"
            />
            <Button type="primary" onClick={add}>
              添加
            </Button>
            {view === "myday" && <Button onClick={() => setView("tasks")}>从清单选</Button>}
          </div>
          {view === "myday" && suggestions.length > 0 && (
            <div className="mt-3 rounded-2xl px-3 py-2.5" style={{ background: "var(--animal-bg-color)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                💡 建议添加（到期 / 逾期 / 重要）
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Tag
                    key={s.id}
                    variant="soft"
                    color="app-yellow"
                    className="cursor-pointer"
                    onClick={() => {
                      saveTodo(s.id, { myDayDate: t });
                    }}
                  >
                    ＋ {s.title}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Card>

        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            加载中…
          </p>
        ) : (
          <div className="space-y-3">
            {groupByDate ? (
              groups.map((g) => {
                const items = shown.filter((x) => g.match(x.dueDate));
                if (!items.length) return null;
                return (
                  <div key={g.key} className="space-y-2">
                    <p className="text-xs font-semibold" style={{ color: "var(--animal-text-color-secondary)" }}>
                      {g.label} · {items.length}
                    </p>
                    {items.map((x) => (
                      <TodoCard
                        key={x.id}
                        todo={x}
                        expanded={expandedId === x.id}
                        lists={lists}
                        onToggle={() => toggle(x)}
                        onExpand={() => setExpandedId(expandedId === x.id ? null : x.id)}
                        onStar={() => saveTodo(x.id, { priority: x.priority ? 0 : 1 })}
                        onMyDay={() => myDayToggle(x)}
                        onDelete={() => setDeleting(x)}
                        onSave={saveTodo}
                        onStepAdd={stepAdd}
                        onStepPut={stepPut}
                        onStepDelete={stepDelete}
                      />
                    ))}
                  </div>
                );
              })
            ) : (
              shown.map((x) => (
                <TodoCard
                  key={x.id}
                  todo={x}
                  expanded={expandedId === x.id}
                  lists={lists}
                  onToggle={() => toggle(x)}
                  onExpand={() => setExpandedId(expandedId === x.id ? null : x.id)}
                  onStar={() => saveTodo(x.id, { priority: x.priority ? 0 : 1 })}
                  onMyDay={() => myDayToggle(x)}
                  onDelete={() => setDeleting(x)}
                  onSave={saveTodo}
                  onStepAdd={stepAdd}
                  onStepPut={stepPut}
                  onStepDelete={stepDelete}
                />
              ))
            )}
            {shown.length === 0 && !groupByDate && (
              <p className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                {view === "myday" ? "今天已清空 🌞 可从「清单选」或点一盏灯泡建议开始" : "没有任务，享受这一刻 🍃"}
              </p>
            )}
            {view === "tasks" && completed.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold" style={{ color: "var(--animal-text-color-secondary)" }}>
                  已完成 · {completed.length}
                </p>
                {completed.slice(0, 30).map((x) => (
                  <TodoCard
                    key={x.id}
                    todo={x}
                    expanded={expandedId === x.id}
                    lists={lists}
                    onToggle={() => toggle(x)}
                    onExpand={() => setExpandedId(expandedId === x.id ? null : x.id)}
                    onStar={() => saveTodo(x.id, { priority: x.priority ? 0 : 1 })}
                    onMyDay={() => myDayToggle(x)}
                    onDelete={() => setDeleting(x)}
                      onSave={saveTodo}
                    onStepAdd={stepAdd}
                    onStepPut={stepPut}
                    onStepDelete={stepDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 清单新建/编辑弹窗 */}
      <Modal
        open={!!listModal}
        title={listModal?.mode === "edit" ? "编辑清单" : "新建清单"}
        onClose={() => setListModal(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setListModal(null)}>取消</Button>
            <Button type="primary" loading={listSaving} onClick={saveList}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              清单名称
            </label>
            <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="如：超市采购 / 作业" />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              颜色
            </label>
            <div className="flex gap-2 flex-wrap">
              {LIST_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border-2 cursor-pointer"
                  style={{
                    borderColor: listColor === c ? "var(--animal-primary-color)" : "transparent",
                    background: "var(--animal-bg-color)",
                  }}
                  onClick={() => setListColor(c)}
                >
                  <span className="w-3 h-3 rounded-full" style={{ background: `var(--animal-${c})` }} />
                  {c.replace(/^app-/, "").replace("warm-peach-pink", "粉").replace("purple", "紫")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="删除任务"
        content={`确定删除「${deleting?.title ?? ""}」？关联提醒会一并停用。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// ===== 任务卡片（行 + 展开详情） =====

const inputStyle = {
  width: "100%",
  border: "2px solid var(--animal-border-color-light)",
  borderRadius: 12,
  padding: "8px 12px",
  background: "#fff",
  color: "var(--animal-text-color)",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 13,
} as const;

function TodoCard({
  todo,
  expanded,
  lists,
  onToggle,
  onExpand,
  onStar,
  onMyDay,
  onDelete,
  onSave,
  onStepAdd,
  onStepPut,
  onStepDelete,
}: {
  todo: Todo;
  expanded: boolean;
  lists: TodoList[];
  onToggle: () => void;
  onExpand: () => void;
  onStar: () => void;
  onMyDay: () => void;
  onDelete: () => void;
  onSave: (id: number, patch: Record<string, any>) => void;
  onStepAdd: (todoId: number, title: string) => void;
  onStepPut: (todo: Todo, step: Step, patch: Record<string, any>) => void;
  onStepDelete: (todo: Todo, step: Step) => void;
}) {
  const due = dueMeta(todo.dueDate);
  const [stepInput, setStepInput] = useState("");
  const [note, setNote] = useState(todo.note);
  const listName = lists.find((l) => l.id === todo.listId)?.name;

  return (
    <div>
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl cursor-pointer ${todo.done ? "opacity-70" : "bg-white"}`}
        onClick={onExpand}
      >
        <button
          type="button"
          aria-label={todo.done ? "标记未完成" : "标记完成"}
          className="w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-black cursor-pointer transition-all"
          style={{
            borderColor: todo.done ? "var(--animal-primary-color)" : "var(--animal-border-color-light)",
            background: todo.done ? "var(--animal-primary-color)" : "transparent",
            color: "#fff",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {todo.done ? "✓" : ""}
        </button>
        <span
          className={`flex-1 min-w-0 text-sm truncate ${todo.done ? "line-through" : ""}`}
          style={{ color: todo.done ? "var(--animal-text-color-secondary)" : "var(--animal-text-color)" }}
        >
          {todo.title}
        </span>
        <button
          type="button"
          aria-label="重要"
          className="border-0 bg-transparent p-1 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
        >
          <Star
            size={16}
            fill={todo.priority ? "var(--animal-yellow)" : "none"}
            color={todo.priority ? "var(--animal-yellow)" : "var(--animal-text-color-secondary)"}
          />
        </button>
        {due && (
          <Tag size="small" variant="soft" color={due.color} className="shrink-0 hidden sm:inline-flex">
            {due.label}
          </Tag>
        )}
        {todo.remindAt && (
          <span className="flex items-center gap-1 text-[11px] shrink-0" style={{ color: "var(--animal-text-color-secondary)" }}>
            <AlarmClock size={12} />
            {todo.remindAt.slice(5, 16)}
          </span>
        )}
        {todo.repeatRule && (
          <span className="shrink-0" style={{ color: "var(--animal-text-color-secondary)" }}>
            <Repeat size={13} />
          </span>
        )}
        {listName && (
          <Tag size="small" variant="soft" color="default" className="shrink-0 hidden md:inline-flex">
            {listName}
          </Tag>
        )}
      </div>

      {expanded && (
        <div className="rounded-2xl bg-white mt-1 p-4 space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              备注
            </label>
            <textarea
              rows={2}
              value={note}
              placeholder="补充说明…"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note !== todo.note) onSave(todo.id, { note });
              }}
              style={inputStyle}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                到期日
              </label>
              <input
                type="date"
                value={todo.dueDate}
                onChange={(e) => onSave(todo.id, { dueDate: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                提醒（联动提醒中心，可推送）
              </label>
              <input
                type="datetime-local"
                value={todo.remindAt}
                onChange={(e) => onSave(todo.id, { remindAt: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                重复
              </label>
              <Select
                value={todo.repeatRule}
                options={REPEAT_OPTIONS.map((r) => ({ key: r.key, label: r.label }))}
                onChange={(k) => onSave(todo.id, { repeatRule: k })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                所属清单
              </label>
              <Select
                value={String(todo.listId ?? "")}
                options={[
                  { key: "", label: "任务（未分类）" },
                  ...lists.map((l) => ({ key: String(l.id), label: l.name })),
                ]}
                onChange={(k) => onSave(todo.id, { listId: k === "" ? null : Number(k) })}
              />
            </div>
          </div>

          {/* 子任务步骤 */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              步骤（子任务）· {todo.steps.filter((s) => s.done).length}/{todo.steps.length}
            </p>
            <div className="space-y-1.5">
              {(todo.steps ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={s.done ? "取消勾选" : "勾选"}
                    className="w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] font-black cursor-pointer"
                    style={{
                      borderColor: s.done ? "var(--animal-primary-color)" : "var(--animal-border-color-light)",
                      background: s.done ? "var(--animal-primary-color)" : "transparent",
                      color: "#fff",
                    }}
                    onClick={() => onStepPut(todo, s, { done: s.done ? 0 : 1 })}
                  >
                    {s.done ? "✓" : ""}
                  </button>
                  <span
                    className={`flex-1 text-sm ${s.done ? "line-through" : ""}`}
                    style={{ color: s.done ? "var(--animal-text-color-secondary)" : "var(--animal-text-color)" }}
                  >
                    {s.title}
                  </span>
                  <button
                    type="button"
                    aria-label="删除步骤"
                    className="text-xs border-0 bg-transparent cursor-pointer"
                    style={{ color: "var(--animal-text-color-secondary)" }}
                    onClick={() => onStepDelete(todo, s)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <input
              className="mt-1.5"
              style={inputStyle}
              placeholder="添加步骤，回车确认…"
              value={stepInput}
              onChange={(e) => setStepInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && stepInput.trim()) {
                  onStepAdd(todo.id, stepInput.trim());
                  setStepInput("");
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button size="small" onClick={onMyDay}>
              {todo.myDayDate === todayStr() ? "从我的一天移除" : "加入我的一天"}
            </Button>
            <Button size="small" danger onClick={onDelete}>
              删除任务
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
