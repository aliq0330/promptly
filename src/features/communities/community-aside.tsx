"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Avatar } from "@/components/ui/avatar";
import { useCommunityOnlineMembers } from "@/features/presence/community-presence";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { fetchCommunityMembers, type CommunityMember } from "@/lib/supabase/communities";
import { profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup } from "@/types";

const ASIDE_CARD = "rounded-xl bg-surface-soft p-4";
const ASIDE_TITLE = "font-display text-h3 font-bold text-text";
const RULES_PREVIEW = 4;

/**
 * Üye listesinin ilk sayfası (rütbe sırasıyla: sahip → yönetici → moderatör → üye), başlıktaki avatar yığını ve yan sütundaki "Yöneticiler"
 * için. `community_members` yalnız ÜYEYE açıktır (docs/history/175-*): üye olmayanda hiç çağrılmaz, ikisi de çizilmez. Hata sessizdir — bu
 * özetler sayfanın geri kalanını beklemez.
 */
export function useCommunityPeople(groupId: string, isMember: boolean): CommunityMember[] {
  const [people, setPeople] = useState<CommunityMember[]>([]);
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    fetchCommunityMembers(groupId, { search: "", role: null, offset: 0 })
      .then((page) => !cancelled && setPeople(page.members))
      .catch((err) => {
        console.error("community people", err);
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, isMember]);
  return isMember ? people : [];
}

/** Kural metninin satırları — "1." / "-" / "•" önekleri atılır (liste kendi numarasını verir). */
export function ruleLines(rules: string | null): string[] {
  return (rules ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s*/, ""))
    .filter(Boolean);
}

/**
 * Topluluk sayfasının sağ yardımcı sütunu (Meydan, docs/history/190-* Faz 6; yalnız `xl`+ ve Akış/Etkinlikler sekmesinde): «Hakkında ve kurallar»
 * (kuruluş tarihi + kuralların ilk satırları, tamamı "Hakkında ve kurallar" sekmesinde) ve — yalnız üyeye ve durumu görünen kişiler varsa —
 * «Çevrimiçi» (avatar yığını). Etkinlik sekmelerin altındaki şeritte, yöneticiler Üyeler sekmesindedir (docs/history/474-*). Yeni veri
 * kaynağı yok: topluluk satırı sayfada zaten var, çevrimiçi üyeler sunucuda kişi başına gizlilikle süzülür.
 */
export function CommunityAside({ group, isMember, onReadRules }: { group: ChatGroup; isMember: boolean; onReadRules: () => void }) {
  const { t, language } = useTranslation();
  const rules = ruleLines(group.rules);
  const online = useCommunityOnlineMembers(group.id, { limit: 8, enabled: isMember });

  return (
    <>
      <section className={ASIDE_CARD} aria-labelledby="community-aside-about" data-community-aside="about">
        <h2 id="community-aside-about" className={ASIDE_TITLE}>
          {t("communities.aside.aboutRules")}
        </h2>
        {rules.length > 0 && (
          <ol className="mt-2 list-decimal space-y-1 pl-5 font-serif text-small text-text-secondary marker:text-text-muted" data-community-aside="rules">
            {rules.slice(0, RULES_PREVIEW).map((line, index) => (
              <li key={index} className="break-words">
                {line}
              </li>
            ))}
          </ol>
        )}
        {rules.length > 0 && (
          <button type="button" onClick={onReadRules} className="mt-2.5 flex items-center gap-1 rounded-sm text-caption font-semibold text-primary-text hover:text-primary-hover">
            {t("communities.aside.readRules")} <ArrowRight size={12} aria-hidden />
          </button>
        )}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted">
          <span>{t("communities.aside.since", { date: new Date(group.createdAt).toLocaleDateString(language) })}</span>
        </p>
      </section>

      {online.enabled && online.members.length > 0 && (
        <section className={ASIDE_CARD} aria-labelledby="community-aside-online" data-community-aside="online">
          <h2 id="community-aside-online" className={ASIDE_TITLE}>
            {t("communities.aside.online")} · {online.members.length >= 8 ? "8+" : online.members.length}
          </h2>
          <ul className="mt-3 flex -space-x-2">
            {online.members.map((member) => (
              <li key={member.userId} className="inline-flex rounded-full ring-2 ring-surface-soft">
                <Link href={profileHref({ username: member.username })} aria-label={member.displayName}>
                  <PresenceAvatar userId={member.userId} src={member.avatarUrl} alt="" size={32} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Başlıktaki küçük avatar yığını: üye listesinin ilk birkaç kişisi (yalnız üyeye; görsel özet — sayı yanındaki metindedir). */
export function MemberStack({ people }: { people: CommunityMember[] }) {
  const { t } = useTranslation();
  if (people.length === 0) return null;
  return (
    <span className="flex -space-x-2" role="img" aria-label={t("communities.detail.membersPreview")} data-member-stack>
      {people.slice(0, 4).map((person) => (
        <span key={person.userId} aria-hidden className="inline-flex rounded-full ring-2 ring-surface">
          <Avatar src={person.avatarUrl} alt={person.displayName} size={24} />
        </span>
      ))}
    </span>
  );
}
