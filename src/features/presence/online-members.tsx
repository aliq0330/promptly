"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { RoleBadge } from "@/features/groups/role-badge";
import { useCommunityOnlineMembers } from "./community-presence";
import { PresenceAvatar } from "./presence-ui";

/**
 * Toplulukta şu an çevrimiçi olan üyeler (docs/history/329-*): topluluk bilgi sayfası ve Hakkında'daki "Yönetim ekibinden çevrimiçi olanlar".
 * Liste sunucudan gelir (`community_online_members`), her kişi için izleyicinin görme izni uygulanır; boşsa kısa bir not, özellik kapalıysa
 * (oturum yok, kendi durumu gizli, sunucuda yok) hiçbir şey çizilmez.
 */
export function OnlineMembersStrip({
  groupId,
  staffOnly = false,
  title,
  hint,
  emptyText,
  limit = 12,
  moreHref,
  className,
  frame,
}: {
  groupId: string;
  staffOnly?: boolean;
  title: string;
  hint?: string;
  emptyText: string;
  limit?: number;
  moreHref?: string;
  className?: string;
  /** Dış çerçeve (ör. bilgi sayfasının kartı): özellik kapalıyken çerçeve de çizilmez. */
  frame?: (content: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const { enabled, loading, members } = useCommunityOnlineMembers(groupId, { staffOnly, limit });
  if (!enabled) return null;
  const content = (
    <section className={className} aria-label={title} data-online-members={staffOnly ? "staff" : "all"}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-label font-semibold text-text">
          <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
          {title}
          {members.length > 0 && <span className="font-normal text-text-muted">{members.length >= limit ? `${limit}+` : members.length}</span>}
        </h3>
        {moreHref && members.length > 0 && (
          <Link href={moreHref} className="shrink-0 text-caption font-medium text-primary hover:underline">
            {t("presence.onlineMembersMore")}
          </Link>
        )}
      </div>
      {hint && <p className="mt-0.5 text-caption text-text-muted">{hint}</p>}
      {loading ? (
        <div className="mt-2.5 flex gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-10 w-10 rounded-full bg-surface-soft" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="mt-2 text-small text-text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2.5">
          {members.map((member) => (
            <li key={member.userId}>
              <Link
                href={profileHref({ username: member.username })}
                className="flex max-w-[12rem] items-center gap-2 rounded-full py-0.5 pr-2 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PresenceAvatar userId={member.userId} src={member.avatarUrl} alt={member.displayName} size={36} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-small font-medium text-text">{member.displayName}</span>
                  {member.role !== "member" && <RoleBadge role={member.role} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return <>{frame ? frame(content) : content}</>;
}
