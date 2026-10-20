"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { CardBandBackdrop } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
import { CommunityCover } from "./community-cover";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { VisibilityLabel } from "./visibility-label";
import { applyJoinState } from "./home-shared";
import { recommendCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import {
  parseShownMap,
  recordShownSuggestions,
  reduceRepeatedSuggestions,
  SUGGESTION_CANDIDATE_POOL,
  SUGGESTION_STORAGE_KEY,
  SUGGESTION_STRIP_SIZE,
} from "@/lib/community-home";
import { CATEGORY_LABEL_KEYS, communityHref, REASON_LABEL_KEYS } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";

function readShown() {
  try {
    return parseShownMap(window.localStorage.getItem(SUGGESTION_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeShown(map: Record<string, number>) {
  try {
    window.localStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* depolama kapalı (gizli pencere): tekrar azaltma yalnız bu oturumda çalışmaz */
  }
}

/**
 * "Sana uygun topluluklar": en çok 10 öneri, yatay kaydırmalı şerit (mobilde bir sonraki kart kenardan görünür). Adaylar sunucuda gerçek ilgi
 * sinyalleriyle sıralanır (`recommend_communities`; tamamen kapalı asla, üye olunan/yasaklı/engelli yok); burada yalnız daha önce gösterilenler
 * sona alınır (7 gün, tarayıcıda tutulur) ve şerit boyuna inilir. Öneri yoksa (ya da yüklenemezse) şerit hiç çizilmez — "Tüm topluluklar" düğmesi kalır.
 */
export function SuggestionStrip({ onToast, onGoInvites }: { onToast: (message: string) => void; onGoInvites: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CommunitySummary[] | null>(null);
  const scroller = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    recommendCommunities(SUGGESTION_CANDIDATE_POOL)
      .then((candidates) => {
        if (cancelled) return;
        const now = Date.now();
        const chosen = reduceRepeatedSuggestions(candidates, readShown(), now, SUGGESTION_STRIP_SIZE);
        writeShown(recordShownSuggestions(readShown(), chosen.map((c) => c.id), now));
        setItems(chosen);
      })
      .catch((err) => {
        console.error("recommendCommunities", err);
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeStatus = useCallback((id: string, next: JoinState) => {
    setItems((prev) => (prev ? prev.map((c) => (c.id === id ? applyJoinState(c, next) : c)) : prev));
  }, []);

  const scrollBy = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * (scroller.current.clientWidth * 0.8), behavior: "smooth" });

  if (items === null) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label={t("common.loadingAriaLabel")} data-testid="suggestions-loading">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 w-[78%] shrink-0 animate-pulse rounded-xl border border-border-soft bg-surface-soft sm:w-72" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="suggestion-strip-title" className="space-y-2.5" data-testid="suggestion-strip">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="suggestion-strip-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <Sparkles size={14} className="text-primary" aria-hidden /> {t("communities.strip.title")}
          </h2>
          <p className="text-caption text-text-muted">{t("communities.strip.help")}</p>
        </div>
        <div className="hidden shrink-0 gap-1 md:flex">
          <button type="button" onClick={() => scrollBy(-1)} aria-label={t("communities.strip.prev")} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary hover:border-border-strong">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label={t("communities.strip.next")} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary hover:border-border-strong">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>
      <ul ref={scroller} className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2.5 overflow-x-auto scroll-smooth px-3 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0" data-testid="suggestion-list">
        {items.map((community) => (
          <li
            key={community.id}
            data-testid="suggestion-card"
            data-community-id={community.id}
            className="relative flex w-[72%] shrink-0 snap-start flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-colors duration-200 ease-soft hover:border-border-strong sm:w-64"
          >
            {/* Albüm kartı (docs/history/203-*): the band takes the community picture's colours. */}
            <div className="relative flex-1 rounded-t-xl p-3 pb-3.5">
              <CardBandBackdrop backdrop={<CommunityCover coverUrl={null} coverColor={null} avatarUrl={community.avatarUrl} className="h-full sm:h-full" />} />
              <div className="relative space-y-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex shrink-0 rounded-[0.95rem] border-[3px] border-surface bg-surface shadow-pop">
                    <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={44} className="[&>span:first-child]:rounded-[0.75rem]" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Eyebrow tone="primary">{t(CATEGORY_LABEL_KEYS[community.category])}</Eyebrow>
                    <h3 className="break-words font-display text-[1.0625rem] font-extrabold leading-tight tracking-[-0.015em] text-text">
                      <Link href={communityHref(community.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">
                        {community.name}
                      </Link>
                    </h3>
                  </div>
                </div>
                <VisibilityLabel visibility={community.visibility} />
                <p className="line-clamp-2 break-words text-caption text-text-secondary">{community.description ?? ""}</p>
              </div>
            </div>
            <div className="relative z-10 flex items-center justify-between gap-2 px-3 py-2.5">
              <p className="min-w-0 truncate text-caption text-text-muted">
                {memberCountText(t, community.memberCount)}
                {community.reason && <> · {t(REASON_LABEL_KEYS[community.reason])}</>}
              </p>
              <CommunityJoinButton
                target={{
                  id: community.id,
                  name: community.name,
                  visibility: community.visibility,
                  rulesRequired: community.rulesRequired,
                  memberCount: community.memberCount,
                  memberLimit: community.memberLimit,
                  closed: community.closed,
                }}
                status={community.myStatus}
                role={community.myRole}
                onChange={(next) => changeStatus(community.id, next)}
                onToast={onToast}
                onInvited={onGoInvites}
              />
            </div>
          </li>
        ))}
        <li className="flex shrink-0 snap-start items-stretch" data-testid="suggestion-view-all">
          <Link
            href="/communities/all"
            className="flex w-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-soft p-3 text-center text-small font-medium text-text transition-colors duration-200 ease-soft hover:border-primary hover:text-primary"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <ArrowRight size={16} aria-hidden />
            </span>
            {t("common.viewAll")}
          </Link>
        </li>
      </ul>
    </section>
  );
}
