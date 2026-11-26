"use client";

import { TrashIcon } from "@/components/ui/motion-icons";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Flag } from "@/components/icons/flag";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { usePageTitle } from "@/components/layout/page-title";
import { useAuth } from "@/features/auth/auth-provider";
import { summarizeContent } from "@/features/communities/content-summary";
import { DetailActionBar, DetailComments } from "@/features/content/detail-parts";
import { DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { CommentSection } from "@/features/prompts/comment-section";
import type { PostMenuExtra } from "@/features/prompts/post-menu-extras";
import { ReactionSummary } from "@/features/reactions/reaction-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchQuoteById, type Quote } from "@/lib/supabase/quotes";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { QuoteCommentLink, QuoteLike, QuoteShareButton, QuoteStatisticsButton } from "./quote-engagement";
import { QuoteDeleteDialog, QuoteReportDialog } from "./quote-menu";
import { QuotedContentCard } from "./quoted-content-card";

/**
 * `/quotes/local?id=<alıntı>`: bir alıntının kendi sayfası (docs/history/217-*). Üstte alıntı şeridi (alıntılayan + not) ve HEMEN altında alıntının eylem satırı
 * (beğeni/tepki · yorum · İstatistik · Paylaş; sayfa aşağı kayınca alt menünün üstüne sabitlenir — `DetailActionBar`), sonra alıntılanan gönderinin YALNIZ kartı
 * (`QuotedContentCard`: içeriğin detay sayfası bu sayfaya gömülmez, orijinale karttaki "Orijinal içeriği aç"la gidilir) ve alıntının yorumları.
 * Beğeni/yorum/istatistik/paylaş ALINTININ kendisine bağlıdır, orijinale karışmaz. Alıntıyı okuyamayan (silindi, içerik gizlendi, engel) "bulunamadı" görür.
 */
export function QuotePage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const quoteId = params.get("id");
  const hl = params.get("hl");
  const highlightCommentId = hl?.startsWith("comment:") ? hl.slice("comment:".length) : null;
  const { user, loading: authLoading } = useAuth();
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<"delete" | "report" | null>(null);
  usePageTitle(quote ? (quote.content ? summarizeContent(quote.content).title : quote.skill?.title) : null);

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

  const mine = user?.id === quote.author.id;

  // Alıntı işleri tek ⋮ menüsündedir; alıntılanan içeriğin kendi yönetimi orijinalin sayfasında kalır.
  const extras: PostMenuExtra[] = [];
  if (user && mine) extras.push({ key: "delete", label: t("quotes.menu.delete"), icon: <TrashIcon size={16} />, danger: true, onSelect: () => setDialog("delete") });
  if (user && !mine) extras.push({ key: "report", label: t("messages.reportAction"), icon: <Flag size={16} />, onSelect: () => setDialog("report") });

  return (
    <div data-quote-page={quote.id}>
      <section aria-label={t("quotes.page.titleFor", { name: quote.author.displayName })} className="border-b border-border-soft bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10">
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} className="inline-flex items-center gap-1.5 text-small text-text-muted hover:text-text">
            <ArrowLeft size={16} aria-hidden /> {t("quotes.page.back")}
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
            {extras.length > 0 && (
              <span data-quote-menu={quote.id} className="relative z-10">
                <DropdownMenu label={t("quotes.card.menu")}>
                  {(close) => (
                    <>
                      {extras.map((extra) => (
                        <MenuItem key={extra.key} icon={extra.icon} label={extra.label} danger={extra.danger} onClick={() => { close(); extra.onSelect(); }} />
                      ))}
                    </>
                  )}
                </DropdownMenu>
              </span>
            )}
          </div>
          {quote.note && (
            <p data-quote-note className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft px-4 py-3 text-body text-text">
              {quote.note}
            </p>
          )}
          <div className="mt-3 border-t border-border-soft [&>div]:border-b-0">
            <DetailActionBar
              below={<ReactionSummary contentType="quote" id={quote.id} likeCount={quote.likeCount} />}
              end={
                <>
                  <QuoteStatisticsButton quote={quote} size={20} />
                  <QuoteShareButton quote={quote} />
                </>
              }
            >
              <QuoteLike quote={quote} size={20} />
              <QuoteCommentLink quote={quote} size={20} />
            </DetailActionBar>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-3 py-4 pb-16 sm:px-6 lg:px-8 lg:py-6">
        <QuotedContentCard quote={quote} />
        <div className="max-w-3xl">
          <DetailComments>
            <CommentSection target={{ quoteId: quote.id }} highlightCommentId={highlightCommentId} headless />
          </DetailComments>
        </div>
      </div>

      {dialog === "delete" && <QuoteDeleteDialog quote={quote} onClose={() => setDialog(null)} onDeleted={() => router.replace("/")} />}
      {dialog === "report" && <QuoteReportDialog quote={quote} onClose={() => setDialog(null)} />}
    </div>
  );
}
