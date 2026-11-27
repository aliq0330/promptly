"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { summarizeContent } from "@/features/communities/content-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref } from "@/lib/quotes";
import { formatRelativeTime } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";
import { QuoteCommentLink, QuoteLike } from "./quote-engagement";
import { QuoteMenu } from "./quote-menu";
import { QuotedArt, QuotedKicker, quotedTypeIcon } from "./quoted-parts";

/**
 * Alıntının akıştaki kartı (docs/history/217-*): başvuru gönderisinin kartıyla (`ApplicationCard`) AYNI aile — akış gönderisi
 * `ContentCardPost` (docs/history/476-*): alıntılanan içeriğin çıktısı/kapağı; altında tür etiketi + zaman, başlık, alıntı notu (özetin yerine); altta
 * ALINTILAYAN ve sayaçlar — sayaçlar ALINTININ kendisine aittir (alıntılanan içeriğinki değil). Karta tıklamak alıntının sayfasını açar; orijinal içeriğe oradan gidilir.
 */
export function QuoteCard({ quote }: { quote: Quote }) {
  const { t, language } = useTranslation();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const href = quoteHref(quote.id);
  const summary = quote.content ? summarizeContent(quote.content) : null;
  const skill = quote.skill;

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={quote.author}
        meta={`${t("quotes.card.quoted")} · ${formatRelativeTime(quote.createdAt, language)}`}
        time={formatRelativeTime(quote.createdAt, language)}
        typeIcon={quotedTypeIcon(quote, summary)}
        status={<Badge variant="default">{t("quotes.badge")}</Badge>}
        badges={<QuotedKicker quote={quote} summary={summary} />}
        menu={<QuoteMenu quote={quote} onDeleted={() => setGone(true)} />}
        art={<QuotedArt quote={quote} summary={summary} />}
        title={summary ? <ContentCardTitle href={href} title={summary.title} /> : skill ? <ContentCardTitle href={href} title={skill.title} /> : null}
        footer={
          // `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the QUOTE's own counters.
          <div className="contents" data-quote-engagement={quote.id}>
            <QuoteLike quote={quote} />
            <QuoteCommentLink quote={quote} />
          </div>
        }
      >
        {quote.note && (
          <p data-quote-note className="line-clamp-3 whitespace-pre-wrap break-words font-serif text-body leading-[1.45] text-text-secondary">
            {quote.note}
          </p>
        )}
      </ContentCardPost>
    </ContentCard>
  );
}
