"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonClassName } from "@/components/ui/button";
import { StorageImage } from "@/components/ui/storage-media";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { ToolChips } from "@/features/content/tool-chips";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { summarizeContent } from "./content-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { profileHref } from "@/lib/utils";
import type { CommunityPostContent } from "@/lib/supabase/communities";

/**
 * Başvuru sayfasında başvurulan içeriğin AYRINTILI görünümü (salt okunur): başlık, açıklama, tüm görseller, prompt metni / yaratıcı yön /
 * adım ve alan sayısı, araçlar, etiketler. İçeriğin KENDİ beğeni/yorumu burada yoktur (gönderinin kendi etkileşimi sayfada ayrıdır);
 * isteyen "Orijinal içeriği aç" ile içeriğin kendi sayfasına geçer.
 */
export function ApplicationContentDetail({ content }: { content: CommunityPostContent }) {
  const { t } = useTranslation();
  const s = summarizeContent(content);
  return (
    <section aria-label={t("communities.post.linked.appliedLabel")} className="space-y-4 rounded-lg border border-border-soft bg-surface p-4 shadow-card sm:p-5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-text-muted">{t("communities.post.linked.appliedLabel")}</p>
      <div className="space-y-2">
        <ContentTypeLabel icon={s.typeIcon} label={t(s.typeLabelKey)} detail={s.detail} />
        <h1 className="break-words text-h3 font-semibold text-text">{s.title}</h1>
        {s.author && (
          <Link href={profileHref(s.author)} className="inline-flex items-center gap-2 text-small text-text-muted hover:text-text">
            <Avatar src={s.author.avatarUrl} alt={s.author.displayName} size={22} />
            {t("communities.post.linked.by", { name: s.author.displayName })}
          </Link>
        )}
        {s.description && <p className="whitespace-pre-wrap break-words text-small leading-relaxed text-text-secondary">{s.description}</p>}
      </div>

      {s.media.length > 0 && (
        <ul className={s.media.length > 1 ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
          {s.media.map((item) => (
            <li key={item.id} className="relative overflow-hidden rounded-md bg-surface-soft" style={{ aspectRatio: Math.min(Math.max(item.width / Math.max(item.height, 1), 0.75), 1.9) }}>
              <StorageImage src={item.url} alt={item.alt} fill sizes="(min-width: 768px) 360px, 90vw" className="object-cover" />
            </li>
          ))}
        </ul>
      )}

      {s.promptText && (
        <div className="space-y-1.5">
          <p className="text-label font-semibold text-text">{t("communities.post.detail.promptText")}</p>
          <ScrollablePrompt className="rounded-md border border-border-soft bg-surface-soft p-3 text-small">{s.promptText}</ScrollablePrompt>
        </div>
      )}
      {s.creativeDirection && (
        <div className="space-y-1.5">
          <p className="text-label font-semibold text-text">{t("communities.post.detail.creativeDirection")}</p>
          <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{s.creativeDirection}</p>
        </div>
      )}
      {(s.stepCount !== undefined || s.fieldCount !== undefined) && (
        <p className="text-small text-text-muted">
          {s.stepCount !== undefined ? t("communities.post.detail.steps", { count: s.stepCount }) : t("communities.post.detail.fields", { count: s.fieldCount ?? 0 })}
        </p>
      )}

      <ToolChips refs={s.tools} />
      <ContentTags tags={s.tags} max={8} />

      <Link href={s.href} data-open-original className={buttonClassName({ size: "md", variant: "outline", className: "w-full sm:w-auto" })}>
        {t("communities.post.linked.openOriginal")}
        <ArrowUpRight size={15} aria-hidden />
      </Link>
    </section>
  );
}
