import EducationTabs from "@/components/EducationTabs";

export default async function EducationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  return <EducationTabs initialTab={Array.isArray(tab) ? tab[0] : tab} />;
}
