"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { fetchCommunityMembers, type CommunityMember } from "@/lib/supabase/communities";
import { memberCountText } from "@/lib/group-labels";
import { formatCount, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupRole } from "@/types";

const ASIDE_CARD = "rounded-xl bg-surface-soft p-4";
const ASIDE_TITLE = "font-display text-[1.0625rem] font-bold tracking-[-0.02em] text-text";
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
 * Topluluk sayfasının sağ yardımcı sütunu (Meydan, docs/history/190-* Faz 6; yalnız `xl`+ ve Akış sekmesinde): Hakkında (açıklama + üye ve
 * gönderi sayısı), Kurallar (ilk satırlar, tamamı "Hakkında ve kurallar" sekmesinde) ve — yalnız üyeye — Yöneticiler. Yeni veri kaynağı yok:
 * topluluk satırı sayfada zaten var, yönetici listesi üye listesinin ilk sayfasıdır.
 */
export function CommunityAside({ group, people, onReadRules }: { group: ChatGroup; people: CommunityMember[]; onReadRules: () => void }) {
  const { t } = useTranslation();
  const rules = ruleLines(group.rules);
  const staff = people.filter((person) => person.role !== "member");

  return (
    <>
      <section className={ASIDE_CARD} aria-labelledby="community-aside-about" data-community-aside="about">
        <h2 id="community-aside-about" className={ASIDE_TITLE}>
          {t("communities.aside.about")}
        </h2>
        {group.description && <p className="mt-2 line-clamp-5 whitespace-pre-line break-words text-small text-text-secondary">{group.description}</p>}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary">
          <span>{memberCountText(t, group.memberCount)}</span>
          <span>{t("communities.aside.postCount", { count: formatCount(group.postCount) })}</span>
        </p>
      </section>

      {rules.length > 0 && (
        <section className={ASIDE_CARD} aria-labelledby="community-aside-rules" data-community-aside="rules">
          <h2 id="community-aside-rules" className={ASIDE_TITLE}>
            {t("communities.aside.rules")}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-small text-text-secondary marker:text-text-muted">
            {rules.slice(0, RULES_PREVIEW).map((line, index) => (
              <li key={index} className="break-words">
                {line}
              </li>
            ))}
          </ol>
          <button type="button" onClick={onReadRules} className="mt-2.5 flex items-center gap-1 rounded-sm text-caption font-semibold text-primary hover:text-primary-hover">
            {t("communities.aside.readRules")} <ArrowRight size={13} aria-hidden />
          </button>
        </section>
      )}

      {staff.length > 0 && (
        <section className={ASIDE_CARD} aria-labelledby="community-aside-staff" data-community-aside="staff">
          <h2 id="community-aside-staff" className={ASIDE_TITLE}>
            {t("communities.aside.staff")}
          </h2>
          <ul className="mt-2.5 space-y-2">
            {staff.slice(0, 6).map((person) => (
              <li key={person.userId} className="flex items-center gap-2.5">
                <Avatar src={person.avatarUrl} alt={person.displayName} size={32} />
                <Link href={profileHref(person)} className="min-w-0 flex-1 truncate text-small font-semibold text-text hover:text-primary">
                  {person.displayName}
                </Link>
                <RoleBadge role={person.role as GroupRole} />
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
          <Avatar src={person.avatarUrl} alt={person.displayName} size={22} />
        </span>
      ))}
    </span>
  );
}
