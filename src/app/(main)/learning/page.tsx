import LearningTabs from "@/components/LearningTabs";

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  return <LearningTabs initialTab={Array.isArray(tab) ? tab[0] : tab} />;
}
