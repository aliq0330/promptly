"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "@/components/icons/plus";
import { Shapes } from "@/components/icons/shapes";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceCard } from "@/features/spaces/space-card";
import { CreateTeamSpaceModal } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { can } from "@/lib/chat-groups";
import { spaceHref, TEAM_SPACES_MAX } from "@/lib/spaces";
import { fetchLeadPalettes, fetchTeamSpaces, type SpaceSummary } from "@/lib/supabase/spaces";
import type { CommunityTabProps } from "./community-page";

/**
 * Ekibin Space'leri (docs/history/349-*): yalnız ekip alanında (tamamen kapalı topluluk) görünen sekme. Üye ekibin bütün Space'lerini görür ve
 * düzenler; "Yeni Space" yalnız `create_spaces` yetkisi olana (sahip her zaman) görünür. Yetki ve 50 Space sınırı sunucudadır (`create_team_space`).
 */
export function SpacesTab({ group, role, viewerId }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [palettes, setPalettes] = useState<Map<string, string[]>>(new Map());
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(role) && can(role, "create_spaces", group.rolePermissions) && !group.closedAt;

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchTeamSpaces(group.id)
      .then((list) => {
        if (!alive) return;
        setSpaces(list);
        setFailed(false);
        void fetchLeadPalettes(list.map((space) => space.id)).then((map) => alive && setPalettes(map)).catch(() => undefined);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [group.id, attempt]);

  const full = (spaces?.length ?? 0) >= TEAM_SPACES_MAX;

  return (
    <div className="space-y-4" data-testid="team-spaces">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-small text-text-secondary">{t("team.spaces.intro")}</p>
        {spaces && <span className="text-caption text-text-muted">{t("team.spaces.count", { count: spaces.length, max: TEAM_SPACES_MAX })}</span>}
        {canCreate && (
          <Button onClick={() => setCreating(true)} disabled={full} data-team-space-new>
            <Plus size={16} aria-hidden />
            {t("team.spaces.new")}
          </Button>
        )}
      </div>
      {canCreate && full && <p className="text-caption text-text-muted">{t("team.spaces.limitReached")}</p>}

      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-small text-danger">
            {t("team.spaces.loadError")}
          </p>
          <Button variant="outline" size="sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>
            {t("common.retry")}
          </Button>
        </div>
      ) : spaces === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="hidden h-56 w-full rounded-lg sm:block" />
        </div>
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title={t("team.spaces.empty")}
          description={canCreate ? t("team.spaces.emptyCreator") : t("team.spaces.emptyMember")}
          action={canCreate ? { label: t("team.spaces.new"), onClick: () => setCreating(true) } : undefined}
        />
      ) : (
        <ul data-testid="team-spaces-list" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {spaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              layout="grid"
              userId={viewerId}
              palette={palettes.get(space.id)}
              onChange={(next) => setSpaces((list) => (list ?? []).map((s) => (s.id === next.id ? { ...next, communityId: group.id } : s)))}
              onRemove={(id) => setSpaces((list) => (list ?? []).filter((s) => s.id !== id))}
            />
          ))}
        </ul>
      )}

      {creating && (
        <CreateTeamSpaceModal
          communityId={group.id}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(spaceHref(id));
          }}
        />
      )}
    </div>
  );
}
