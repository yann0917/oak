"use client";

// 健身馆：外部 exercises-dataset 同步的只读动作库
// 部位/器械筛选 + 搜索 + 缩略图网格；「今天练什么」按当前筛选抽动作
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Pagination, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { Perm } from "@/components/Perm";
import { WhatToTrainModal } from "@/components/WhatToTrainModal";
import { bodyPartLabel, equipmentLabel, targetLabel } from "@/lib/exercises/sources";

interface Facet {
  name: string;
  count: number;
}

interface ExerciseItem {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  image: string;
}

interface SyncStatus {
  total: number;
  syncing: boolean;
  current: string;
  sources: { source: string; label: string; count: number; lastSyncedAt: string; lastStatus: string; lastError: string }[];
}

/** 每页动作数（4 列网格 → 6 行） */
const PAGE_SIZE = 24;

function fmtSyncTime(iso: string): string {
  if (!iso) return "从未同步";
  return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(() => {
    api<SyncStatus>("/api/exercises/sync")
      .then((s) => {
        setStatus(s);
        if (s.syncing && !pollRef.current) {
          pollRef.current = setInterval(load, 3000);
        }
        if (!s.syncing) stopPolling();
      })
      .catch(() => {});
  }, [stopPolling]);

  useEffect(() => {
    load();
    return stopPolling;
  }, [load, stopPolling]);

  const sync = async () => {
    try {
      const r = await api<{ started: boolean }>("/api/exercises/sync", { method: "POST" });
      Notification.info(r.started ? "同步已在后台开始，完成后状态自动刷新" : "同步已在进行中");
      load();
    } catch (e: any) {
      Notification.error(e.message);
    }
  };

  const latest = status?.sources.reduce((max, s) => (s.lastSyncedAt > max ? s.lastSyncedAt : max), "") ?? "";
  const errCount = status?.sources.filter((s) => s.lastStatus === "error").length ?? 0;
  const syncing = !!status?.syncing;

  return (
    <div className="flex items-center gap-2 text-sm text-secondary">
      <span className="hidden sm:inline">
        {syncing ? (
          <span className="animate-pulse">{status?.current ? `同步中：${status.current}` : "同步中…"}</span>
        ) : (
          <>
            {status?.total ? `共 ${status.total} 个 · ` : ""}
            {latest ? `上次同步 ${fmtSyncTime(latest)}` : ""}
            {errCount > 0 && <span className="text-red-500">（同步异常）</span>}
          </>
        )}
      </span>
      <Button size="small" onClick={sync} disabled={syncing}>
        {syncing ? "同步中…" : "同步动作"}
      </Button>
    </div>
  );
}

export default function GymPage() {
  const [list, setList] = useState<ExerciseItem[]>([]);
  const [bodyParts, setBodyParts] = useState<Facet[]>([]);
  const [equipments, setEquipments] = useState<Facet[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); // 输入框即时值
  const [query, setQuery] = useState(""); // 防抖后真正发请求的关键词
  const [part, setPart] = useState("");
  const [equip, setEquip] = useState("");
  const [page, setPage] = useState(1);
  const [matched, setMatched] = useState(0); // 当前筛选下的命中总数（分页用）
  const [trainOpen, setTrainOpen] = useState(false);
  const reqRef = useRef(0);

  // 输入防抖：搜索是整库 LIKE 扫描，每敲一个字都查一次太浪费
  // （关键词变了要回到第 1 页，沿用旧页码会落到空页）
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    const seq = ++reqRef.current;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set("q", query);
    if (part) params.set("bodyPart", part);
    if (equip) params.set("equipment", equip);
    const data = await api<{ bodyParts: Facet[]; equipments: Facet[]; total: number; page: number; list: ExerciseItem[] }>(
      `/api/exercises?${params.toString()}`
    );
    if (seq !== reqRef.current) return; // 丢弃过期响应（连打时先发的可能后到）
    setBodyParts(data.bodyParts);
    setEquipments(data.equipments);
    setMatched(data.total);
    setPage(data.page);
    setList(data.list);
  }, [query, part, equip, page]);

  useEffect(() => {
    load()
      .catch((e) => Notification.error(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const total = useMemo(() => bodyParts.reduce((sum, c) => sum + c.count, 0), [bodyParts]);
  const hasFilter = !!query || !!part || !!equip;
  // 换筛选也回到第 1 页：在事件处理里改，避免 effect 内同步 setState 引起的级联渲染
  const pickPart = (v: string) => {
    setPart(v);
    setPage(1);
  };
  const pickEquip = (v: string) => {
    setEquip(v);
    setPage(1);
  };

  const chip = (label: string, count: number, active: boolean, onClick: () => void, key: string) => (
    <button
      key={key}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs transition-colors ${
        active ? "bg-warm font-bold" : "text-secondary hover:bg-warm-soft"
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Title size="middle" color="app-orange">
          健身馆
        </Title>
        {total > 0 && (
          <Tag size="small" variant="soft" color="app-yellow">
            共 {total} 个动作
          </Tag>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Button size="small" type="primary" onClick={() => setTrainOpen(true)}>
            今天练什么
          </Button>
          <Perm perm="api:exercises:sync-post">
            <SyncBadge />
          </Perm>
        </div>
      </div>

      {total > 0 && (
        <p className="text-xs text-secondary">动作数据 MIT 授权 · 图片与动图 © Gym visual — https://gymvisual.com/</p>
      )}

      <div className="flex-1 min-w-44 max-w-72">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索动作名、目标肌…" aria-label="搜索动作" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-secondary">加载中…</div>
      ) : total === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-2">🏋️</div>
          <p className="text-secondary text-sm">健身馆还是空的，点击右上角「同步动作」从上游仓库拉取</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-secondary mr-1">部位</span>
            {chip("全部", total, !part, () => pickPart(""), "bp-all")}
            {bodyParts.map((c) => chip(bodyPartLabel(c.name), c.count, part === c.name, () => pickPart(part === c.name ? "" : c.name), `bp-${c.name}`))}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-secondary mr-1">器械</span>
            {chip("全部", total, !equip, () => pickEquip(""), "eq-all")}
            {equipments.map((c) =>
              chip(equipmentLabel(c.name), c.count, equip === c.name, () => pickEquip(equip === c.name ? "" : c.name), `eq-${c.name}`)
            )}
          </div>

          {list.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-4xl mb-2">💪</div>
              <p className="text-secondary text-sm">{query ? "没有找到相关动作，换个关键词试试" : "当前筛选下没有动作"}</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {list.map((item) => (
                  <Link key={item.id} href={`/gym/${item.id}`} className="group">
                    <Card className="p-2 h-full transition-transform group-hover:-translate-y-0.5">
                      <div className="aspect-square rounded-lg overflow-hidden bg-warm-soft flex items-center justify-center">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl">🏋️</span>
                        )}
                      </div>
                      <div className="px-1 pt-2 pb-1">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--animal-text-color)" }}>
                          {item.name}
                        </div>
                        <div className="text-xs text-secondary mt-0.5 truncate">
                          {bodyPartLabel(item.bodyPart)} · {equipmentLabel(item.equipment)}
                          {item.target ? ` · ${targetLabel(item.target)}` : ""}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
              {hasFilter && (
                <p className="text-xs text-secondary text-center">
                  筛选命中 {matched} 个 / 全部 {total} 个
                </p>
              )}
              {matched > PAGE_SIZE && (
                <div className="flex justify-center pt-1">
                  <Pagination total={matched} current={page} pageSize={PAGE_SIZE} showTotal onChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <WhatToTrainModal open={trainOpen} onClose={() => setTrainOpen(false)} bodyPart={part || undefined} equipment={equip || undefined} />
    </div>
  );
}
