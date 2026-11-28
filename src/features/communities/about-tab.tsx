"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PrefsPage } from "./manage-sx-people";
import { SxCard, SxRow } from "@/features/settings/sx";
import { communityHref } from "@/lib/communities";
import { Check } from "@/components/icons/check";
import { ScrollText } from "@/components/icons/scroll-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/features/groups/role-badge";
import { ReportButton } from "@/features/moderation/report-button";
import { VisibilityLabel } from "./visibility-label";
import { OnlineMembersStrip } from "@/features/presence/online-members";
import { useAsyncAction } from "@/features/groups/use-async-action";
import type { CommunityTabProps } from "./community-page";
import { acceptCommunityRules } from "@/lib/supabase/communities";
import { communityTopicLabelKey } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Hakkında ve kurallar: açıklama + temel bilgiler, topluluk kuralları (kabul zorunluysa üyelik akışına etkisi açıkça yazılır) ve — üye için —
 * KİŞİYE ÖZEL tercihler: topluluk bildirim düzeyi (Tümü · Yalnız önemli · Sessiz, isteğe bağlı süreli sessize alma), sohbeti sessize alma ve
 * topluluktan ayrılma. Sessize alma ve ayrılma sohbet bilgi penceresiyle AYNI bileşenlerdir (`ChatMuteToggle`, `LeaveCommunitySection`).
 */
export function AboutTab({ group, role, viewerId, membership, reload, onToast }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accept = useAsyncAction();

  const accepted = (membership?.acceptedRulesVersion ?? 0) >= group.rulesVersion;

  async function acknowledge() {
    const ok = await accept.run(async () => {
      await acceptCommunityRules(group.id);
      return true;
    });
    if (!ok) return;
    onToast(t("communities.rules.acceptedToast"));
    await reload();
  }

  if (role && searchParams.get("section") === "prefs") {
    const sub = searchParams.get("sub");
    return <PrefsPage group={group} membership={membership} viewerId={viewerId} reload={reload} onToast={onToast} sub={sub} setSub={(next) => router.replace(`${communityHref(group.id, "about", "prefs")}${next ? `&sub=${next}` : ""}`)} />;
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="about-info-title" className="space-y-3">
        <h2 id="about-info-title" className="text-label font-semibold text-text">
          {t("groups.about.description")}
        </h2>
        <p className={`whitespace-pre-wrap break-words text-small ${group.description ? "text-text-secondary" : "text-text-muted"}`}>{group.description || t("groups.about.noDescription")}</p>
        <dl className="grid gap-2 text-small sm:grid-cols-3">
          <div className="rounded-lg card-soft px-3 py-2">
            <dt className="text-caption text-text-muted">{t("groups.visibility.label")}</dt>
            <dd className="mt-0.5 font-medium text-text">
              <VisibilityLabel visibility={group.visibility} size={16} className="flex items-center gap-1.5" />
            </dd>
          </div>
          <div className="rounded-lg card-soft px-3 py-2">
            <dt className="text-caption text-text-muted">{t("groups.about.members")}</dt>
            <dd className="mt-0.5 font-medium text-text">{t("groups.about.membersValue", { count: group.memberCount, max: group.memberLimit })}</dd>
          </div>
          {role && (
            <div className="rounded-lg card-soft px-3 py-2">
              <dt className="text-caption text-text-muted">{t("groups.about.yourRole")}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-text">{role === "member" ? t("groups.role.member") : <RoleBadge role={role} />}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Yönetim ekibinden şu an çevrimiçi olanlar (docs/history/329-*): şikâyet/katılım isteği için kime ulaşılabileceği. Üyeye ve herkese açık
          topluluğun okuyucusuna; kapalı topluluk üye olmayana hiçbir şey vermez (sunucu). */}
      {viewerId && (
        <OnlineMembersStrip
          groupId={group.id}
          staffOnly
          title={t("presence.staffTitle")}
          hint={t("presence.staffHint")}
          emptyText={t("presence.staffEmpty")}
          limit={8}
          className="rounded-lg card-flat px-4 py-3"
        />
      )}

      <section aria-labelledby="about-rules-title" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="about-rules-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <ScrollText size={16} aria-hidden /> {t("communities.rules.title")}
          </h2>
          <Badge variant="neutral">{t(communityTopicLabelKey(group))}</Badge>
          {group.rules && <Badge variant="outline">{t("communities.rules.version", { version: group.rulesVersion })}</Badge>}
        </div>
        {group.rules ? (
          <div className="whitespace-pre-wrap break-words rounded-lg card-flat px-4 py-3 text-small text-text-secondary">{group.rules}</div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-small text-text-muted">{t("communities.rules.none")}</p>
        )}
        {group.rulesRequired && group.rules && <p className="text-caption text-text-muted">{t("communities.rules.requiredNote")}</p>}
        {role && group.rulesRequired && group.rules && (
          <div className="flex flex-wrap items-center gap-3">
            {accepted ? (
              <span className="inline-flex items-center gap-1.5 text-small text-success">
                <Check size={16} aria-hidden /> {t("communities.rules.acceptedState")}
              </span>
            ) : (
              <Button type="button" size="sm" onClick={() => void acknowledge()} disabled={accept.busy}>
                {t("communities.rules.accept")}
              </Button>
            )}
          </div>
        )}
        {accept.error && (
          <p role="alert" className="text-caption text-danger">
            {accept.error}
          </p>
        )}
      </section>

      {role && (
        <div className="sx">
          <SxCard style={{ margin: 0 }}>
            <SxRow href={communityHref(group.id, "about", "prefs")} title={t("ay.prefs.title")} desc={t("ay.prefs.entryDesc")} testId="about-prefs-entry" />
          </SxCard>
        </div>
      )}

      {/* Topluluğun kendisini şikâyet etme (docs/history/305-*): merkezi pencere → `submit_report('community')`; sahibi kendi topluluğunu şikâyet edemez. */}
      {viewerId && role !== "owner" && (
        <div className="border-t border-border-soft pt-4">
          <ReportButton targetType="community" targetId={group.id} title={group.name} menuItem={false} label={t("communities.about.reportCommunity")} />
        </div>
      )}
    </div>
  );
}
