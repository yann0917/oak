import { notFound } from "next/navigation";
import GardenActivity from "@/components/garden/GardenActivity";
import { ACTIVITY_MAP } from "@/lib/garden/registry";

export default async function GardenActivityPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!ACTIVITY_MAP[type]) notFound();
  return <GardenActivity type={type} />;
}
