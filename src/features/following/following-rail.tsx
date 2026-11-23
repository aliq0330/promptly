"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { FollowFeedSettings } from "@/lib/supabase/following-activity";
import { profileHref } from "@/lib/utils";
import { changeFollowFeedSetting, useFollowFeedSettings } from "./follow-feed-store";
import { FollowManageModal } from "./follow-manage-modal";
import { useActivitySummary } from "./use-following-activity";
import { useActorProfiles } from "./use-actor-profiles";

const SETTING_ROWS: { key: keyof FollowFeedSettings; label: TranslationKey; hint: TranslationKey }[] = [
  { key: "groupPosts", label: "follow.settings.group", hint: "follow.settings.groupHint" },
  { key: "includeTags", label: "follow.settings.tags", hint: "follow.settings.tagsHint" },
  { key: "includeTools", label: "follow.settings.tools", hint: "follow.settings.toolsHint" },
  { key: "showVersions", label: "follow.settings.versions", hint: "follow.settings.versionsHint" },
  { key: "showSpaceActivity", label: "follow.settings.spaces", hint: "follow.settings.spacesHint" },
  { key: "showResults", label: "follow.settings.results", hint: "follow.settings.resultsHint" },
];

/** "Akışta neler görünsün" anahtarları — sağ sütunda ve telefondaki Filtre penceresinde AYNI liste. */
export function FollowFeedSettingsList() {
  const { t } = useTranslation();
  const { settings, loaded } = useFollowFeedSettings(true);
  return (
    <div className="flex flex-col gap-1" data-follow-settings="">
      {SETTING_ROWS.map((row) => (
        <SwitchRow
          key={row.key}
          checked={settings[row.key]}
          disabled={!loaded}
          onChange={(next) => void changeFollowFeedSetting({ [row.key]: next })}
          className="py-2"
        >
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-small font-semibold text-text">{t(row.label)}</span>
            <span className="block text-caption text-text-muted">{t(row.hint)}</span>
          </span>
        </SwitchRow>
      ))}
    </div>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-soft p-4">
      <h2 className="mb-3 font-display text-h3 font-bold tracking-[-0.02em] text-text">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Ana Sayfa'nın sağ sütunu Takip Ettiklerin açıkken (docs/history/451-*): bu hafta en çok paylaşanlar, akış ayarları ve takip sayıları +
 * "Takip ettiklerini yönet". Sayılar `following_activity_summary`'den (son 7 gün).
 */
export function FollowingRail() {
  const { t } = useTranslation();
  const { reload } = useFollowFeedSettings(true);
  const [manageOpen, setManageOpen] = useState(false);
  const weekAgo = useMemo(() => new Date(Date.now() - 7 * 86_400_000).toISOString(), []);
  const summary = useActivitySummary(weekAgo, true, reload);
  const top = (summary?.actors ?? []).slice(0, 5);
  const profiles = useActorProfiles(top.map((actor) => actor.id));
  const max = Math.max(1, ...top.map((actor) => actor.count));

  return (
    <div className="space-y-4" data-following-rail="">
      {top.length > 0 && (
        <RailCard title={t("follow.rail.topPosters")}>
          <ul className="space-y-3">
            {top.map((actor) => {
              const profile = profiles.get(actor.id);
              if (!profile) return null;
              return (
                <li key={actor.id}>
                  <Link href={profileHref(profile)} className="flex items-center gap-3 rounded-sm text-small">
                    <Avatar src={profile.avatarUrl} alt="" size={32} />
                    <span className="w-20 truncate font-semibold text-text">{profile.displayName.split(" ")[0]}</span>
                    <span aria-hidden className="h-2 flex-1 rounded-full bg-surface">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((actor.count / max) * 100)}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums text-text-secondary">{actor.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {summary && (
            <p className="mt-3 text-caption text-text-muted">{t("follow.rail.activeOf", { active: summary.activePeople, total: summary.following })}</p>
          )}
        </RailCard>
      )}

      <RailCard title={t("follow.settings.title")}>
        <FollowFeedSettingsList />
      </RailCard>

      {summary && (
        <RailCard title={t("follow.rail.counts")}>
          <dl className="grid grid-cols-2 gap-2 text-center">
            {[
              { value: summary.following, label: t("follow.rail.people") },
              { value: summary.tagsFollowed, label: t("follow.rail.tags") },
              { value: summary.toolsFollowed, label: t("follow.rail.tools") },
              { value: summary.spacesFollowed, label: t("follow.rail.spaces") },
            ].map((item) => (
              <div key={item.label} className="rounded-md bg-surface px-2 py-3">
                <dt className="sr-only">{item.label}</dt>
                <dd className="font-display text-h2 font-bold tabular-nums text-text">{item.value}</dd>
                <dd aria-hidden className="text-caption text-text-muted">
                  {item.label}
                </dd>
              </div>
            ))}
          </dl>
          <Button variant="outline" className="mt-3 w-full" onClick={() => setManageOpen(true)} aria-haspopup="dialog">
            {t("follow.manage.open")}
          </Button>
        </RailCard>
      )}
      {manageOpen && <FollowManageModal onClose={() => setManageOpen(false)} />}
    </div>
  );
}
