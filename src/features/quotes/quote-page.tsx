"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, EyeOff, Flag, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { summarizeContent } from "@/features/communities/content-summary";
import { DropdownMenu, MenuItem } from "@/features/communities/dropdown-menu";
import { PostMenuExtras, type PostMenuExtra } from "@/features/prompts/post-menu-extras";
import { PromptDetailView } from "@/features/prompts/prompt-detail-view";
import { RequestDetailView } from "@/features/requests/request-detail-view";
import { WorkflowDetailView } from "@/features/workflows/workflow-view";
import { PresetDetailView } from "@/features/presets/preset-detail-view";
import { SpacePreview } from "@/features/spaces/space-preview";
import { quoteVerbKey } from "@/lib/quotes";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchQuoteById, type Quote } from "@/lib/supabase/quotes";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { QuoteEngagement } from "./quote-engagement";
import { QuoteDeleteDialog, QuoteReportDialog } from "./quote-menu";
import { QuoteScopeProvider } from "./quote-scope";

/**
 * `/quotes/local?id=<alıntı>`: bir alıntının kendi sayfası (docs/history/217-*). Topluluk başvuru gönderisi sayfasıyla (`CommunityPostPage`) AYNI yapı:
 * üstte alıntı şeridi (alıntılayan + not + "Orijinal içeriği aç"), altında alıntılanan içeriğin NORMAL detay sayfası (Albüm bandı, iki sütun,
 * tüm eylemler); beğeni/yorum/istatistik/paylaş ALINTININ kendisine bağlanır (`QuoteScope`, orijinale karışmaz). Space'in detay sayfası yok:
 * kapak kolajı + başlık + ALINTININ kendi etkileşimi gösterilir. Alıntıyı okuyamayan (silindi, içerik gizlendi, engel) "bulunamadı" görür.
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

  const content = quote.content;
  const summary = content ? summarizeContent(content) : null;
  const mine = user?.id === quote.author.id;

  // Alıntı işleri içeriğin NORMAL ⋮ menüsüne eklenir (ikinci menü yok); içeriğin kendi yönetimi orijinalin sayfasında kalır.
  const extras: PostMenuExtra[] = [];
  if (user && mine) extras.push({ key: "delete", label: t("quotes.menu.delete"), icon: <Trash2 size={14} />, danger: true, onSelect: () => setDialog("delete") });
  if (user && !mine) extras.push({ key: "report", label: t("messages.reportAction"), icon: <Flag size={14} />, onSelect: () => setDialog("report") });

  return (
    <div data-quote-page={quote.id}>
      <section aria-label={t(quoteVerbKey(quote) === "quotes.card.shared" ? "quotes.page.titleForShared" : "quotes.page.titleFor", { name: quote.author.displayName })} className="border-b border-border-soft bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10">
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
                <span className="text-text-muted">{t(quoteVerbKey(quote))}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                <Badge variant="default">{t("quotes.badge")}</Badge>
                <span>{formatRelativeTime(quote.createdAt, language)}</span>
              </p>
            </div>
            {(!content || content.type === "space") && extras.length > 0 && (
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
            <p data-quote-note className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft px-3.5 py-3 text-body text-text">
              {quote.note}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border-soft pt-3">
            <p className="min-w-0 flex-1 basis-56 text-caption text-text-muted">{t("quotes.page.scopeHelp")}</p>
            {summary && (
              <Link href={summary.href} data-open-original className={buttonClassName({ size: "sm", variant: "outline", className: "ml-auto shrink-0 gap-1.5" })}>
                {t("quotes.page.openOriginal")}
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </section>

      <QuoteScopeProvider value={{ quote }}>
        <PostMenuExtras items={extras}>
          {content?.type === "prompt" && <PromptDetailView prompt={content.data} />}
          {content?.type === "request" && <RequestDetailView request={content.data} />}
          {content?.type === "workflow" && <WorkflowDetailView workflowId={content.data.id} />}
          {content?.type === "preset" && <PresetDetailView presetId={content.data.id} />}
        </PostMenuExtras>
      </QuoteScopeProvider>

      {content?.type === "space" && <SpacePreview space={content.data} />}
      {(!content || content.type === "space") && (
        <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5">
          {!content && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("quotes.card.contentGone")}
            </p>
          )}
          <section className="space-y-2" aria-label={t("quotes.page.commentsTitle")}>
            <p className="text-caption text-text-muted">{t("quotes.page.commentsHelp")}</p>
            <QuoteEngagement quote={quote} highlightCommentId={highlightCommentId} />
          </section>
        </div>
      )}

      {dialog === "delete" && <QuoteDeleteDialog quote={quote} onClose={() => setDialog(null)} onDeleted={() => router.replace("/")} />}
      {dialog === "report" && <QuoteReportDialog quote={quote} onClose={() => setDialog(null)} />}
    </div>
  );
}
