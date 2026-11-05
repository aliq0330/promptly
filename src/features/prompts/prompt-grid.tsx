"use client";

import { SquareTerminal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PromptCard } from "./prompt-card";
import type { Prompt } from "@/types";
import { Reveal } from "@/components/ui/reveal";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

type PromptGridProps = { prompts: Prompt[] };

/**
 * CSS multi-column masonry: each card keeps its own natural height instead
 * of being stretched to match the tallest card in a CSS Grid row (the
 * cause of the large empty gaps under short cards on tablet/desktop).
 * `break-inside-avoid` stops a card from being split across two columns.
 * Pure CSS — reflows correctly on resize/orientation change with no JS
 * measurement needed.
 */
export function PromptGrid(props: PromptGridProps) {
  const { t } = useTranslation();
  const items: { key: string; node: React.ReactNode }[] = props.prompts.map((prompt) => ({
    key: prompt.id,
    node: <PromptCard prompt={prompt} />,
  }));

  if (items.length === 0) {
    return (
      <EmptyState icon={SquareTerminal} title={t("prompt.noPromptsToShow")} compact />
    );
  }

  return (
    <ContentGrid>
      {items.map((item, index) => (
        <Reveal key={item.key} index={index} className={CONTENT_GRID_ITEM_CLASS}>
          {item.node}
        </Reveal>
      ))}
    </ContentGrid>
  );
}
