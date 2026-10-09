"use client";

import Link from "next/link";
import { Blocks, ExternalLink, SlidersHorizontal, SquareTerminal, X, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { contentTypeLabelKey, taxonomyLabel } from "@/lib/content-taxonomy";
import { formatRelativeTime, generatorHref, presetHref, profileHref, promptHref } from "@/lib/utils";
import type { Generator, Preset, Prompt } from "@/types";

type Source = { kind: "prompt"; item: Prompt } | { kind: "generator"; item: Generator } | { kind: "preset"; item: Preset };

const KIND: Record<Source["kind"], { icon: LucideIcon; label: TranslationKey }> = {
  prompt: { icon: SquareTerminal, label: "studio.source.prompt" },
  generator: { icon: Blocks, label: "studio.source.generator" },
  preset: { icon: SlidersHorizontal, label: "studio.source.preset" },
};

/**
 * The picked source in Studio, shown like the content it is: thumbnail (when it
 * has one), type, title, who shared it and when, a short description, tags, and
 * a link to the original. Change / remove stay on the card.
 */
export function StudioSourceCard({ source, onChange, onRemove }: { source: Source; onChange: () => void; onRemove: () => void }) {
  const { t, language } = useTranslation();
  const { icon: Icon, label } = KIND[source.kind];
  const item = source.item;
  const creator = source.kind === "prompt" ? source.item.author : source.item.creator;
  const imageUrl = source.kind === "prompt" ? (source.item.media[0]?.url ?? null) : source.kind === "generator" ? (source.item.media[0]?.url ?? source.item.coverUrl) : source.item.coverUrl;
  const href = source.kind === "prompt" ? promptHref(source.item) : source.kind === "generator" ? generatorHref(source.item) : presetHref(source.item);
  const createdAt = source.item.createdAt;
  const typeText = taxonomyLabel(contentTypeLabelKey(source.item.contentType), language);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-lg border border-border-soft bg-surface-soft p-3">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-border-soft bg-surface sm:h-24 sm:w-24">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user media of any origin, small thumbnail
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon size={26} className="text-text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <ContentTypeLabel icon={Icon} label={t(label)} detail={typeText} />
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-text">{item.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
            <Avatar src={creator.avatarUrl} alt="" size={18} />
            <Link href={profileHref(creator)} className="min-w-0 truncate font-medium text-text-secondary hover:text-primary hover:underline">
              {creator.displayName || creator.username}
            </Link>
            {createdAt && <span className="shrink-0">· {formatRelativeTime(createdAt, language)}</span>}
          </p>
        </div>
      </div>
      {item.description && <p className="line-clamp-3 break-words text-small text-text-secondary">{item.description}</p>}
      {item.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("studio.sourceTags")}>
          {item.tags.slice(0, 5).map((tag) => (
            <li key={tag.slug} className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-medium text-text-secondary">
              #{tag.label}
            </li>
          ))}
          {item.tags.length > 5 && <li className="px-1 py-0.5 text-caption text-text-muted">+{item.tags.length - 5}</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={onChange} className="min-h-9 text-small font-medium text-primary hover:underline">
          {t("studio.change")}
        </button>
        <Link href={href} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 text-small font-medium text-text-secondary hover:text-text">
          <ExternalLink size={13} aria-hidden /> {t("studio.openOriginal")}
        </Link>
        <button type="button" onClick={onRemove} className="inline-flex min-h-9 items-center gap-1 text-small font-medium text-text-secondary hover:text-text">
          <X size={14} aria-hidden /> {t("studio.remove")}
        </button>
      </div>
    </div>
  );
}
