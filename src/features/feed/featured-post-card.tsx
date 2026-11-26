"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "@/components/icons/check";
import { CircleCheck } from "@/components/icons/circle-check";
import { Copy } from "@/components/icons/copy";
import { Star } from "@/components/icons/star";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { PostTargetMenu } from "@/features/prompts/post-header";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { isFeaturedWorthy, pickFeatured } from "@/lib/following-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import { recordPromptCopy } from "@/lib/supabase/prompt-usage";
import { fetchResultCount, fetchWorksStatsByIds } from "@/lib/supabase/prompt-works";
import { cn, formatRelativeTime, profileHref, promptHref, tagHref } from "@/lib/utils";
import type { Prompt } from "@/types";
import { feedItemKey, type FeedItem } from "./types";

type Stats = Map<string, { yes: number; no: number }>;

/**
 * Sana Özel'in "Öne çıkan" kartları (docs/history/451-*): yüklenen promptların "Çalıştı mı?" sayıları toplu okunur; en az 10 oy ve %80 üstü
 * evet alanlardan, en çok 8 gönderide bir tanesi büyük karta çıkar (`pickFeatured`). Yeni sayfa gelince önceki seçimler kaymaz.
 */
export function useFeaturedPosts(items: FeedItem[], enabled: boolean): { keys: Set<string>; stats: Stats } {
  const [stats, setStats] = useState<Stats>(new Map());
  const asked = useRef(new Set<string>());
  const idsKey = enabled ? items.filter((item) => item.kind === "prompt").map((item) => item.data.id).join(",") : "";
  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(",").filter((id) => !asked.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => asked.current.add(id));
    let cancelled = false;
    void fetchWorksStatsByIds(ids).then((found) => {
      if (cancelled || found.size === 0) return;
      setStats((current) => new Map([...current, ...found]));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);
  const keys = useMemo(() => {
    if (!enabled) return new Set<string>();
    const byKey = new Map(items.map((item) => [feedItemKey(item), item]));
    return pickFeatured(
      items.map(feedItemKey),
      (key) => {
        const item = byKey.get(key);
        return item?.kind === "prompt" && isFeaturedWorthy(stats.get(item.data.id));
      },
    );
  }, [items, stats, enabled]);
  return { keys, stats };
}

/** Büyük kart: solda çıktı (görselsiz promptta metin), sağda bağlam · başlık · yazar · Çalıştı · sonuç sayısı · prompt metni · etiketler · eylemler. */
export function FeaturedPostCard({ prompt, stats, reason }: { prompt: Prompt; stats: { yes: number; no: number } | undefined; reason?: string }) {
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [results, setResults] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchResultCount(prompt.id).then((count) => {
      if (!cancelled) setResults(count);
    });
    return () => {
      cancelled = true;
    };
  }, [prompt.id]);

  const href = promptHref(prompt);
  const image = prompt.contentType === "image" ? prompt.media[0] : prompt.media[0];
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool ?? null;
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const total = stats ? stats.yes + stats.no : 0;
  const percent = stats && total > 0 ? Math.round((stats.yes / total) * 100) : 0;
  const segments = prompt.promptText.split(/(\{[^{}\s]{1,40}\})/).map((text) => ({ text, isVariable: /^\{[^{}\s]{1,40}\}$/.test(text) }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.promptText);
      setCopied(true);
      void recordPromptCopy(prompt.id);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-lg card-flat shadow-card sm:flex-row" data-featured-post="">
      <Link href={href} className="relative block aspect-[4/5] w-full shrink-0 overflow-hidden bg-surface-soft sm:w-[42%] sm:max-w-[360px]">
        {image ? (
          <StorageAppearanceImage src={image.url} alt={image.alt || prompt.title} color={image.color} placeholder={image.placeholder} sizes="(min-width: 640px) 360px, 100vw" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-start p-5 font-mono text-small leading-relaxed text-text-secondary">
            <span className="line-clamp-[12]">{prompt.promptText}</span>
          </span>
        )}
        {tool && (
          <span className="absolute left-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-sm bg-art-chip px-3 text-caption font-semibold text-on-art">
            <meta.icon size={12} aria-hidden />
            {tool}
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-1.5 text-small text-text-muted">
          <Star size={16} className="text-heart" aria-hidden />
          <span className="font-semibold text-text">{t("featured.label")}</span>
          {reason && <span className="truncate">· {reason}</span>}
          <span className="ml-auto">
            <PostTargetMenu prompt={prompt} />
          </span>
        </div>
        <Link href={href} className="font-display text-h1 font-extrabold leading-tight tracking-[-0.03em] text-text hover:text-primary-text">
          {prompt.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-small">
          <Link href={profileHref(prompt.author)} className="flex items-center gap-2 font-semibold text-text hover:text-primary-text">
            <Avatar src={prompt.author.avatarUrl} alt="" size={28} />
            {prompt.author.displayName}
          </Link>
          <span className="text-text-muted">· {formatRelativeTime(prompt.createdAt, language)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {total > 0 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-success-soft px-3 text-caption font-semibold text-success">
              <CircleCheck size={16} aria-hidden />
              {t("featured.worked", { percent, votes: total })}
            </span>
          )}
          {results !== null && results > 0 && <span className="text-small text-text-secondary">{t("featured.results", { count: results })}</span>}
        </div>
        {prompt.promptText.trim() && (
          <p className="line-clamp-4 rounded-md bg-surface-soft px-4 py-3 font-mono text-small leading-relaxed text-text-secondary">
            {segments.map((segment, index) => (
              <span key={index} className={cn(segment.isVariable && "font-semibold text-secondary")}>
                {segment.text}
              </span>
            ))}
          </p>
        )}
        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {prompt.tags.slice(0, 6).map((tag) => (
              <Link key={tag.slug} href={tagHref(tag)} className="text-small font-medium text-text-secondary hover:text-primary-text">
                #{tag.label}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1 border-t border-border-soft pt-3">
          <PromptCardFooter prompt={prompt} />
          <Button className="ml-auto gap-2" onClick={() => void copy()} aria-live="polite">
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? t("featured.copied") : t("featured.copy")}
          </Button>
        </div>
      </div>
    </article>
  );
}
