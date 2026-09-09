"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Tag, Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { speciesMeta } from "@/lib/garden/species";
import { nextFreeSlot } from "@/lib/garden/plotLayout";
import { remainingToRipe, type Stage } from "@/lib/garden/growth";
import { speak } from "@/lib/garden/speech";
import type { PlotView } from "@/components/garden/GardenScene3D";

// 与 @/lib/garden/inventory 的 WATER 同值。inventory.ts 会 import @/db（better-sqlite3），
// 客户端组件不能从那里导入（会把 node 内置模块拉进浏览器包），故这里只留字面量。
const WATER = "water";

const GardenScene3D = dynamic(() => import("@/components/garden/GardenScene3D"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm">花园正在生长…</div>,
});

interface ItemRow {
  itemKey: string;
  count: number;
}

interface PlotsResponse {
  plots: (PlotView & {
    waterCount: number;
    stageStartedAt: string;
    plantedAt: string;
  })[];
  items: ItemRow[];
  now: number;
  capacity: number;
}

export default function GardenTab({ childId }: { childId: number }) {
  const [data, setData] = useState<PlotsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await api<PlotsResponse>(`/api/garden-plots?childId=${childId}`));
    } catch (e: any) {
      toast(e.message || "花园加载失败", "error");
    }
  }, [childId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const items = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of data?.items ?? []) map.set(it.itemKey, it.count);
    return map;
  }, [data]);

  // 稳定引用：3D 场景按 plots 重建植物，每次渲染新建数组会反复重建
  const plots = useMemo(() => data?.plots ?? [], [data]);

  const selected = plots.find((p) => p.id === selectedId) ?? null;
  const seeds = [...items.entries()].filter(([k, n]) => k.startsWith("seed:") && n > 0);

  // 到成熟（可收获）还差多久：跨阶段累计，浇水只会让它变小。
  // 不能用服务端的 remainingMs——那是到下一阶段的时间，浇水推进阶段后反而会变大。
  const ripeMs =
    selected && data
      ? remainingToRipe(
          {
            stage: selected.stage as Stage,
            stageStartedAt: Date.parse(selected.stageStartedAt),
            waterCount: selected.waterCount,
          },
          data.now
        )
      : 0;

  // 选中植物时朗读它的信息（孩子不识字，靠 TTS 听懂）
  useEffect(() => {
    if (!selected) return;
    const meta = speciesMeta(selected.species);
    const label = selected.nickname || meta.name;
    const stageText = selected.stage >= 4 ? "成熟啦，可以收获" : `还要 ${Math.ceil(ripeMs / 3600000)} 小时`;
    void speak(`${label}，${stageText}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 切换选中时把起名草稿同步成当前名字（重新加载数据时不覆盖正在输入的内容）
  useEffect(() => {
    setNameDraft(selected?.nickname ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /** 执行一次花园操作；返回是否成功（拖动落库失败时场景据此复位） */
  const act = async (body: Record<string, unknown>, id?: number): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      if (id == null) {
        await api("/api/garden-plots", { method: "POST", body: JSON.stringify(body) });
      } else {
        await api(`/api/garden-plots/${id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      // 收获成功后地块已消失，顺手清掉选中态，避免悬空的 id 又套到下一株新种的植物上
      if (body.action === "harvest") setSelectedId(null);
      await reload();
      return true;
    } catch (e: any) {
      toast(e.message || "操作失败", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const plant = () => {
    if (!data || seeds.length === 0) {
      toast("还没有种子，先去练一轮吧", "warning");
      return;
    }
    const slot = nextFreeSlot(plots.map((p) => p.slot));
    if (slot == null) {
      toast("花园满啦", "warning");
      return;
    }
    const [key] = seeds[0];
    void act({ childId, slot, species: key.slice("seed:".length) });
  };

  return (
    <div className="relative h-[70vh] rounded-3xl overflow-hidden border-2" style={{ borderColor: "#e8dcc8" }}>
      <GardenScene3D
        plots={plots}
        selectedId={selectedId}
        arranging={arranging}
        onSelect={setSelectedId}
        onMoveSlot={(id, slot) => act({ action: "move", slot }, id)}
      />

      {/* 库存栏 */}
      <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
        <Tag color="app-teal" variant="solid">
          💧 水滴 {items.get(WATER) ?? 0}
        </Tag>
        {seeds.map(([k, n]) => {
          const meta = speciesMeta(k.slice("seed:".length));
          return (
            <Tag key={k} color="app-green" variant="solid">
              {meta.emoji} {meta.name}种子 ×{n}
            </Tag>
          );
        })}
      </div>

      {/* 底部操作 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        <Button onClick={plant} disabled={busy}>
          种下一颗
        </Button>
        <Button onClick={() => setArranging((v) => !v)} disabled={busy}>
          {arranging ? "完成整理" : "整理花园"}
        </Button>
        {selected && (
          <>
            <Button
              onClick={() => void act({ action: "water" }, selected.id)}
              disabled={busy || selected.stage >= 4}
            >
              浇水
            </Button>
            <Button
              onClick={() => void act({ action: "harvest" }, selected.id)}
              disabled={busy || selected.stage < 4}
            >
              收获
            </Button>
          </>
        )}
      </div>

      {/* 选中信息（不依赖识字：图标 + 大字） */}
      {selected && (
        <Card className="absolute bottom-16 left-1/2 -translate-x-1/2 w-64">
          <div className="text-center py-1">
            <div className="text-3xl">{speciesMeta(selected.species).emoji}</div>
            <div className="font-bold mt-1">
              {selected.nickname || speciesMeta(selected.species).name}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              {selected.stage >= 4
                ? "成熟啦，可以收获"
                : `还要 ${Math.ceil(ripeMs / 3600000)} 小时`}
            </div>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={12}
              placeholder="给它起个名字"
              className="mt-2 w-full text-center text-sm rounded-full border px-3 py-1"
              style={{ borderColor: "#e8dcc8" }}
            />
            <Button
              className="mt-2"
              disabled={busy}
              onClick={() => void act({ action: "rename", nickname: nameDraft }, selected.id)}
            >
              起名
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
