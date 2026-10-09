"use client";

import { Calendar, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import { INTEREST_OPTION_LABELS, type InterestOption } from "./interest-options";
import type { UserProfile } from "@/types";

function formatJoinDate(isoDate: string, language: Language): string {
  return new Date(isoDate).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { year: "numeric", month: "long" });
}

/**
 * Only ever renders fields the user actually has (CLAUDE.md section 8:
 * "yalnızca mevcut ve kullanıcı tarafından paylaşılmış bilgileri göster").
 * There's no social-links array, location, or AI-tool list in the data
 * model — those aren't invented here; only bio/website/interests/join date
 * exist for real.
 */
export function ProfileAbout({ user }: { user: UserProfile }) {
  const { t, language } = useTranslation();
  const hasAnything = user.bio || user.website || (user.interests && user.interests.length > 0);

  return (
    <div className="space-y-5 px-4 py-5 lg:px-6">
      {user.bio && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm text-text">{user.bio}</p>}

      <div className="space-y-2 text-sm text-text-muted">
        {user.website && (
          <a
            href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <Globe size={15} className="shrink-0" />
            {user.website}
          </a>
        )}
        <p className="flex items-center gap-2">
          <Calendar size={15} className="shrink-0" />
          {t("profile.joinedOn", { date: formatJoinDate(user.createdAt, language) })}
        </p>
      </div>

      {user.interests && user.interests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("profile.creativeInterests")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user.interests.map((interest) => (
              <Badge key={interest}>{interest in INTEREST_OPTION_LABELS ? t(INTEREST_OPTION_LABELS[interest as InterestOption]) : interest}</Badge>
            ))}
          </div>
        </div>
      )}

      {!hasAnything && (
        <p className="py-6 text-center text-sm text-text-muted">
          {t("profile.noAdditionalInfo")}
        </p>
      )}
    </div>
  );
}
