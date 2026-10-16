"use client";

import Link from "next/link";
import { ArrowUpRight, EyeOff, Lock, SlidersHorizontal, Sparkles, SquareTerminal, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import { StorageImage } from "@/components/ui/storage-media";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import type { CommunityPost, CommunityPostContent, CommunityPostType } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptMedia } from "@/types";

const TYPE_ICON: Record<CommunityPostType, LucideIcon> = { prompt: SquareTerminal, request: Sparkles, workflow: WorkflowIcon, preset: SlidersHorizontal };
const TYPE_LABEL: Record<CommunityPostType, TranslationKey> = {
  prompt: "communities.feed.type.prompt",
  request: "communities.feed.type.request",
  workflow: "communities.feed.type.workflow",
  preset: "communities.feed.type.preset",
};

interface LinkedInfo {
  href: string;
  title: string;
  description: string;
  author: string | null;
  image: { url: string; alt: string } | null;
  /** İçerik yalnızca bu topluluğu okuyabilenlere açık (özel + yerel gönderi). */
  communityOnly: boolean;
}

function firstImage(media: PromptMedia[] | undefined, fallback?: string | null): { url: string; alt: string } | null {
  const first = media?.[0];
  if (first) return { url: first.url, alt: first.alt };
  return fallback ? { url: fallback, alt: "" } : null;
}

/** Dört içerik türünün kart için gereken ortak özeti: gönderi kartı içeriğin kendi kartını (ve onun beğeni/yorum düğmelerini) taşımaz. */
function describe(content: CommunityPostContent): LinkedInfo {
  if (content.type === "prompt") {
    const x = content.data;
    return { href: promptHref(x), title: x.title, description: x.description, author: x.author?.displayName ?? null, image: x.contentType === "image" ? firstImage(x.media) : null, communityOnly: x.visibility === "private" };
  }
  if (content.type === "request") {
    const x = content.data;
    return { href: requestHref(x), title: x.title, description: x.description, author: x.author?.displayName ?? null, image: firstImage(x.media), communityOnly: x.visibility === "private" };
  }
  if (content.type === "workflow") {
    const x = content.data;
    return { href: workflowHref(x), title: x.title, description: x.description, author: x.creator?.displayName ?? null, image: firstImage(x.media, x.coverUrl), communityOnly: x.visibility === "private" };
  }
  const x = content.data;
  return { href: presetHref(x), title: x.title, description: x.description, author: x.creator?.displayName ?? null, image: firstImage(undefined, x.coverUrl), communityOnly: x.visibility === "private" };
}

/**
 * Gönderinin işaret ettiği içeriğin kompakt özeti — içeriğin kendi sayaçlarını/etkileşimini taşımaz (gönderinin kendi beğenisi/yorumu
 * `PostEngagement`'tadır). Başvuruda "Başvurulan içerik" etiketi ve belirgin "Orijinal içeriği aç" bağlantısı vardır; yerel gönderide
 * içerik gönderinin kendisidir. İçerik okunamıyorsa (silindi / özel yapıldı) açıklayıcı boş durum gösterilir.
 */
export function LinkedContent({ post }: { post: CommunityPost }) {
  const { t } = useTranslation();
  const content = post.content;
  const applied = post.kind !== "native";

  if (!content) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
        <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
      </p>
    );
  }

  const info = describe(content);
  const Icon = TYPE_ICON[content.type];
  const typeLabel = t(TYPE_LABEL[content.type]);
  return (
    <Link
      href={info.href}
      data-linked-content={post.kind}
      aria-label={t("communities.post.linked.aria", { title: info.title })}
      className="group block rounded-lg border border-border-soft bg-surface-soft/60 p-3 transition-colors duration-200 ease-soft hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {applied && <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-text-muted">{t("communities.post.linked.appliedLabel")}</p>}
      <div className="flex items-start gap-3">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-soft text-primary sm:h-20 sm:w-20">
          {info.image ? <StorageImage src={info.image.url} alt={info.image.alt} fill sizes="80px" className="object-cover" /> : <Icon size={22} strokeWidth={1.75} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <Icon size={12} strokeWidth={2.1} aria-hidden className="text-primary" /> {typeLabel}
            </span>
            {info.communityOnly && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-text-muted">
                <Lock size={11} aria-hidden /> {t("communities.post.linked.communityOnly")}
              </span>
            )}
          </span>
          <span className="block break-words text-[1.0625rem] font-semibold leading-snug text-text group-hover:text-primary">{info.title}</span>
          {info.description && <span className="line-clamp-2 block break-words text-small text-text-muted">{info.description}</span>}
          {info.author && <span className="block truncate text-caption text-text-muted">{t("communities.post.linked.by", { name: info.author })}</span>}
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-label font-semibold text-primary">
        {applied ? t("communities.post.linked.openOriginal") : t("communities.post.linked.open")}
        <ArrowUpRight size={14} aria-hidden />
      </span>
    </Link>
  );
}
