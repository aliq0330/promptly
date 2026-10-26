"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Loader2, Quote as QuoteIcon, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ANNOUNCE_NOTE_MAX,
  AnnouncePicker,
  announceToCommunities,
  useAnnounceCommunities,
  type AnnounceResult,
  type AnnounceSelection,
} from "@/features/communities/announce-picker";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref } from "@/lib/quotes";
import { createQuote } from "@/lib/supabase/quotes";
import type { CommunityPostType } from "@/lib/supabase/communities";
import { cn } from "@/lib/utils";

type FeedResult = { ok: true; quoteId: string } | { ok: false; message: string } | null;

/**
 * Paylaş penceresinin "Alıntıla" satırı (docs/history/217-*; eskiden "Topluluklarda duyur"): açılınca isteğe bağlı not + "Nerede görünsün?"
 * — Akışta (normal gönderi olarak: Ana Sayfa, Keşfet, arama, profildeki "Alıntılar") ve/veya üye olunan topluluklarda (başvuru gönderisi).
 * İçerik KOPYALANMAZ; alıntı notla birlikte bir referanstır. Her hedef ayrı denenir, sonuç hedef başına gösterilir — sessiz başarı yok.
 * `blockedReason` varsa (içerik herkese açık değil) satır nedenini yazar ve açılmaz.
 */
export function QuoteSection({
  type,
  contentId,
  blockedReason,
  hideFeed = false,
}: {
  type: CommunityPostType;
  contentId: string;
  blockedReason?: string | null;
  /** Akış hedefi başka yerde yönetiliyorsa (Space sahibinin "Akışta paylaş" anahtarı) yalnız topluluklar sunulur. */
  hideFeed?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState(!hideFeed);
  const [selection, setSelection] = useState<AnnounceSelection>({ communityIds: [], note: "" });
  const [busy, setBusy] = useState(false);
  const [feedResult, setFeedResult] = useState<FeedResult>(null);
  const [results, setResults] = useState<AnnounceResult[] | null>(null);
  const communities = useAnnounceCommunities(open);

  const feedPending = !hideFeed && feed && !feedResult?.ok;
  const pending = selection.communityIds.filter((id) => !results?.some((result) => result.communityId === id && result.ok));
  const nothing = !feedPending && pending.length === 0;

  async function submit() {
    if (nothing) return;
    setBusy(true);
    if (feedPending) {
      try {
        setFeedResult({ ok: true, quoteId: await createQuote(type, contentId, selection.note) });
      } catch (err) {
        setFeedResult({ ok: false, message: err instanceof Error ? err.message : t("common.actionFailedRetry") });
      }
    }
    if (pending.length > 0) {
      const names = new Map(communities.list.map((community) => [community.id, community.name]));
      const next = await announceToCommunities(type, contentId, { ...selection, communityIds: pending }, names);
      setResults((previous) => [...(previous ?? []).filter((old) => !next.some((result) => result.communityId === old.communityId)), ...next]);
    }
    setBusy(false);
  }

  return (
    <div className="rounded-md border border-border" data-quote-section="">
      <button
        type="button"
        onClick={() => !blockedReason && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={Boolean(blockedReason)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent-surface/50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <QuoteIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{t("quotes.section.title")}</span>
          <span className={cn("block text-xs", blockedReason ? "text-warning" : "text-text-muted")}>{blockedReason ?? t("quotes.section.hint")}</span>
        </span>
      </button>
      {open && !blockedReason && (
        <div className="space-y-3 border-t border-border-soft p-3">
          <label className="block">
            <span className="sr-only">{t("quotes.section.noteLabel")}</span>
            <textarea
              value={selection.note}
              onChange={(event) => setSelection({ ...selection, note: event.target.value })}
              rows={2}
              maxLength={ANNOUNCE_NOTE_MAX}
              disabled={busy}
              placeholder={t("quotes.section.notePlaceholder")}
              data-quote-note-input=""
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-small text-text placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>

          <p className="text-label font-semibold text-text">{t("quotes.section.destinations")}</p>
          {!hideFeed && (
          <label
            data-quote-destination="feed"
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
              feed ? "border-primary/50 bg-primary-soft" : "border-border-soft bg-background",
              busy || feedResult?.ok ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-border-strong",
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-primary">
              <Home size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-text">{t("quotes.section.feed")}</span>
              {feedResult?.ok ? (
                <span className="flex items-center gap-1.5 text-caption text-success">
                  <Check size={12} aria-hidden /> {t("quotes.section.feedDone")}{" "}
                  <Link href={quoteHref(feedResult.quoteId)} data-quote-open className="font-semibold underline">
                    {t("quotes.section.openQuote")}
                  </Link>
                </span>
              ) : feedResult ? (
                <span className="flex items-start gap-1 text-caption text-danger">
                  <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" /> {feedResult.message}
                </span>
              ) : (
                <span className="block text-caption text-text-muted">{t("quotes.section.feedHint")}</span>
              )}
            </span>
            <input type="checkbox" checked={feed} disabled={busy || Boolean(feedResult?.ok)} onChange={() => setFeed((value) => !value)} className="h-5 w-5 shrink-0 accent-primary" />
          </label>
          )}

          <p className="text-label font-semibold text-text">{t("quotes.section.communities")}</p>
          <AnnouncePicker value={selection} onChange={setSelection} communities={communities.list} status={communities.status} disabled={busy} results={results} hideNote />

          <p className="text-caption text-text-muted">{t("quotes.section.dailyHint")}</p>
          <div className="flex items-center justify-end gap-2">
            {nothing && !feedResult && !results && <span className="text-caption text-text-muted">{t("quotes.section.noDestination")}</span>}
            <Button size="sm" onClick={() => void submit()} disabled={busy || nothing} data-quote-submit="">
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t("quotes.section.submit")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
