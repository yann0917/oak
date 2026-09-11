"use client";

// 今天练什么：随机抽 1 个动作，或出一张 4-6 个小课表；纯随机不烧 AI
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Tag } from "animal-island-ui";
import { api } from "@/lib/api";
import { bodyPartLabel, equipmentLabel } from "@/lib/exercises/sources";

interface TrainPick {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  image: string;
  gif: string;
}

interface TrainResult {
  mode: "single" | "plan";
  picks: TrainPick[];
  note?: string;
}

export function WhatToTrainModal({
  open,
  onClose,
  bodyPart,
  equipment,
}: {
  open: boolean;
  onClose: () => void;
  bodyPart?: string;
  equipment?: string;
}) {
  const [mode, setMode] = useState<"single" | "plan">("plan");
  const [result, setResult] = useState<TrainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(
        await api<TrainResult>("/api/exercises/suggest", {
          method: "POST",
          body: JSON.stringify({ bodyPart, equipment, mode }),
        })
      );
    } catch (e: any) {
      setError(e.message || "推荐失败，再试一次吧");
    } finally {
      setLoading(false);
    }
  }, [bodyPart, equipment, mode]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="今天练什么 💪"
      typewriter={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button size="small" onClick={() => setMode(mode === "plan" ? "single" : "plan")} disabled={loading}>
            {mode === "plan" ? "只要一个" : "来张课表"}
          </Button>
          <Button size="small" onClick={load} disabled={loading}>
            换一批
          </Button>
          <Button size="small" type="primary" onClick={onClose}>
            开练
          </Button>
        </div>
      }
    >
      <div className="space-y-3 min-w-72">
        {(bodyPart || equipment) && (
          <div className="text-xs text-secondary bg-warm-soft rounded-lg p-2">
            按当前筛选：
            {bodyPart ? bodyPartLabel(bodyPart) : ""}
            {bodyPart && equipment ? " · " : ""}
            {equipment ? equipmentLabel(equipment) : ""}
          </div>
        )}
        {loading ? (
          <div className="text-center py-8 text-sm text-secondary animate-pulse">正在翻动作库，帮你挑几个…</div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-red-500">{error}</div>
        ) : result ? (
          <>
            {result.picks.length > 1 && (
              <div className="text-xs font-bold text-secondary">
                小课表 · 共 {result.picks.length} 个动作
              </div>
            )}
            {result.picks.map((p, i) => (
              <Link
                key={p.id}
                href={`/gym/${p.id}`}
                onClick={onClose}
                className="flex gap-3 items-start p-2 rounded-xl hover:bg-warm-soft transition-colors"
              >
                {result.picks.length > 1 && (
                  <span className="w-5 h-5 rounded-full bg-warm text-xs flex items-center justify-center shrink-0 mt-1 font-bold">
                    {i + 1}
                  </span>
                )}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-warm-soft shrink-0 flex items-center justify-center">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🏋️</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: "var(--animal-text-color)" }}>
                      {p.name}
                    </span>
                    <Tag size="small" variant="soft" color="app-yellow">
                      {bodyPartLabel(p.bodyPart)}
                    </Tag>
                    <Tag size="small" variant="soft" color="app-blue">
                      {equipmentLabel(p.equipment)}
                    </Tag>
                  </div>
                </div>
              </Link>
            ))}
            {!result.picks.length && (
              <div className="text-center py-8 text-sm text-secondary">{result.note ?? "没有推荐结果"}</div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
