"use client";

import { ScrollText } from "@/components/icons/scroll-text";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { AnnouncementsSection } from "./announcements-section";
import type { CommunityTabProps } from "./community-page";
import { acceptCommunityRules } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Akışın üstündeki ince özet: (varsa) güncel kuralları kabul uyarısı, kapatılmış topluluk notu ve son duyurular (en yakın etkinlik artık
 * sekmelerin altındaki «Odalar ve etkinlik» şeridindedir, docs/history/475-*).
 * Bunların hiçbiri yoksa HİÇBİR ŞEY çizilmez — akış ilk açılış ekranıdır, özet onu itmez. Yönetim (duyuru yayınlama vb.) "Yönet" sekmesindedir.
 */
export function FeedHighlights({ group, role, membership, reload, onToast, goTab }: CommunityTabProps) {
  const { t } = useTranslation();
  const accept = useAsyncAction();
  const needsRulesAck = Boolean(role) && group.rulesRequired && Boolean(group.rules) && (membership?.acceptedRulesVersion ?? 0) < group.rulesVersion;

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
          <ScrollText size={20} className="shrink-0 text-primary-text" aria-hidden />
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
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-small text-text">
          {t("communities.detail.closedNotice")}
        </p>
      )}

      <AnnouncementsSection group={group} role={role} limit={3} onToast={onToast} highlight />

    </div>
  );
}
