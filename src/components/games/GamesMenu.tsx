"use client";

// 益智游戏菜单：四款体感/互动游戏卡片，从 registry 派生。
// 游戏全部支持鼠标/按钮模式，没有摄像头也能玩。
import { useRouter } from "next/navigation";
import { Card, Tag } from "animal-island-ui";
import { ACTIVITY_PALETTE } from "@/lib/garden/registry";
import { GAMES } from "@/lib/games/registry";

export default function GamesMenu() {
  const router = useRouter();
  return (
    <div>
      <div
        className="rounded-3xl border-2 border-dashed px-4 py-3 mb-4 text-sm"
        style={{ borderColor: "var(--animal-border-color-light)" }}
      >
        <span className="font-bold" style={{ color: "var(--animal-text-color)" }}>
          🤸 摄像头体感玩法：
        </span>
        <span style={{ color: "var(--animal-text-color-secondary)" }}>
          面向摄像头就可以用手控制游戏，体力也锻炼啦。没有摄像头也不受影响，每一款都有鼠标/按钮玩法。
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {GAMES.map((g) => (
          <Card key={g.key} hoverable onClick={() => router.push(`/garden/games/${g.key}`)}>
            <div className="flex flex-col items-center text-center gap-2 py-3 px-1">
              <div
                className="w-14 h-14 rounded-3xl flex items-center justify-center text-3xl font-black"
                style={{
                  background: ACTIVITY_PALETTE[g.color] ?? "var(--animal-primary-color)",
                  color: "#fff",
                }}
              >
                {g.glyph}
              </div>
              <div className="font-bold" style={{ color: "var(--animal-text-color)" }}>
                {g.name}
              </div>
              <p className="text-xs leading-snug min-h-8" style={{ color: "var(--animal-text-color-secondary)" }}>
                {g.desc}
              </p>
              <Tag size="small" variant="soft">
                体感 · {g.model}
              </Tag>
              <Tag size="small" variant="soft">
                鼠标可用
              </Tag>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
