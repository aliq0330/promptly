"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ScrollText, SquareStack, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { AnnouncementsSection } from "./announcements-section";
import type { CommunityTabProps } from "./community-page";
import { acceptCommunityRules, fetchCommunityEvents, type CommunityEvent } from "@/lib/supabase/communities";
import { formatEventRange } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Genel bakış: açıklama, kısa sayılar, (kabul zorunluysa ve güncel sürüm kabul edilmediyse) kural uyarısı, duyurular ve yaklaşan etkinlikler.
 * Üye olmayan ziyaretçi (herkese açık topluluk) aynı bilgiyi salt-okunur görür.
 */
export function OverviewTab({ group, role, viewerId, membership, reload, onToast, goTab }: CommunityTabProps) {
  const { t, language } = useTranslation();
  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const accept = useAsyncAction();
  const needsRulesAck = Boolean(role) && group.rulesRequired && Boolean(group.rules) && (membership?.acceptedRulesVersion ?? 0) < group.rulesVersion;

  useEffect(() => {
    let cancelled = false;
    fetchCommunityEvents(group.id, role ? viewerId : null, "upcoming")
      .then((list) => {
        if (!cancelled) setEvents(list.filter((event) => event.status === "scheduled").slice(0, 3));
      })
      .catch((err) => {
        console.error("overview events", err);
        if (!cancelled) setEvents([]);
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
    <div className="space-y-6">
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

      {group.description && <p className="whitespace-pre-wrap break-words text-body text-text-secondary">{group.description}</p>}

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={<Users size={15} aria-hidden />} label={t("communities.overview.members")} value={String(group.memberCount)} />
        <Stat icon={<SquareStack size={15} aria-hidden />} label={t("communities.overview.posts")} value={String(group.postCount)} />
        <Stat icon={<CalendarDays size={15} aria-hidden />} label={t("communities.overview.events")} value={events === null ? "…" : String(events.length)} />
      </dl>

      <AnnouncementsSection group={group} role={role} limit={10} onToast={onToast} />

      <section aria-labelledby="overview-events-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="overview-events-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <CalendarDays size={15} aria-hidden /> {t("communities.overview.upcoming")}
          </h2>
          <button type="button" onClick={() => goTab("events")} className="text-label font-medium text-primary hover:underline">
            {t("communities.overview.allEvents")}
          </button>
        </div>
        {events === null ? (
          <div className="h-16 animate-pulse rounded-lg border border-border-soft bg-surface-soft" aria-busy="true" />
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-small text-text-muted">{t("communities.events.emptyUpcoming")}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => goTab("events")}
                  className="flex w-full flex-col gap-0.5 rounded-lg border border-border-soft bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="break-words text-sm font-semibold text-text">{event.title}</span>
                  <span className="text-caption text-text-muted">{formatEventRange(event.startsAt, event.endsAt, event.timezone, language)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-3 py-3">
      <dt className="flex items-center gap-1.5 text-caption text-text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-h3 font-semibold text-text">{value}</dd>
    </div>
  );
}
