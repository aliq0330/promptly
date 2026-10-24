"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, SlidersHorizontal, SquareTerminal, type LucideIcon } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { findTool } from "@/lib/ai-tool-catalog";
import { contentTypeLabelKey, taxonomyLabel } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatRelativeTime, presetHref, promptHref } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Preset, Prompt } from "@/types";

type Source = { kind: "prompt"; item: Prompt } | { kind: "preset"; item: Preset };

const KIND: Record<Source["kind"], { icon: LucideIcon; label: TranslationKey }> = {
  prompt: { icon: SquareTerminal, label: "studio.source.prompt" },
  preset: { icon: SlidersHorizontal, label: "studio.source.preset" },
};

/**
 * One picked source in Studio as a compact row (docs/history/228-*, the canvas design): a thumbnail, a small-caps line
 * ("PROMPT · MIDJOURNEY" / "HAZIR AYAR · GÖRSEL"), the title, who made it and when, an optional `badge` (the preset's fit) and
 * Değiştir / Orijinali aç / Kaldır on the right. `bare` drops the row's own border (a preset sits inside its own framed layer).
 */
export function StudioSourceCard({
  source,
  onChange,
  onRemove,
  badge,
  bare = false,
}: {
  source: Source;
  onChange: () => void;
  onRemove: () => void;
  badge?: ReactNode;
  bare?: boolean;
}) {
  const { t, language } = useTranslation();
  const { icon: Icon, label } = KIND[source.kind];
  const item = source.item;
  const creator = source.kind === "prompt" ? source.item.author : source.item.creator;
  const imageUrl = source.kind === "prompt" ? (source.item.media[0]?.url ?? null) : source.item.coverUrl;
  const href = source.kind === "prompt" ? promptHref(source.item) : presetHref(source.item);
  const typeText = taxonomyLabel(contentTypeLabelKey(source.item.contentType), language);
  const firstTool = item.tools[0] ? findTool(item.tools[0].split(":")[0]) : null;
  const detail = source.kind === "prompt" && firstTool ? firstTool.name : typeText;

  return (
    <div className={cn("flex items-center gap-3", !bare && "rounded-lg border border-border-soft p-3")}>
      <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-soft sm:h-16 sm:w-16">
        {imageUrl ? <StorageImg src={imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon size={24} className="text-text-muted" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-caption font-bold uppercase tracking-[0.06em] text-text-muted">
          {t(label)} · {detail}
        </p>
        <p className="line-clamp-2 break-words font-display text-[1.0625rem] font-bold leading-snug text-text">{item.title}</p>
        <p className="truncate text-small text-text-muted">
          @{creator.username}
          {item.createdAt && ` · ${formatRelativeTime(item.createdAt, language)}`}
        </p>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end text-small font-semibold">
        <button type="button" onClick={onChange} className="min-h-9 text-primary hover:underline">
          {t("studio.change")}
        </button>
        <Link href={href} target="_blank" rel="noopener" className="hidden min-h-9 items-center gap-1 text-primary hover:underline sm:inline-flex">
          <ExternalLink size={12} aria-hidden /> {t("studio.openOriginal")}
        </Link>
        <button type="button" onClick={onRemove} className="min-h-9 font-medium text-text-muted hover:text-text">
          {t("studio.remove")}
        </button>
      </div>
    </div>
  );
}
