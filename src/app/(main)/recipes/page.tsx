"use client";

// 食谱库：上游《像老乡鸡那样做饭》（GitHub CookLikeHOC）定期同步的只读菜谱
// 分类 = 仓库顶层目录名，菜名 = md 文件名；左侧分类导航（移动端为顶部筛选片）+ 封面卡片网格
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Pagination, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { Perm } from "@/components/Perm";
import { WhatToEatModal } from "@/components/WhatToEatModal";
import { SOURCE_LABELS } from "@/lib/recipes/sources";

interface RecipeCategory {
  name: string;
  count: number;
}

interface RecipeItem {
  id: number;
  source: string;
  category: string;
  name: string;
  image: string;
}

interface SyncSourceStatus {
  source: string;
  label: string;
  count: number;
  lastSyncedAt: string;
  lastStatus: string;
  lastError: string;
}

interface SyncStatus {
  total: number;
  syncing: boolean;
  current: string;
  sources: SyncSourceStatus[];
}

/** 每页菜谱数（4 列网格 → 6 行） */
const PAGE_SIZE = 24;

function fmtSyncTime(iso: string): string {
  if (!iso) return "从未同步";
  return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 手动同步徽章：同步是后台任务，这里轮询状态直到结束；仅对拥有同步权限的人可见 */
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
    api<SyncStatus>("/api/recipes/sync")
      .then((s) => {
        setStatus(s);
        if (s.syncing && !pollRef.current) {
          pollRef.current = setInterval(load, 3000); // 同步进行中：3 秒轮询进度
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
      const r = await api<{ started: boolean }>("/api/recipes/sync", { method: "POST" });
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
            {status?.total ? `共 ${status.total} 道 · ` : ""}
            {latest ? `上次同步 ${fmtSyncTime(latest)}` : ""}
            {errCount > 0 && <span className="text-red-500">（{errCount} 个源异常）</span>}
          </>
        )}
      </span>
      <Button size="small" onClick={sync} disabled={syncing}>
        {syncing ? "同步中…" : "同步菜谱"}
      </Button>
    </div>
  );
}

export default function RecipesPage() {
  const [list, setList] = useState<RecipeItem[]>([]);
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); // 输入框即时值
  const [query, setQuery] = useState(""); // 防抖后真正发请求的关键词
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const [matched, setMatched] = useState(0); // 当前筛选下的命中总数（分页用）
  const [eatOpen, setEatOpen] = useState(false);
  const reqRef = useRef(0);

  // 输入防抖：搜索要扫正文 markdown，每敲一个字都查一次太浪费
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
    if (cat) params.set("category", cat);
    const data = await api<{ categories: RecipeCategory[]; total: number; page: number; list: RecipeItem[] }>(
      `/api/recipes?${params.toString()}`
    );
    if (seq !== reqRef.current) return; // 丢弃过期响应（连打时先发的可能后到）
    setCategories(data.categories);
    setMatched(data.total);
    setPage(data.page);
    setList(data.list);
  }, [query, cat, page]);

  useEffect(() => {
    load()
      .catch((e) => Notification.error(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const total = useMemo(() => categories.reduce((sum, c) => sum + c.count, 0), [categories]);
  const hasFilter = !!query || !!cat;
  // 换分类也回到第 1 页：在事件处理里改，避免 effect 内同步 setState 引起的级联渲染
  const pickCat = (v: string) => {
    setCat(v);
    setPage(1);
  };

  const catButton = (name: string, count: number, active: boolean, onClick: () => void, key?: string) => (
    <button
      key={key ?? name}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm transition-colors text-left ${
        active ? "bg-warm font-bold" : "text-secondary hover:bg-warm-soft"
      }`}
    >
      {name} <span className="opacity-60">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Title size="middle" color="app-orange">
          食谱
        </Title>
        {total > 0 && (
          <Tag size="small" variant="soft" color="app-yellow">
            共 {total} 道
          </Tag>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Button size="small" type="primary" onClick={() => setEatOpen(true)}>
            今天吃什么
          </Button>
          <Perm perm="api:recipes:sync-post">
            <SyncBadge />
          </Perm>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-44 max-w-72">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索菜名或食材、步骤…" aria-label="搜索菜谱" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-secondary">加载中…</div>
      ) : total === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-2">🍳</div>
          <p className="text-secondary text-sm">食谱库还是空的，点击右上角「同步菜谱」从上游仓库拉取</p>
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          <aside className="hidden lg:block w-44 shrink-0">
            <div className="sticky top-4 flex flex-col gap-1">
              {catButton("全部", total, !cat, () => pickCat(""))}
              {categories.map((c) => catButton(c.name, c.count, cat === c.name, () => pickCat(cat === c.name ? "" : c.name)))}
            </div>
          </aside>

          <section className="flex-1 min-w-0">
            <div className="lg:hidden flex flex-wrap gap-2 mb-3">
              {catButton("全部", total, !cat, () => pickCat(""))}
              {categories.map((c) => catButton(c.name, c.count, cat === c.name, () => pickCat(cat === c.name ? "" : c.name)))}
            </div>

            {list.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="text-4xl mb-2">🍽️</div>
                <p className="text-secondary text-sm">
                  {query ? "没有找到相关菜谱，换个关键词试试" : `「${cat}」下没有匹配的菜谱`}
                </p>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {list.map((item) => (
                    <Link key={item.id} href={`/recipes/${item.id}`} className="group">
                      <Card className="p-2 h-full transition-transform group-hover:-translate-y-0.5">
                        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-warm-soft flex items-center justify-center">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl">🥘</span>
                          )}
                        </div>
                        <div className="px-1 pt-2 pb-1">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--animal-text-color)" }}>
                            {item.name}
                          </div>
                          <div className="text-xs text-secondary mt-0.5 truncate">
                            {item.category} · {SOURCE_LABELS[item.source] ?? item.source}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
                {hasFilter && (
                  <p className="text-xs text-secondary text-center pt-3">
                    筛选命中 {matched} 道 / 全部 {total} 道
                  </p>
                )}
                {matched > PAGE_SIZE && (
                  <div className="flex justify-center pt-1">
                    <Pagination total={matched} current={page} pageSize={PAGE_SIZE} showTotal onChange={setPage} />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <WhatToEatModal open={eatOpen} onClose={() => setEatOpen(false)} />
    </div>
  );
}
