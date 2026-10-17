"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMuteToggle, LeaveCommunitySection } from "@/features/groups/personal-prefs";
import { RoleBadge } from "@/features/groups/role-badge";
import { VisibilityLabel } from "./visibility-label";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import type { CommunityTabProps } from "./community-page";
import { acceptCommunityRules, setCommunityNotifyPrefs } from "@/lib/supabase/communities";
import { CATEGORY_LABEL_KEYS, effectiveNotifyLevel, isTemporarilyMuted, MUTE_DURATIONS_HOURS, muteUntilIso, NOTIFY_LEVELS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { CommunityNotifyLevel } from "@/types";

/**
 * Hakkında ve kurallar: açıklama + temel bilgiler, topluluk kuralları (kabul zorunluysa üyelik akışına etkisi açıkça yazılır) ve — üye için —
 * KİŞİYE ÖZEL tercihler: topluluk bildirim düzeyi (Tümü · Yalnız önemli · Sessiz, isteğe bağlı süreli sessize alma), sohbeti sessize alma ve
 * topluluktan ayrılma. Sessize alma ve ayrılma sohbet bilgi penceresiyle AYNI bileşenlerdir (`ChatMuteToggle`, `LeaveCommunitySection`).
 */
export function AboutTab({ group, role, viewerId, membership, reload, onToast, goTab }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh, patchConversation } = useRealMessages();
  const accept = useAsyncAction();
  const prefs = useAsyncAction();
  const [muteMenu, setMuteMenu] = useState(false);

  const accepted = (membership?.acceptedRulesVersion ?? 0) >= group.rulesVersion;
  // Seçim hemen görünür (sunucu yanıtı beklenmez); kayıt başarısızsa eski değere döner.
  const [pendingLevel, setPendingLevel] = useState<CommunityNotifyLevel | null>(null);
  const level = pendingLevel ?? membership?.notifyLevel ?? "all";
  const mutedUntil = membership?.notifyMutedUntil ?? null;
  const effective = effectiveNotifyLevel(level, mutedUntil);
  const tempMuted = isTemporarilyMuted(mutedUntil);

  async function acknowledge() {
    const ok = await accept.run(async () => {
      await acceptCommunityRules(group.id);
      return true;
    });
    if (!ok) return;
    onToast(t("communities.rules.acceptedToast"));
    await reload();
  }

  async function savePrefs(nextLevel: CommunityNotifyLevel, until: string | null) {
    if (!viewerId) return;
    setPendingLevel(nextLevel);
    const ok = await prefs.run(async () => {
      await setCommunityNotifyPrefs(group.id, viewerId, nextLevel, until);
      return true;
    });
    if (!ok) {
      setPendingLevel(null);
      return;
    }
    setMuteMenu(false);
    onToast(t("communities.notify.savedToast"));
    await reload();
    setPendingLevel(null);
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="about-info-title" className="space-y-3">
        <h2 id="about-info-title" className="text-label font-semibold text-text">
          {t("groups.about.description")}
        </h2>
        <p className={`whitespace-pre-wrap break-words text-small ${group.description ? "text-text-secondary" : "text-text-muted"}`}>{group.description || t("groups.about.noDescription")}</p>
        <dl className="grid gap-2 text-small sm:grid-cols-3">
          <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2">
            <dt className="text-caption text-text-muted">{t("groups.visibility.label")}</dt>
            <dd className="mt-0.5 font-medium text-text">
              <VisibilityLabel visibility={group.visibility} size={14} className="flex items-center gap-1.5" />
            </dd>
          </div>
          <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2">
            <dt className="text-caption text-text-muted">{t("groups.about.members")}</dt>
            <dd className="mt-0.5 font-medium text-text">{t("groups.about.membersValue", { count: group.memberCount, max: group.memberLimit })}</dd>
          </div>
          {role && (
            <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2">
              <dt className="text-caption text-text-muted">{t("groups.about.yourRole")}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-text">{role === "member" ? t("groups.role.member") : <RoleBadge role={role} />}</dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="about-rules-title" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="about-rules-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <ScrollText size={15} aria-hidden /> {t("communities.rules.title")}
          </h2>
          <Badge variant="neutral">{t(CATEGORY_LABEL_KEYS[group.category])}</Badge>
          {group.rules && <Badge variant="outline">{t("communities.rules.version", { version: group.rulesVersion })}</Badge>}
        </div>
        {group.rules ? (
          <div className="whitespace-pre-wrap break-words rounded-lg border border-border-soft bg-surface px-4 py-3 text-small text-text-secondary">{group.rules}</div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-small text-text-muted">{t("communities.rules.none")}</p>
        )}
        {group.rulesRequired && group.rules && <p className="text-caption text-text-muted">{t("communities.rules.requiredNote")}</p>}
        {role && group.rulesRequired && group.rules && (
          <div className="flex flex-wrap items-center gap-3">
            {accepted ? (
              <span className="inline-flex items-center gap-1.5 text-small text-success">
                <Check size={15} aria-hidden /> {t("communities.rules.acceptedState")}
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

      {role ? (
        <>
          <section aria-labelledby="about-notify-title" className="space-y-3">
            <h2 id="about-notify-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
              {effective === "none" ? <BellOff size={15} aria-hidden /> : <Bell size={15} aria-hidden />} {t("communities.notify.title")}
            </h2>
            <p className="text-caption text-text-muted">{t("communities.notify.help")}</p>
            <div role="radiogroup" aria-label={t("communities.notify.title")} className="space-y-2">
              {NOTIFY_LEVELS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors",
                    level === value ? "border-primary/50 bg-primary-soft/40" : "border-border-soft bg-background hover:border-border-strong",
                  )}
                >
                  <input type="radio" name="notify-level" checked={level === value} onChange={() => void savePrefs(value, null)} disabled={prefs.busy} className="mt-1 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block font-medium text-text">{t(`communities.notify.level.${value}`)}</span>
                    <span className="block text-caption text-text-muted">{t(`communities.notify.level.${value}Help`)}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-2">
              {tempMuted ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-soft px-3.5 py-2.5 text-small text-text-secondary">
                  <BellOff size={15} aria-hidden />
                  <span>{t("communities.notify.mutedUntil", { until: new Date(mutedUntil as string).toLocaleString() })}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void savePrefs(level, null)} disabled={prefs.busy}>
                    {t("communities.notify.unmute")}
                  </Button>
                </div>
              ) : (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => setMuteMenu((prev) => !prev)} aria-expanded={muteMenu}>
                    <BellOff size={14} /> {t("communities.notify.muteFor")}
                  </Button>
                  {muteMenu && (
                    <div role="group" aria-label={t("communities.notify.muteFor")} className="flex flex-wrap gap-2">
                      {MUTE_DURATIONS_HOURS.map((hours) => (
                        <Button key={hours} type="button" size="sm" variant="secondary" disabled={prefs.busy} onClick={() => void savePrefs(level, muteUntilIso(hours))}>
                          {t(`communities.notify.hours.${hours}` as "communities.notify.hours.1")}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {prefs.error && (
              <p role="alert" className="text-caption text-danger">
                {prefs.error}
              </p>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="about-chat-mute-title">
            <h2 id="about-chat-mute-title" className="text-label font-semibold text-text">
              {t("communities.about.chatMuteTitle")}
            </h2>
            <ChatMuteToggle
              groupId={group.id}
              mutedAt={membership?.mutedAt ?? null}
              onMutedChange={(mutedAt) => {
                patchConversation(group.id, { mutedAt });
                void reload();
              }}
              onToast={onToast}
            />
          </section>

          <LeaveCommunitySection
            group={group}
            onLeft={() => {
              void refresh();
              onToast(t("communities.about.leftToast"));
              router.push("/communities");
            }}
            onGoToMembers={() => goTab("members")}
          />
        </>
      ) : null}
    </div>
  );
}
