import { notFound } from "next/navigation";
import GardenActivity from "@/components/garden/GardenActivity";
import GardenIdiom from "@/components/garden/GardenIdiom";
import { ACTIVITY_MAP } from "@/lib/garden/registry";

export default async function GardenActivityPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!ACTIVITY_MAP[type]) notFound();
  // 成语卡片走独立讲故事的页面，其余活动走统一出题流程
  if (type === "idioms") return <GardenIdiom />;
  return <GardenActivity type={type} />;
}
