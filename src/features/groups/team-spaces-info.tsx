"use client";

import { useEffect, useState } from "react";
import { Shapes } from "@/components/icons/shapes";
import { InfoCard, InfoRow } from "@/features/messages/info-panel-kit";
import { useTranslation } from "@/lib/i18n/language-provider";
import { teamHref } from "@/lib/communities";
import { spaceHref } from "@/lib/spaces";
import { fetchTeamSpaces, type SpaceSummary } from "@/lib/supabase/spaces";

/**
 * Sohbet bilgi panelinde ekibin ortak Space'leri (docs/history/349-*): yalnız KISA liste + "Tüm Space'ler" bağlantısı. Space yönetimi buraya
 * eklenmez (topluluk sayfasına bağlanır; docs/history/183-* sorumluluk ayrımı). Ekip değilse, Space yoksa ya da okuma başarısızsa hiçbir şey çizilmez.
 */
export function TeamSpacesInfo({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);

  useEffect(() => {
    let alive = true;
    fetchTeamSpaces(groupId, 5)
      .then((list) => alive && setSpaces(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (spaces.length === 0) return null;
  return (
    <InfoCard aria-labelledby="info-team-spaces-title" data-testid="team-spaces-info">
      <h3 id="info-team-spaces-title" className="px-4 pb-1 pt-3.5 text-label font-semibold text-text">
        {t("team.chat.spacesTitle")}
      </h3>
      {spaces.slice(0, 4).map((space) => (
        <InfoRow key={space.id} icon={<Shapes size={18} strokeWidth={1.75} />} href={spaceHref(space.id)} testId={`team-space-${space.id}`}>
          {space.title}
        </InfoRow>
      ))}
      <InfoRow icon={<Shapes size={18} strokeWidth={1.75} />} href={teamHref(groupId, "spaces")} value={spaces.length > 4 ? "…" : undefined} testId="team-spaces-all">
        {t("team.chat.allSpaces")}
      </InfoRow>
    </InfoCard>
  );
}
