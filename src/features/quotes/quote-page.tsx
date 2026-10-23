"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, EyeOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { summarizeContent } from "@/features/communities/content-summary";
import { ContentTypePill } from "@/features/content/content-type-label";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchQuoteById, type Quote } from "@/lib/supabase/quotes";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { QuoteEngagement } from "./quote-engagement";
import { QuoteMenu } from "./quote-menu";

/**
 * `/quotes/local?id=<alıntı>`: bir alıntının kendi sayfası (docs/history/217-*). Üstte alıntılayan + not, altında alıntılanan içeriğin özeti
 * ("Orijinal içeriği aç"), sonra ALINTININ kendi beğeni/yorumları (`QuoteEngagement`, varsayılan açık; `#comments`). Alıntıyı okuyamayan
 * (silindi, alıntılanan içerik gizlendi, engel) "bulunamadı" görür — varlığı sızmaz.
 */
export function QuotePage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const quoteId = params.get("id");
  const hl = params.get("hl");
  const highlightCommentId = hl?.startsWith("comment:") ? hl.slice("comment:".length) : null;
  const { loading: authLoading } = useAuth();
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!quoteId) {
      setQuote(null);
      return;
    }
    try {
      setQuote(await fetchQuoteById(quoteId));
      setFailed(false);
    } catch (err) {
      console.error("quote page", err);
      setFailed(true);
    }
  }, [quoteId]);

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [authLoading, load]);

  if (authLoading || (quote === undefined && !failed)) return <DetailSkeleton />;
  if (failed) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p role="alert" className="text-small text-danger">
          {t("quotes.page.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <NotFoundBlock title={t("quotes.page.notFoundTitle")} description={t("quotes.page.notFoundBody")} />
        <Link href="/" className={buttonClassName({ size: "sm", variant: "outline" })}>
          {t("quotes.page.toHome")}
        </Link>
      </div>
    );
  }

  const summary = quote.content ? summarizeContent(quote.content) : null;
  const poster = summary?.playable ? summary.media[0] : undefined;

  return (
    <div data-quote-page={quote.id}>
      <section aria-label={t("quotes.page.titleFor", { name: quote.author.displayName })} className="border-b border-border-soft bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} className="inline-flex items-center gap-1.5 text-small text-text-muted hover:text-text">
            <ArrowLeft size={14} aria-hidden /> {t("quotes.page.back")}
          </button>
          <div className="mt-3 flex items-start gap-3">
            <Avatar src={quote.author.avatarUrl} alt={quote.author.displayName} size={40} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-small leading-snug text-text">
                <Link href={profileHref(quote.author)} className="font-semibold hover:underline">
                  {quote.author.displayName}
                </Link>{" "}
                <span className="text-text-muted">{t("quotes.card.quoted")}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                <Badge variant="default">{t("quotes.badge")}</Badge>
                <span>{formatRelativeTime(quote.createdAt, language)}</span>
              </p>
            </div>
            <QuoteMenu quote={quote} onDeleted={() => router.replace("/")} />
          </div>
          {quote.note && (
            <p data-quote-note className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft px-3.5 py-3 text-body text-text">
              {quote.note}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5">
        {summary ? (
          <div data-quote-target={summary.type} className="space-y-3 overflow-hidden rounded-xl border border-border-soft bg-surface p-3.5 shadow-card">
            {summary.type === "space" ? (
              <Link href={summary.href} className="block">
                <SpaceCoverArt urls={summary.spaceArt ?? []} className="aspect-[16/9] w-full overflow-hidden rounded-lg" iconSize={40} />
              </Link>
            ) : summary.playable && poster ? (
              <OutputPosterPreview media={poster} />
            ) : summary.media.length > 0 ? (
              <OutputThumbnailStrip media={summary.media} />
            ) : null}
            {summary.palette && summary.palette.length > 0 && <PaletteStrip colors={summary.palette} className="h-1.5" />}
            <div className="space-y-1.5">
              <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />
              <Link href={summary.href} className="block break-words text-h3 font-bold text-text hover:text-primary">
                {summary.title}
              </Link>
              {summary.description && <p className="line-clamp-3 break-words text-small text-text-secondary">{summary.description}</p>}
              {summary.author && (
                <p className="text-caption text-text-muted">
                  <Link href={profileHref(summary.author)} className="font-semibold text-text hover:text-primary">
                    {summary.author.displayName}
                  </Link>{" "}
                  · @{summary.author.username}
                </p>
              )}
            </div>
            <Link href={summary.href} data-open-original className={buttonClassName({ size: "sm", variant: "outline", className: "gap-1.5" })}>
              {t("quotes.page.openOriginal")}
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
            <EyeOff size={15} aria-hidden /> {t("quotes.card.contentGone")}
          </p>
        )}
        <section className="space-y-2" aria-label={t("quotes.page.commentsTitle")}>
          <p className="text-caption text-text-muted">{t("quotes.page.commentsHelp")}</p>
          <QuoteEngagement quote={quote} highlightCommentId={highlightCommentId} />
        </section>
      </div>
    </div>
  );
}
