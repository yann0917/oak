import { Title } from "animal-island-ui";
import GamesMenu from "@/components/games/GamesMenu";

export default function GardenGamesPage() {
  return (
    <div>
      <Title size="middle" color="app-green">
        益智游戏
      </Title>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        和娃一起动手动脑：摄像头体感 + 纯手玩，怎么玩都开心
      </p>
      <GamesMenu />
    </div>
  );
}
