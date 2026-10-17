"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { AnnouncementsSection } from "./announcements-section";
import type { CommunityTabProps } from "./community-page";
import { acceptCommunityRules, fetchCommunityEvents, type CommunityEvent } from "@/lib/supabase/communities";
import { eventDateParts, formatEventRange } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Akışın üstündeki ince özet: (varsa) güncel kuralları kabul uyarısı, kapatılmış topluluk notu, son duyurular ve en yakın etkinlik.
 * Bunların hiçbiri yoksa HİÇBİR ŞEY çizilmez — akış ilk açılış ekranıdır, özet onu itmez. Yönetim (duyuru yayınlama vb.) "Yönet" sekmesindedir.
 */
export function FeedHighlights({ group, role, viewerId, membership, reload, onToast, goTab }: CommunityTabProps) {
  const { t } = useTranslation();
  const [next, setNext] = useState<CommunityEvent | null>(null);
  const accept = useAsyncAction();
  const needsRulesAck = Boolean(role) && group.rulesRequired && Boolean(group.rules) && (membership?.acceptedRulesVersion ?? 0) < group.rulesVersion;

  useEffect(() => {
    let cancelled = false;
    fetchCommunityEvents(group.id, role ? viewerId : null, "upcoming")
      .then((list) => {
        if (!cancelled) setNext(list.find((event) => event.status === "scheduled") ?? null);
      })
      .catch((err) => {
        console.error("feed highlights events", err);
        if (!cancelled) setNext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, role, viewerId]);

  async function acknowledge() {
    const ok = await accept.run(async () => {
      await acceptCommunityRules(group.id);
      return true;
    });
    if (!ok) return;
    onToast(t("communities.rules.acceptedToast"));
    await reload();
  }

  return (
    <div className="space-y-4 empty:hidden">
      {needsRulesAck && (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft/50 p-4 sm:flex-row sm:items-center">
          <ScrollText size={18} className="shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-small font-medium text-text">{t("communities.rules.updatedTitle")}</p>
            <p className="text-caption text-text-muted">{t("communities.rules.updatedHelp")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => goTab("about")}>
              {t("communities.rules.read")}
            </Button>
            <Button type="button" size="sm" onClick={() => void acknowledge()} disabled={accept.busy}>
              {t("communities.rules.accept")}
            </Button>
          </div>
        </div>
      )}
      {accept.error && (
        <p role="alert" className="text-small text-danger">
          {accept.error}
        </p>
      )}

      {group.closedAt && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-small text-text">
          {t("communities.detail.closedNotice")}
        </p>
      )}

      <AnnouncementsSection group={group} role={role} limit={3} onToast={onToast} highlight />

      {next && <NextEventCard event={next} onOpen={() => goTab("events")} />}
    </div>
  );
}

/** The nearest event as a date-tile card (Meydan, docs/history/190-* Faz 6); opens the Events tab. */
function NextEventCard({ event, onOpen }: { event: CommunityEvent; onOpen: () => void }) {
  const { t, language } = useTranslation();
  const date = eventDateParts(event.startsAt, event.timezone, language);
  return (
    <button
      type="button"
      data-feed-next-event
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-lg border border-border-soft bg-surface px-4 py-3 text-left shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft leading-none text-primary">
        <span className="text-[0.625rem] font-bold tracking-[0.06em]">{date.month}</span>
        <span className="mt-0.5 font-display text-[1.25rem] font-bold">{date.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-text-muted">{t("communities.feed.nextEvent")}</span>
        <span className="block break-words text-sm font-semibold text-text">{event.title}</span>
        <span className="block text-caption text-text-muted">{formatEventRange(event.startsAt, event.endsAt, event.timezone, language)}</span>
      </span>
      <span className="shrink-0 rounded-full bg-text px-3 py-1.5 text-caption font-semibold text-background">{t("communities.overview.allEvents")}</span>
    </button>
  );
}
