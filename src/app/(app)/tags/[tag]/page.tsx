import { notFound } from "next/navigation";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { getTag, mockTags } from "@/mocks/tags";
import { getPromptsByTag } from "@/mocks/prompts";

export function generateStaticParams() {
  return mockTags.map((tag) => ({ tag: tag.slug }));
}

export default async function TagDetailPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const exists = mockTags.some((tag) => tag.slug === slug);
  if (!exists) notFound();

  const tag = getTag(slug);
  const prompts = [...getPromptsByTag(slug)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">#{tag.label}</h1>
      <PromptGrid prompts={prompts} />
    </div>
  );
}
