import { notFound } from "next/navigation";
import PingPong from "@/components/games/PingPong";
import FruitSlice from "@/components/games/FruitSlice";
import GestureDance from "@/components/games/GestureDance";
import RockPaperScissors from "@/components/games/RockPaperScissors";
import BubblePop from "@/components/games/BubblePop";
import JumpScore from "@/components/games/JumpScore";
import MagicWand from "@/components/games/MagicWand";
import TrafficCommander from "@/components/games/TrafficCommander";
import { GAME_MAP } from "@/lib/games/registry";

const RENDERERS: Record<string, React.ComponentType> = {
  "ping-pong": PingPong,
  "fruit-slice": FruitSlice,
  "gesture-dance": GestureDance,
  "rock-paper-scissors": RockPaperScissors,
  "bubble-pop": BubblePop,
  "jump-score": JumpScore,
  "magic-wand": MagicWand,
  "traffic-commander": TrafficCommander,
};

export default async function GardenGamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!GAME_MAP[game]) notFound();
  const Game = RENDERERS[game];
  return <Game />;
}
