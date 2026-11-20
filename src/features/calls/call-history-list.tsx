"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Phone } from "@/components/icons/phone";
import { PhoneOff } from "@/components/icons/phone-off";
import { Video } from "@/components/icons/video";
import { ArrowDownLeft } from "@/components/icons/arrow-down-left";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { LoadMore } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, messageHref } from "@/lib/utils";
import { filterCalls, otherParty, summarizeCall, type CallFilter } from "@/lib/webrtc/call-history";
import { formatCallDuration } from "@/lib/webrtc/call-rules";
import { callLabelKey } from "./call-log-row";
import { useCalls } from "./call-provider";
import { usePeerProfiles } from "./use-peer-profiles";
import { useCallRows } from "./use-call-rows";

const FILTERS: CallFilter[] = ["all", "missed", "audio", "video"];
const FILTER_KEY = { all: "calls.list.filter.all", missed: "calls.list.filter.missed", audio: "calls.list.filter.audio", video: "calls.list.filter.video" } as const;

/**
 * Aramalar bölümü (docs/history/450-*): Mesajlar'da "Sohbetler ▾" menüsündeki "Aramalar". Bitmiş çağrılarım, en yeni üstte, imleçli sayfalı;
 * süzgeç çipleri (Tümü · Cevapsız · Sesli · Görüntülü); satıra dokunmak sohbeti açar, sağdaki simgeler tekrar arar. Hata "boş" sayılmaz.
 */
export function CallHistoryList({ embedded = false }: { embedded?: boolean }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const calls = useCalls();
  const userId = user?.id ?? null;
  const [filter, setFilter] = useState<CallFilter>("all");
  const { rows, loading, error, hasMore, loadMore, reload } = useCallRows({ userId });
  const visible = userId ? filterCalls(rows, filter, userId) : [];
  const profiles = usePeerProfiles(userId ? rows.map((row) => otherParty(row, userId)) : []);
  const pad = embedded ? "px-4" : "px-1";

  return (
    <div data-call-history>
      <ChipRow aria-label={t("calls.list.title")} className={cn("mb-2", pad)}>
        {FILTERS.map((key) => (
          <Chip key={key} selected={filter === key} onClick={() => setFilter(key)} data-call-filter={key}>
            {t(FILTER_KEY[key])}
          </Chip>
        ))}
      </ChipRow>
      {error && rows.length === 0 ? (
        <div className={cn("py-8 text-center", pad)} role="alert">
          <p className="mb-3 text-small text-danger">{t("calls.list.error")}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            {t("calls.list.retry")}
          </Button>
        </div>
      ) : loading && rows.length === 0 ? (
        <ul aria-hidden className={cn("space-y-1", pad)}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-16 rounded-lg skeleton-shimmer" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState icon={PhoneOff} title={t("calls.list.title")} description={filter === "all" ? t("calls.list.empty") : t("calls.list.emptyFiltered")} compact className="mx-1" />
      ) : (
        <ul>
          {visible.map((row) => {
            const summary = summarizeCall(row, userId!);
            if (!summary) return null;
            const peer = profiles.get(otherParty(row, userId!));
            const name = peer?.displayName || peer?.username || t("calls.list.unknown");
            const missed = summary.outcome === "missed";
            const TypeIcon = summary.type === "video" ? Video : Phone;
            const DirIcon = summary.direction === "out" ? ArrowUpRight : ArrowDownLeft;
            const startCall = (type: "audio" | "video") => peer && void calls?.startCall({ conversationId: row.conversationId, peer, type });
            return (
              <li key={row.id} data-call-item data-call-outcome={summary.outcome} className="flex items-stretch">
                <Link href={messageHref({ id: row.conversationId })} aria-label={`${name}: ${t("calls.list.open")}`} className={cn("flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", embedded ? "pl-4" : "pl-1")}>
                  <Avatar src={peer?.avatarUrl ?? null} alt="" size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-text">{name}</span>
                    <span className={cn("flex items-center gap-1 truncate text-small", missed ? "text-danger" : "text-text-muted")}>
                      <TypeIcon size={16} aria-hidden />
                      <DirIcon size={12} aria-hidden />
                      <span className="truncate">
                        {t(callLabelKey(summary))}
                        {summary.outcome === "completed" ? ` · ${formatCallDuration(summary.durationSec)}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-text-muted">{formatRelativeTime(summary.at, language)}</span>
                </Link>
                {calls && peer && (
                  <span className={cn("flex shrink-0 items-center gap-1", embedded ? "pr-3" : "pr-1")}>
                    <button type="button" disabled={calls.busy} onClick={() => startCall("audio")} aria-label={t("calls.startVoiceAria", { name })} title={t("calls.startVoice")} data-call-again="audio" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                      <Phone size={20} aria-hidden />
                    </button>
                    <button type="button" disabled={calls.busy} onClick={() => startCall("video")} aria-label={t("calls.startVideoAria", { name })} title={t("calls.startVideo")} data-call-again="video" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                      <Video size={20} aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore failed={error && rows.length > 0} hasMore={hasMore} loadingMore={loading && rows.length > 0} onLoadMore={() => void loadMore()} />
    </div>
  );
}
