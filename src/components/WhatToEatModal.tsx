"use client";

// 今天吃什么：AI 从食谱库搭配一餐（未配 AI 降级随机），点菜直达详情
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Tag } from "animal-island-ui";
import { api } from "@/lib/api";

interface SuggestPick {
  id: number;
  name: string;
  category: string;
  image: string;
  reason: string;
}

interface SuggestResult {
  picks: SuggestPick[];
  aiUsed: boolean;
  note?: string;
}

export function WhatToEatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await api<SuggestResult>("/api/recipes/suggest", { method: "POST" }));
    } catch (e: any) {
      setError(e.message || "推荐失败，再试一次吧");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="今天吃什么 🍚"
      typewriter={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button size="small" onClick={load} disabled={loading}>
            换一批
          </Button>
          <Button size="small" type="primary" onClick={onClose}>
            就这么定
          </Button>
        </div>
      }
    >
      <div className="space-y-3 min-w-72">
        {loading ? (
          <div className="text-center py-8 text-sm text-secondary animate-pulse">AI 正在翻菜谱，挑一餐搭配…</div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-red-500">{error}</div>
        ) : result ? (
          <>
            {!result.aiUsed && result.note && <div className="text-xs text-secondary bg-warm-soft rounded-lg p-2">{result.note}</div>}
            {result.picks.map((p) => (
              <Link key={p.id} href={`/recipes/${p.id}`} onClick={onClose} className="flex gap-3 items-start p-2 rounded-xl hover:bg-warm-soft transition-colors">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-warm-soft shrink-0 flex items-center justify-center">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🥘</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: "var(--animal-text-color)" }}>
                      {p.name}
                    </span>
                    <Tag size="small" variant="soft" color="app-yellow">
                      {p.category}
                    </Tag>
                  </div>
                  {p.reason && <p className="text-xs text-secondary mt-1 leading-5">{p.reason}</p>}
                </div>
              </Link>
            ))}
            {!result.picks.length && <div className="text-center py-8 text-sm text-secondary">{result.note ?? "没有推荐结果"}</div>}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
