"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Icon, Input, Modal, Select, Tag, TimePicker, Title } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { MemberFilter, useMemberFilter } from "@/components/MemberFilter";

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const emptySlot = {
  day: "周一",
  period: "",
  subject: "",
  timeRange: "",
  teacherName: "",
  notes: "",
};

export default function TimetablePage() {
  const { children: kids, member, memberId, setMemberId } = useMemberFilter(false);
  const router = useRouter();
  const [slots, setSlots] = useState<any[]>([]);
  const [periodOrders, setPeriodOrders] = useState<Record<string, string[]>>({});
  const [semesters, setSemesters] = useState<any[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [showSlot, setShowSlot] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [slotForm, setSlotForm] = useState({ ...emptySlot, startTime: "", endTime: "" });
  const [saving, setSaving] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const load = async (sid = semesterId) => {
    if (memberId == null) return;
    const [list, all, orders] = await Promise.all([
      api<any[]>(`/api/semesters?childId=${memberId}`),
      api<any[]>(`/api/timetable-slots?childId=${memberId}`),
      api<any[]>(`/api/timetable-period-order?childId=${memberId}`),
    ]);
    // 学期按 年份 → 开始日期 → 创建顺序 排列
    const sorted = [...list].sort((a, b) => {
      const ya = a.year || "";
      const yb = b.year || "";
      if (ya !== yb) return ya < yb ? -1 : 1;
      const sa = a.startDate || "";
      const sb = b.startDate || "";
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.id - b.id;
    });
    setSemesters(sorted);
    setSlots(all);
    // 按学期归组节次顺序（节次顺序表按学期名存储）
    const grouped: Record<string, string[]> = {};
    for (const row of orders.sort((a, b) => a.idx - b.idx)) {
      (grouped[row.term] ??= []).push(row.period);
    }
    setPeriodOrders(grouped);
    if (!sid || !sorted.some((s) => String(s.id) === sid)) {
      setSemesterId(sorted[0] ? String(sorted[0].id) : "");
    }
  };

  useEffect(() => {
    setSemesterId("");
    load("").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const currentSemester = useMemo(
    () => semesters.find((s) => String(s.id) === semesterId),
    [semesters, semesterId]
  );
  const termSlots = useMemo(
    () => slots.filter((s) => String(s.semesterId) === semesterId),
    [slots, semesterId]
  );

  // 节次顺序：手动拖拽过的排前面（按保存顺序），新出现的节次按出现顺序追加在后面
  const periods = useMemo(() => {
    const seen: string[] = [];
    for (const s of termSlots) {
      const p = s.period || "未分节";
      if (!seen.includes(p)) seen.push(p);
    }
    const manual = (periodOrders[currentSemester?.name ?? ""] ?? []).filter((p) =>
      seen.includes(p)
    );
    const rest = seen.filter((p) => !manual.includes(p));
    return [...manual, ...rest];
  }, [termSlots, periodOrders, currentSemester]);

  // 拖拽排序：落下时重排并持久化
  const reorderPeriods = async (from: number, to: number) => {
    if (from === to || memberId == null || !currentSemester) return;
    const next = [...periods];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPeriodOrders((prev) => ({ ...prev, [currentSemester.name]: next }));
    try {
      await api("/api/timetable-period-order", {
        method: "PUT",
        body: JSON.stringify({
          childId: memberId,
          term: currentSemester.name,
          periods: next,
        }),
      });
      Notification.success("排序已保存");
    } catch (e: any) {
      Notification.error(e.message || "保存排序失败");
      load().catch(() => {});
    }
  };
  const days = useMemo(
    () => DAYS.filter((d) => termSlots.some((s) => (s.day || "周一") === d)),
    [termSlots]
  );
  const cellSlots = (day: string, period: string) =>
    termSlots.filter((s) => (s.day || "周一") === day && (s.period || "未分节") === period);

  const parseRange = (range: string): { startTime: string; endTime: string } => {
    const m = (range || "").match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    return m ? { startTime: m[1], endTime: m[2] } : { startTime: "", endTime: "" };
  };

  const openAdd = (day?: string, period?: string) => {
    setEditingSlotId(null);
    setSlotForm({ ...emptySlot, day: day ?? "周一", period: period ?? "", startTime: "", endTime: "" });
    setShowSlot(true);
  };

  const openEdit = (slot: any) => {
    setEditingSlotId(slot.id);
    const { startTime, endTime } = parseRange(slot.timeRange);
    setSlotForm({
      day: slot.day ?? "周一",
      period: slot.period ?? "",
      subject: slot.subject ?? "",
      timeRange: slot.timeRange ?? "",
      startTime,
      endTime,
      teacherName: slot.teacherName ?? "",
      notes: slot.notes ?? "",
    });
    setShowSlot(true);
  };

  const saveSlot = async () => {
    if (!slotForm.subject.trim()) {
      Notification.warning("请填写课程名称");
      return;
    }
    if (!currentSemester || memberId == null) return;
    setSaving(true);
    try {
      const payload = {
        childId: memberId,
        semesterId: currentSemester.id,
        day: slotForm.day,
        period: slotForm.period,
        subject: slotForm.subject,
        timeRange:
          slotForm.startTime && slotForm.endTime
            ? `${slotForm.startTime.slice(0, 5)}-${slotForm.endTime.slice(0, 5)}`
            : "",
        teacherName: slotForm.teacherName,
        notes: slotForm.notes,
      };
      if (editingSlotId) {
        await api(`/api/timetable-slots/${editingSlotId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/timetable-slots", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowSlot(false);
      Notification.success(editingSlotId ? "修改已保存" : "课程已添加");
      await load();
    } catch (e: any) {
      Notification.error(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async () => {
    if (deletingSlot == null) return;
    await api(`/api/timetable-slots/${deletingSlot}`, { method: "DELETE" });
    Notification.success("已删除课程");
    setDeletingSlot(null);
    setShowSlot(false);
    await load();
  };

  if (kids.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="app-blue">
          课程表
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} allowAll={false} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        按学期维护 {member?.name ?? ""} 的每周课程表，点击格子添加或修改课程
      </p>

      {/* 学期选择 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-sm font-bold">学期</span>
        <div className="w-48">
          <Select
            value={semesterId}
            onChange={setSemesterId}
            placeholder="请选择学期"
            options={semesters.map((s) => ({ key: String(s.id), label: s.name }))}
          />
        </div>
        <Button onClick={() => router.push("/education?tab=semesters")}>学期管理</Button>
        {currentSemester && (
          <Button type="primary" onClick={() => openAdd()}>
            添加课程
          </Button>
        )}
      </div>

      {!currentSemester ? (
        <Card type="dashed">
          <div className="text-center py-10 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有学期，点击「学期管理」去创建（如：一年级上学期、2026 秋季）
          </div>
        </Card>
      ) : periods.length === 0 ? (
        <Card type="dashed">
          <div className="text-center py-10 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            {currentSemester.name} 还没有课程，点击「添加课程」开始排课
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: 6 }}>
              <thead>
                <tr>
                  <th
                    className="text-xs font-bold px-2 py-1 rounded-xl"
                    style={{ background: "var(--animal-bg-color-secondary)", minWidth: 72 }}
                  >
                    节次
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="text-xs font-bold px-2 py-1 rounded-xl"
                      style={{ background: "var(--animal-primary-color-bg)", color: "var(--animal-primary-color-active)", minWidth: 88 }}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, rowIdx) => (
                  <tr
                    key={p}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragFrom.current != null && dragFrom.current !== rowIdx) setDragOverIdx(rowIdx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom.current != null) reorderPeriods(dragFrom.current, rowIdx);
                      dragFrom.current = null;
                      setDragOverIdx(null);
                    }}
                  >
                    <td
                      draggable
                      onDragStart={(e) => {
                        dragFrom.current = rowIdx;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(rowIdx));
                      }}
                      onDragEnd={() => {
                        dragFrom.current = null;
                        setDragOverIdx(null);
                      }}
                      title="拖动调整节次顺序"
                      className="text-xs font-bold text-center px-2 py-2 rounded-xl align-middle select-none"
                      style={{
                        background: "var(--animal-bg-color-secondary)",
                        cursor: "grab",
                        outline:
                          dragOverIdx === rowIdx
                            ? "2px dashed var(--animal-primary-color)"
                            : "none",
                      }}
                    >
                      {p}
                    </td>
                    {days.map((d) => {
                      const cell = cellSlots(d, p);
                      return (
                        <td
                          key={d}
                          className="align-top"
                        >
                          {cell.length === 0 ? (
                            <button
                              onClick={() => openAdd(d, p)}
                              className="w-full rounded-xl text-lg leading-none py-3 cursor-pointer transition-all"
                              style={{
                                border: "2px dashed var(--animal-border-color-light)",
                                color: "var(--animal-text-color-disabled)",
                                background: "transparent",
                              }}
                              aria-label={`在${d}${p}添加课程`}
                            >
                              ＋
                            </button>
                          ) : (
                            <button
                              onClick={() => openEdit(cell[0])}
                              className="w-full text-left px-2.5 py-2 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5"
                              style={{
                                background: "var(--animal-primary-color-bg)",
                                border: "2px solid var(--animal-primary-color)",
                              }}
                            >
                              <p className="text-xs font-bold" style={{ color: "var(--animal-text-color)" }}>
                                {cell[0].subject}
                              </p>
                              {cell[0].timeRange && (
                                <p className="text-[10px]" style={{ color: "var(--animal-text-color-secondary)" }}>
                                  {cell[0].timeRange}
                                </p>
                              )}
                              {cell[0].teacherName && (
                                <p className="text-[10px]" style={{ color: "var(--animal-text-color-secondary)" }}>
                                  {cell[0].teacherName}
                                </p>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
            提示：按住左侧节次格子上下拖动，可以调整节的先后顺序
          </p>
        </Card>
      )}

      {/* 课程编辑弹窗 */}
      <Modal
        open={showSlot}
        title={editingSlotId ? "编辑课程" : "添加课程"}
        onClose={() => setShowSlot(false)}
        typewriter={false}
        footer={
          <>
            {editingSlotId && (
              <Button danger onClick={() => setDeletingSlot(editingSlotId)}>
                删除
              </Button>
            )}
            <Button onClick={() => setShowSlot(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={saveSlot}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              星期
            </label>
            <Select
              value={slotForm.day}
              onChange={(key) => setSlotForm({ ...slotForm, day: key })}
              options={DAYS.map((d) => ({ key: d, label: d }))}
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              节次
            </label>
            <Input
              placeholder="如：上午第一节"
              value={slotForm.period}
              onChange={(e) => setSlotForm({ ...slotForm, period: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              课程名称 <span style={{ color: "var(--animal-error-color)" }}>*</span>
            </label>
            <Input
              placeholder="如：语文、户外活动"
              value={slotForm.subject}
              onChange={(e) => setSlotForm({ ...slotForm, subject: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              时间
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TimePicker
                  format="HH:mm"
                  value={slotForm.startTime || undefined}
                  placeholder="开始时间"
                  allowClear
                  onChange={(v) => setSlotForm({ ...slotForm, startTime: typeof v === "string" ? v : "" })}
                />
              </div>
              <span className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                至
              </span>
              <div className="flex-1">
                <TimePicker
                  format="HH:mm"
                  value={slotForm.endTime || undefined}
                  placeholder="结束时间"
                  allowClear
                  onChange={(v) => setSlotForm({ ...slotForm, endTime: typeof v === "string" ? v : "" })}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              老师
            </label>
            <Input
              placeholder="可选"
              value={slotForm.teacherName}
              onChange={(e) => setSlotForm({ ...slotForm, teacherName: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* 删除课程确认 */}
      <Modal
        open={deletingSlot != null}
        title="删除课程"
        onClose={() => setDeletingSlot(null)}
        typewriter={false}
        width={380}
        footer={
          <>
            <Button onClick={() => setDeletingSlot(null)}>取消</Button>
            <Button type="primary" danger onClick={removeSlot}>
              删除
            </Button>
          </>
        }
      >
        确定删除这门课程吗？
      </Modal>
    </div>
  );
}
