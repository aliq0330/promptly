"use client";

import { Calendar, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AsideSection, DetailAside } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import { INTEREST_OPTION_LABELS, type InterestOption } from "./interest-options";
import type { UserProfile } from "@/types";

function formatJoinDate(isoDate: string, language: Language): string {
  return new Date(isoDate).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { year: "numeric", month: "long" });
}

const ROW_CLASS = "flex items-center gap-2.5 px-3.5 py-3 text-small text-text-secondary";

/**
 * The profile's "Hakkında" side column (Albüm, docs/history/203-*; only from `lg` — below it the same details are the
 * "Hakkında" tab): website, join date, interests. The public collections stay the ring strip above the tabs.
 * Only fields the person actually has are drawn (same rule as `ProfileAbout`).
 */
export function ProfileAside({ user }: { user: UserProfile }) {
  const { t, language } = useTranslation();
  return (
    <DetailAside className="hidden lg:block">
      <AsideSection id="profile-aside-about" title={t("profile.tabAbout")}>
        <div className="divide-y divide-border-soft" data-profile-aside="about">
          {user.website && (
            <a
              href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
              target="_blank"
              rel="noreferrer noopener"
              className={`${ROW_CLASS} text-primary hover:underline`}
            >
              <Globe size={15} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{user.website}</span>
            </a>
          )}
          <p className={ROW_CLASS}>
            <Calendar size={15} className="shrink-0" aria-hidden />
            {t("profile.joinedOn", { date: formatJoinDate(user.createdAt, language) })}
          </p>
          {user.interests && user.interests.length > 0 && (
            <div className="space-y-2 px-3.5 py-3">
              <p className="text-caption font-semibold text-text-muted">{t("profile.creativeInterests")}</p>
              <div className="flex flex-wrap gap-1.5">
                {user.interests.map((interest) => (
                  <Badge key={interest}>{interest in INTEREST_OPTION_LABELS ? t(INTEREST_OPTION_LABELS[interest as InterestOption]) : interest}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </AsideSection>

    </DetailAside>
  );
}
