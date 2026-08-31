"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  Modal,
  Pagination,
  Select,
  Switch,
  Tabs,
  Tag,
  TimePicker,
  Title,
} from "animal-island-ui";
import { api } from "@/lib/api";
import { Pencil, Pill, School, Syringe, Wallet } from "lucide-react";
import { useChildren } from "@/lib/childContext";

// 模板 icon：lucide 图标名 -> 组件（见 src/lib/reminders/templates.ts）
const TEMPLATE_ICONS: Record<string, any> = { Syringe, Pill, Wallet, School, Pencil };
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { REMINDER_TEMPLATES, type ReminderTemplate } from "@/lib/reminders/templates";
import {
  CHANNEL_FIELDS,
  CHANNEL_META,
  CHANNEL_TYPES,
  SCHEDULE_TYPES,
  WEEKDAY_OPTIONS,
  describeSchedule,
  type ChannelType,
  type ScheduleType,
} from "@/lib/reminders/meta";

interface RuleItem {
  channels: string;
  quietHours: string;
  minIntervalMinutes: number;
  maxRetries: number;
  fallbackChannel: string;
}

interface ReminderItem {
  id: number;
  childId: number | null;
  childName: string;
  title: string;
  content: string;
  scheduleType: ScheduleType;
  cronExpr: string;
  timeOfDay: string;
  weekdays: string;
  monthDays: string;
  targetDate: string;
  advanceDays: string;
  nextRunAt: string;
  enabled: number;
  retryCount: number;
  createdAt: string;
  rules: RuleItem | null;
}

interface LogItem {
  id: number;
  reminderId: number | null;
  channel: string;
  status: string;
  content: string;
  error: string;
  read: number;
  createdAt: string;
  reminderTitle: string | null;
}

interface ChannelItem {
  id: number;
  type: string;
  config: string;
  enabled: number;
}

const SCHEDULE_LABEL: Record<string, string> = {
  once: "一次性",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  cron: "Cron",
};

const STATUS_COLOR: Record<string, string> = {
  sent: "app-green",
  failed: "app-red",
  muted: "app-orange",
};

const CHANNEL_LABEL: Record<string, string> = {
  wxpusher: "WxPusher",
  serverchan: "Server酱",
  email: "邮件",
  inapp: "站内",
};

function fmtTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_FORM = {
  title: "",
  content: "",
  childId: "",
  scheduleType: "once" as ScheduleType,
  cronExpr: "",
  timeOfDay: "09:00",
  weekdays: ["1"] as string[],
  monthDays: "1",
  targetDate: "",
  advanceDays: "",
  channels: ["wxpusher"] as string[],
  quietHours: "",
  minIntervalMinutes: "60",
  maxRetries: "3",
  fallbackChannel: "",
};

export default function RemindersPage() {
  const { children: kids } = useChildren();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReminderItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<ReminderItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<ReminderItem[]>("/api/reminders"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const activeCount = items.filter((i) => i.enabled).length;
  const failedCount = items.filter((i) => i.retryCount > 0).length;

  const openCreate = (tpl?: ReminderTemplate) => {
    setEditing(null);
    setFormError("");
    setForm({
      ...EMPTY_FORM,
      ...(tpl
        ? {
            title: tpl.title,
            content: tpl.content,
            scheduleType: tpl.scheduleType,
            advanceDays: tpl.advanceDays ?? "",
            targetDate: "",
          }
        : {}),
    });
    setShowForm(true);
  };

  const openEdit = (item: ReminderItem) => {
    setEditing(item);
    setFormError("");
    setForm({
      title: item.title,
      content: item.content,
      childId: item.childId != null ? String(item.childId) : "",
      scheduleType: item.scheduleType,
      cronExpr: item.cronExpr,
      timeOfDay: item.timeOfDay || "09:00",
      weekdays: (item.weekdays || "1").split(",").filter(Boolean),
      monthDays: item.monthDays || "1",
      targetDate: item.targetDate,
      advanceDays: item.advanceDays,
      channels: (item.rules?.channels || "wxpusher").split(",").filter(Boolean),
      quietHours: item.rules?.quietHours || "",
      minIntervalMinutes: String(item.rules?.minIntervalMinutes ?? 60),
      maxRetries: String(item.rules?.maxRetries ?? 3),
      fallbackChannel: item.rules?.fallbackChannel || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError("");
    try {
      if (!form.title.trim()) throw new Error("标题不能为空");
      const payload = {
        title: form.title.trim(),
        content: form.content,
        childId: form.childId ? Number(form.childId) : null,
        scheduleType: form.scheduleType,
        cronExpr: form.cronExpr,
        timeOfDay: form.timeOfDay,
        weekdays: form.scheduleType === "weekly" ? form.weekdays.join(",") : "",
        monthDays: form.scheduleType === "monthly" ? form.monthDays : "",
        targetDate: form.targetDate || "",
        advanceDays: form.advanceDays,
        channels: form.channels.join(",") || "wxpusher",
        quietHours: form.quietHours,
        minIntervalMinutes: Number(form.minIntervalMinutes) || 60,
        maxRetries: Number(form.maxRetries) || 3,
        fallbackChannel: form.fallbackChannel,
      };
      if (editing) {
        await api(`/api/reminders/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        Notification.success("修改已保存");
      } else {
        await api("/api/reminders", { method: "POST", body: JSON.stringify(payload) });
        Notification.success("提醒已创建，将按计划自动触发");
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
      await api(`/api/reminders/${deleting.id}`, { method: "DELETE" });
      Notification.success("删除成功");
      setDeleting(null);
      await load();
    } catch (e: any) {
      Notification.error(e.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggle = async (item: ReminderItem) => {
    const enable = item.enabled ? 0 : 1;
    try {
      await api(`/api/reminders/${item.id}/toggle`, { method: "POST", body: JSON.stringify({ enabled: enable }) });
      Notification.success(enable ? "提醒已启用" : "提醒已停用");
      await load();
    } catch (e: any) {
      Notification.error(e.message || "操作失败");
    }
  };

  const testSend = async (item: ReminderItem) => {
    setTestingId(item.id);
    try {
      const res = await api<{ ok: boolean; channels: string[]; failures?: any[]; error?: string }>(
        `/api/reminders/${item.id}/test`,
        { method: "POST", body: "{}" }
      );
      const chs = res.channels.map((c) => CHANNEL_LABEL[c] ?? c).join("、");
      Notification.success(`测试消息已发出（${chs}），请留意手机`);
    } catch (e: any) {
      Notification.error(e.message || "测试发送失败");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <Title size="middle" color="app-orange">
            提醒中心
          </Title>
          <p className="text-sm mt-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            把疫苗、视力检查、缴费、家长会串起来的定时推送枢纽
          </p>
        </div>
        <div className="flex gap-2 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
          <Tag size="small" variant="soft" color="app-green">
            启用中 {activeCount}
          </Tag>
          {failedCount > 0 && (
            <Tag size="small" variant="soft" color="app-red">
              重试中 {failedCount}
            </Tag>
          )}
        </div>
      </div>

      <Tabs
        items={[
          {
            key: "list",
            label: "提醒管理",
            children: (
              <div className="space-y-4">
                {/* 预置模板：零门槛创建入口 */}
                <div>
                  <p className="text-sm mb-2 font-semibold" style={{ color: "var(--animal-text-color-secondary)" }}>
                    快速创建
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {REMINDER_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => openCreate(tpl.key === "custom" ? undefined : tpl)}
                        className="rounded-2xl px-3 py-3 text-left text-xs transition-all hover:scale-[1.02]"
                        style={{
                          border: "2px solid var(--animal-border-color-light)",
                          background: "#fff",
                          color: "var(--animal-text-color)",
                        }}
                      >
                        <div className="mb-1.5 flex items-center justify-center">
                          <TemplateIcon name={tpl.icon} />
                        </div>
                        <div className="font-bold">{tpl.label}</div>
                        <div className="mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                          {tpl.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 提醒列表 */}
                {items.length === 0 ? (
                  <Card type="dashed">
                    <div className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                      还没有提醒，点击上方模板或「添加提醒」开始
                    </div>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {items.map((item) => (
                      <ReminderCard
                        key={item.id}
                        item={item}
                        testing={testingId === item.id}
                        onToggle={() => toggle(item)}
                        onEdit={() => openEdit(item)}
                        onRemove={() => setDeleting(item)}
                        onTest={() => testSend(item)}
                      />
                    ))}
                  </div>
                )}

                <div className="flex justify-center">
                  <Button type="primary" onClick={() => openCreate()}>
                    添加提醒
                  </Button>
                </div>
              </div>
            ),
          },
          {
            key: "logs",
            label: "发送日志",
            children: <LogsPanel />,
          },
          {
            key: "channels",
            label: "渠道设置",
            children: <ChannelsPanel />,
          },
        ]}
      />

      {/* 新建/编辑表单 */}
      <ReminderFormModal
        open={showForm}
        editing={editing}
        form={form}
        kids={kids}
        saving={saving}
        error={formError}
        setForm={setForm}
        onClose={() => setShowForm(false)}
        onSave={save}
      />

      <ConfirmDialog
        open={deleting != null}
        title="删除确认"
        content={`确定删除提醒「${deleting?.title ?? ""}」吗？历史发送日志会保留。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// 模板图标：lucide 图标名 -> 组件（名称见 src/lib/reminders/templates.ts），动森样式圆形底色
function TemplateIcon({ name }: { name: string }) {
  const TplIcon = TEMPLATE_ICONS[name];
  if (!TplIcon) return <span className="text-xl">{name}</span>;
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full"
      style={{ background: "var(--animal-primary-color-bg)" }}
    >
      <TplIcon size={20} style={{ color: "var(--animal-primary-color)" }} />
    </div>
  );
}

// ===== 提醒卡片 =====

function ReminderCard({
  item,
  testing,
  onToggle,
  onEdit,
  onRemove,
  onTest,
}: {
  item: ReminderItem;
  testing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  const channels = (item.rules?.channels || "wxpusher").split(",").filter(Boolean);
  return (
    <Card>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold">{item.title}</span>
        <Tag size="small" variant="soft" color="app-orange">
          {SCHEDULE_LABEL[item.scheduleType] ?? item.scheduleType}
        </Tag>
        {item.childName && (
          <Tag size="small" variant="soft" color="app-blue">
            {item.childName}
          </Tag>
        )}
        {channels.map((c) => (
          <Tag key={c} size="small" variant="soft">
            {CHANNEL_LABEL[c] ?? c}
          </Tag>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Switch
            size="small"
            checked={!!item.enabled}
            onChange={onToggle}
            checkedChildren="开"
            unCheckedChildren="关"
            aria-label="启用开关"
          />
        </div>
      </div>
      <div className="mt-2 text-xs space-y-1" style={{ color: "var(--animal-text-color-secondary)" }}>
        <div>
          {describeSchedule(item)} · 下次触发 <span className="font-semibold">{fmtTime(item.nextRunAt)}</span>
          {item.retryCount > 0 && (
            <span style={{ color: "var(--animal-error-color)" }}> · 第 {item.retryCount} 次重试中</span>
          )}
        </div>
        {item.content && (
          <div className="truncate" style={{ maxWidth: 480 }}>
            {item.content
              .replaceAll("{{member}}", item.childName || "孩子")
              .replaceAll("{{target_date}}", item.targetDate)}
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2 flex-wrap">
        <Button size="small" type="primary" loading={testing} onClick={onTest}>
          立即测试推送
        </Button>
        <Button size="small" onClick={onEdit}>
          编辑
        </Button>
        <Button size="small" danger onClick={onRemove}>
          删除
        </Button>
      </div>
    </Card>
  );
}

// ===== 新建/编辑表单 =====

function ReminderFormModal({
  open,
  editing,
  form,
  kids,
  saving,
  error,
  setForm,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: ReminderItem | null;
  form: typeof EMPTY_FORM;
  kids: { id: number; name: string }[];
  saving: boolean;
  error: string;
  setForm: (f: any) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm({ ...form, ...patch });
  const isOnce = form.scheduleType === "once";

  return (
    <Modal
      open={open}
      title={editing ? `编辑提醒` : "添加提醒"}
      onClose={onClose}
      typewriter={false}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={onSave}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
            标题 <span style={{ color: "var(--animal-error-color)" }}>*</span>
          </label>
          <Input
            placeholder="如：{{member}} 疫苗接种提醒"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              关联成员
            </label>
            <Select
              value={form.childId}
              placeholder="不选则不含成员名"
              options={kids.map((c) => ({ key: String(c.id), label: c.name }))}
              onChange={(key) => set({ childId: key })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              提醒类型
            </label>
            <Select
              value={form.scheduleType}
              options={SCHEDULE_TYPES.map((t) => ({ key: t.key, label: t.label }))}
              onChange={(key) => set({ scheduleType: key as ScheduleType })}
            />
          </div>
        </div>

        {(isOnce || form.scheduleType === "daily" || form.scheduleType === "weekly" || form.scheduleType === "monthly") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                触发时间
              </label>
              <TimePicker
                value={form.timeOfDay ? `${form.timeOfDay}:00` : undefined}
                format="HH:mm:ss"
                hourStep={1}
                minuteStep={5}
                secondStep={1}
                allowClear={false}
                onChange={(v) => set({ timeOfDay: v ? v.slice(0, 5) : "09:00" })}
              />
            </div>
            {isOnce && (
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  事件日期（截止/接种/开会日）
                </label>
                <DatePicker
                  value={form.targetDate || null}
                  placeholder="选择日期"
                  onChange={(v) => set({ targetDate: typeof v === "string" ? v : "" })}
                />
              </div>
            )}
            {isOnce && (
              <div className="sm:col-span-2">
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  提前预告
                </label>
                <Input
                  placeholder="逗号分隔，如 7,3,1（截止前 7/3/1 天各提醒一次，含当天）"
                  value={form.advanceDays}
                  onChange={(e) => set({ advanceDays: e.target.value })}
                />
              </div>
            )}
            {form.scheduleType === "weekly" && (
              <div className="sm:col-span-2">
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  每周几
                </label>
                <Checkbox
                  options={WEEKDAY_OPTIONS.map((w) => ({ value: w.key, label: w.label }))}
                  value={form.weekdays}
                  direction="horizontal"
                  onChange={(values) => set({ weekdays: values.map(String) })}
                />
              </div>
            )}
            {form.scheduleType === "monthly" && (
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  每月几号
                </label>
                <Input
                  placeholder="逗号分隔，如 1,15"
                  value={form.monthDays}
                  onChange={(e) => set({ monthDays: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        {form.scheduleType === "cron" && (
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              Cron 表达式（分 时 日 月 周）
            </label>
            <Input
              placeholder="如 0 9 * * 1-5（工作日 9 点）"
              value={form.cronExpr}
              onChange={(e) => set({ cronExpr: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
            消息内容
          </label>
          <textarea
            className="w-full px-4 py-2.5 text-sm"
            rows={3}
            placeholder="支持变量：{{member}}、{{days_left}}、{{target_date}}"
            value={form.content}
            onChange={(e) => set({ content: e.target.value })}
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
          <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
            可用变量：{'{{member}}'} 孩子昵称 · {'{{days_left}}'} 距离事件天数 · {'{{target_date}}'} 事件日期
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
            推送渠道（至少一个）
          </label>
          <Checkbox
            options={CHANNEL_TYPES.map((c) => ({ value: c, label: CHANNEL_META[c].label }))}
            value={form.channels}
            direction="horizontal"
            onChange={(values) => set({ channels: values.map(String) })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              静默期（不打扰）
            </label>
            <Input
              placeholder="如 22:00-07:00"
              value={form.quietHours}
              onChange={(e) => set({ quietHours: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              最小间隔（分钟）
            </label>
            <Input
              type="number"
              value={form.minIntervalMinutes}
              onChange={(e) => set({ minIntervalMinutes: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              最大重试次数
            </label>
            <Input
              type="number"
              value={form.maxRetries}
              onChange={(e) => set({ maxRetries: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
            兜底渠道（主渠道失败后使用）
          </label>
          <Select
            value={form.fallbackChannel}
            placeholder="不启用兜底"
            options={CHANNEL_TYPES.map((c) => ({ key: c, label: CHANNEL_META[c].label }))}
            onChange={(key) => set({ fallbackChannel: key })}
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--animal-error-color)" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ===== 发送日志 =====

function LogsPanel() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filter) params.set("status", filter);
      const res = await api<{ total: number; list: LogItem[] }>(`/api/reminders/logs?${params}`);
      setLogs(res.list);
      setTotal(res.total);
    } catch {}
  }, [page, pageSize, filter]);
  useEffect(() => {
    load();
  }, [load]);

  // 切换筛选或每页条数时回到第一页，避免停留在越界页码
  const changeFilter = (v: string) => {
    setFilter(v);
    setPage(1);
  };

  const clearLogs = async () => {
    setClearLoading(true);
    try {
      await api("/api/reminders/logs", { method: "DELETE" });
      Notification.success("发送日志已清空");
      setClearOpen(false);
      setPage(1);
      await load();
    } catch (e: any) {
      Notification.error(e.message || "清空失败");
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={filter}
          options={[
            { key: "", label: "全部状态" },
            { key: "sent", label: "已发送" },
            { key: "failed", label: "发送失败" },
            { key: "muted", label: "已跳过" },
          ]}
          onChange={changeFilter}
          aria-label="状态筛选"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
            最近 30 天
          </span>
          <Button size="small" danger onClick={() => setClearOpen(true)}>
            清空日志
          </Button>
        </div>
      </div>
      {logs.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-8 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            暂无发送记录
          </div>
        </Card>
      ) : (
        <div className="grid gap-2">
          {logs.map((l) => (
            <Card key={l.id}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {fmtTime(l.createdAt)}
                </span>
                <Tag size="small" variant="soft" color={(STATUS_COLOR[l.status] ?? "default") as any}>
                  {l.status === "sent" ? "已发送" : l.status === "failed" ? "失败" : "已跳过"}
                </Tag>
                {l.channel && (
                  <Tag size="small" variant="soft">
                    {CHANNEL_LABEL[l.channel] ?? l.channel}
                  </Tag>
                )}
                <span className="font-semibold text-sm">{l.reminderTitle || "已删除的提醒"}</span>
              </div>
              {l.content && (
                <p className="text-xs mt-1.5 line-clamp-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {l.content}
                </p>
              )}
              {l.error && (
                <p className="text-xs mt-1.5" style={{ color: "var(--animal-error-color)" }}>
                  {l.error}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
      {total > 0 && (
        <div className="flex justify-center pt-2">
          <Pagination
            total={total}
            current={page}
            pageSize={pageSize}
            showTotal
            onChange={(p, ps) => {
              if (ps !== pageSize) setPageSize(ps);
              setPage(p);
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={clearOpen}
        title="清空日志"
        content="将删除全部发送日志，不可恢复！"
        confirmText="清空"
        danger
        loading={clearLoading}
        onConfirm={clearLogs}
        onClose={() => setClearOpen(false)}
      />
    </div>
  );
}

// ===== 渠道设置 =====

function ChannelsPanel() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [savingType, setSavingType] = useState<string | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<ChannelItem[]>("/api/push-channels");
      setChannels(rows);
      const cfgs: Record<string, Record<string, string>> = {};
      const emps: Record<string, boolean> = {};
      for (const row of rows) {
        try {
          cfgs[row.type] = JSON.parse(row.config || "{}");
        } catch {
          cfgs[row.type] = {};
        }
        emps[row.type] = !!row.enabled;
      }
      setConfigs(cfgs);
      setEnabledMap(emps);
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (type: ChannelType) => {
    setSavingType(type);
    try {
      await api("/api/push-channels", {
        method: "POST",
        body: JSON.stringify({
          type,
          config: configs[type] ?? {}, // 未填写字段时保留空值，由发送侧校验
          enabled: enabledMap[type] === false ? 0 : 1,
        }),
      });
      Notification.success(`${CHANNEL_META[type].label}配置已保存`);
      await load();
    } catch (e: any) {
      Notification.error(e.message || "保存失败");
    } finally {
      setSavingType(null);
    }
  };

  const test = async (type: ChannelType) => {
    setTestingType(type);
    try {
      const res = await api<{ ok: boolean }>("/api/push-channels/test", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      Notification.success("测试消息已发出，请注意查收");
    } catch (e: any) {
      Notification.error(e.message || "测试发送失败");
    } finally {
      setTestingType(null);
    }
  };

  return (
    <div className="grid gap-3">
      {CHANNEL_TYPES.map((type) => {
        const meta = CHANNEL_META[type];
        const fields = CHANNEL_FIELDS[type];
        const cfg = configs[type] ?? {};
        return (
          <Card key={type}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">{meta.label}</span>
              <Tag size="small" variant="soft">
                {type}
              </Tag>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  启用
                </span>
                <Switch
                  size="small"
                  checked={enabledMap[type] !== false}
                  onChange={(v) => setEnabledMap({ ...enabledMap, [type]: v })}
                  aria-label={`启用${meta.label}`}
                />
              </div>
            </div>
            <p className="text-xs mt-1 mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
              {meta.desc}
            </p>
            {fields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {fields.map((f) => (
                  <div key={f.name}>
                    <label className="block text-xs mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                      {f.label}
                    </label>
                    <Input
                      placeholder={f.placeholder}
                      value={cfg[f.name] ?? ""}
                      onChange={(e) =>
                        setConfigs({ ...configs, [type]: { ...cfg, [f.name]: e.target.value } })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="small" type="primary" loading={savingType === type} onClick={() => save(type)}>
                保存配置
              </Button>
              {type !== "inapp" && (
                <Button size="small" loading={testingType === type} onClick={() => test(type)}>
                  测试发送
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
