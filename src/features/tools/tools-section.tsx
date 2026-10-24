"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Wrench } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { AI_TOOLS, searchTools, type AiTool } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchToolPostCounts } from "@/lib/supabase/tool-counts";
import { formatCount, toolHref } from "@/lib/utils";
import { ToolFollowButton } from "./tool-follow-button";

/**
 * Keşfet → AI Araçları (docs/history/221-*): the catalog's tools, the ones with the most public posts first, each with its
 * post count, a link to the tool's page (the tool's posts) and the follow button — following a tool is how it becomes a Home
 * filter ("Takip Ettiklerim") and a "Sana özel" signal. The counts are real (`discover_tool_counts`); when they cannot be
 * loaded the tools are listed without counts rather than with an invented number.
 */
export function ToolsSection({ query = "" }: { query?: string }) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number> | null | "failed">(null);

  useEffect(() => {
    let cancelled = false;
    fetchToolPostCounts()
      .then((next) => !cancelled && setCounts(next))
      .catch((err) => {
        console.error("fetchToolPostCounts", err);
        if (!cancelled) setCounts("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const known = counts && counts !== "failed" ? counts : null;
  const tools = useMemo(() => {
    const matched = searchTools(AI_TOOLS.filter((tool) => tool.isActive), query);
    // Most posts first; the catalog order breaks ties (and is the whole order while the counts are not there).
    return known ? [...matched].sort((a, b) => (known[b.id] ?? 0) - (known[a.id] ?? 0)) : matched;
  }, [query, known]);

  return (
    <section className="space-y-4" data-tools-section>
      <p className="text-small text-text-muted">{t("discover.toolsIntro")}</p>
      {tools.length === 0 ? (
        <EmptyState icon={Wrench} title={t("discover.toolsNoMatch")} compact />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} postCount={known ? (known[tool.id] ?? 0) : null} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One tool: icon tile + name + provider (+ count) linking to the tool's page, and its follow button. */
export function ToolRow({ tool, postCount }: { tool: AiTool; postCount: number | null }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-3 shadow-card">
      <Link href={toolHref(tool.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Bot size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-semibold text-text">{tool.name}</span>
          <span className="block truncate text-caption text-text-muted">{tool.provider}</span>
          {postCount !== null && <span className="block truncate text-caption font-medium text-text-secondary">{t("discover.toolPosts", { count: formatCount(postCount) })}</span>}
        </span>
      </Link>
      <ToolFollowButton toolId={tool.id} />
    </li>
  );
}
