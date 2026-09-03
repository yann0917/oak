"use client";

import { Title } from "animal-island-ui";
import GamesMenu from "@/components/games/GamesMenu";
import { MemberFilter, useMemberSelect } from "@/components/MemberFilter";

export default function GardenGamesPage() {
  const { children: kids, memberId, setMemberId } = useMemberSelect();
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
        <Title size="middle" color="app-green">
          益智游戏
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} allowAll={false} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        和娃一起动手动脑：摄像头体感 + 纯手玩，怎么玩都开心
      </p>
      <GamesMenu />
    </div>
  );
}
