"use client";

import { useSearchParams } from "next/navigation";
import { Code2, FileText, Image as ImageIcon, Music, Video, type LucideIcon } from "lucide-react";
import { BAND_PRIMARY_CLASS } from "@/features/content/detail-parts";
import { TopicKicker, TopicPage } from "@/features/content/topic-page";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { findTool, type AiTool } from "@/lib/ai-tool-catalog";
import { toolHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ToolFollowButton } from "./tool-follow-button";

const TOOL_ICON: Record<AiTool["icon"], LucideIcon> = { image: ImageIcon, text: FileText, audio: Music, video: Video, code: Code2 };

/**
 * An AI tool's page (`/tools/local?id=<catalog id>`, docs/history/211-*): the topic-page template listing every post that
 * recommends the tool (any of its models), with Takip Et (`tool_follows` — a "Sana özel" signal) and Paylaş.
 */
export function ToolView() {
  const { t } = useTranslation();
  const id = useSearchParams().get("id");
  const tool = id ? findTool(id) : null;

  if (!tool) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("tool.notFound")}</h1>
        <p className="text-sm text-text-muted">{t("tool.notFoundBody")}</p>
      </div>
    );
  }

  return (
    <TopicPage
      key={tool.id}
      filter={{ taxonomy: EMPTY_TAXONOMY_FILTER, tool: tool.id }}
      kicker={
        <TopicKicker>
          {t("tool.kicker")} · {tool.provider}
        </TopicKicker>
      }
      title={tool.name}
      icon={TOOL_ICON[tool.icon]}
      countKey="tool.usedInCount"
      primary={<ToolFollowButton toolId={tool.id} className={BAND_PRIMARY_CLASS} />}
      shareUrl={toolHref(tool.id)}
      shareTitle={tool.name}
      actionsLabel={t("tool.actionsAria")}
    />
  );
}
