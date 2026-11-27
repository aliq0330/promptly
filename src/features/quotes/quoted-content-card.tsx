"use client";

import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { buttonClassName } from "@/components/ui/button";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { summarizeContent } from "@/features/communities/content-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { skillHref } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";
import { QuotedArt, QuotedKicker, quotedTypeIcon } from "./quoted-parts";

/**
 * Alıntı SAYFASINDA alıntılanan gönderi: içeriğin detay sayfası yerine yalnız normal görsel kartı (`ContentCardPost`, akıştaki gönderi kartıyla aynı).
 * Kartın alt satırında içeriğin sahibi ve "Orijinal içeriği aç" durur; beğeni/yorum/paylaş ALINTININ eylem satırındadır (sayaçlar karışmaz).
 * İçerik gizlendiyse/silindiyse bağlantısız bir "artık görünmüyor" yüzeyi çizilir.
 */
export function QuotedContentCard({ quote }: { quote: Quote }) {
  const { t } = useTranslation();
  const summary = quote.content ? summarizeContent(quote.content) : null;
  const skill = quote.skill;
  const href = summary?.href ?? (skill ? skillHref(skill) : null);
  const title = summary?.title ?? skill?.title ?? null;

  if (!href || !title) {
    return (
      <div data-quoted-card="" data-card-media className="relative max-w-md overflow-hidden rounded-md bg-primary-soft">
        <QuotedArt quote={quote} summary={summary} />
      </div>
    );
  }

  return (
    <div data-quoted-card="" className="max-w-md">
      <ContentCard variant="visual" href={href}>
        <ContentCardPost
          author={summary?.author ?? skill?.creator ?? null}
          meta=""
          typeIcon={quotedTypeIcon(quote, summary)}
          badges={<QuotedKicker quote={quote} summary={summary} />}
          art={<QuotedArt quote={quote} summary={summary} />}
          title={<ContentCardTitle href={href} title={title} />}
          footer={
            <Link href={href} data-open-original className={buttonClassName({ size: "sm", variant: "outline", className: "mr-2 shrink-0 gap-1.5" })}>
              {t("quotes.page.openOriginal")}
              <ArrowUpRight size={16} aria-hidden />
            </Link>
          }
        />
      </ContentCard>
    </div>
  );
}
