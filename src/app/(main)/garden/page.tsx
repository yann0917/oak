import GardenHome from "@/components/garden/GardenHome";

export default async function GardenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return <GardenHome initialTab={Array.isArray(tab) ? tab[0] : tab} />;
}
