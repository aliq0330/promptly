import { notFound } from "next/navigation";
import { PromptDetailView } from "@/features/prompts/prompt-detail-view";
import { getPromptById, mockPrompts } from "@/mocks/prompts";

export function generateStaticParams() {
  return mockPrompts.map((prompt) => ({ id: prompt.id }));
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prompt = getPromptById(id);
  if (!prompt) notFound();

  return <PromptDetailView prompt={prompt} />;
}
