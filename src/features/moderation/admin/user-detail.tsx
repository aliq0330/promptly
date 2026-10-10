"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchAdminUser, type AdminActivityKind, type AdminUser } from "@/lib/supabase/admin";
import { formatCount, formatRelativeTime } from "@/lib/utils";
import { ActivityList } from "./activity-list";
import { AuditList } from "./audit-list";
import { FilesList } from "./files-list";
import { formatBytes, formatDateTime } from "./format";
import { MessagesPanel } from "./messages-panel";
import { UserActions } from "./user-actions";
import { UserBadges } from "./users-panel";

const CARD = "rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5";
type DetailTab = AdminActivityKind | "messages" | "files" | "audit";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-soft p-3">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-0.5 text-h3 font-semibold tabular-nums text-text">{value}</p>
    </div>
  );
}

function StorageBar({ label, bytes, total }: { label: string; bytes: number; total: number }) {
  const pct = total > 0 ? Math.max(bytes > 0 ? 2 : 0, Math.round((bytes / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-small">
        <span className="text-text">{label}</span>
        <span className="tabular-nums text-text-secondary">{formatBytes(bytes)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { t, language } = useTranslation();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<DetailTab>("posts");
  const [auditKey, setAuditKey] = useState(0);

  const reload = useCallback(async () => {
    try {
      const next = await fetchAdminUser(userId);
      if (!next) setMissing(true);
      setUser(next);
      setAuditKey((n) => n + 1);
    } catch {
      setMissing(true);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
      <ArrowLeft size={16} aria-hidden /> {t("admin.users.back")}
    </Button>
  );

  if (missing) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-small text-text-muted">{t("admin.users.empty")}</p>
      </div>
    );
  }
  if (!user) return <p className="text-small text-text-muted">{t("common.loading")}</p>;

  const tabs: TabItem<DetailTab>[] = [
    { key: "posts", label: t("admin.user.tab.posts"), count: user.postsTotal },
    { key: "comments", label: t("admin.user.tab.comments"), count: user.comments },
    { key: "likes", label: t("admin.user.tab.likes"), count: user.likesGiven },
    { key: "saves", label: t("admin.user.tab.saves"), count: user.saves },
    { key: "follows", label: t("admin.user.tab.follows"), count: user.followers + user.following },
    { key: "messages", label: t("admin.user.tab.messages"), count: user.messages },
    { key: "reports", label: t("admin.user.tab.reports"), count: user.reportsFiled + user.reportsAgainst },
    { key: "files", label: t("admin.user.tab.files"), count: user.storageFiles },
    { key: "audit", label: t("admin.user.tab.audit") },
  ];

  return (
    <div className="space-y-4">
      {back}

      <section className={CARD}>
        <div className="flex items-start gap-4">
          <Avatar src={user.avatarUrl} alt={user.displayName} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-h3 font-semibold text-text">{user.displayName}</h2>
              <span className="text-small text-text-muted">@{user.username}</span>
              <UserBadges user={user} />
            </div>
            <p className="mt-1 break-all text-small text-text-secondary">
              {t("admin.user.email")}: {user.email}
            </p>
            <p className="text-caption text-text-muted">
              {t("admin.user.joined")}: {formatDateTime(user.createdAt, language)} · {t("admin.user.lastActive")}:{" "}
              {user.lastSignInAt ? formatRelativeTime(user.lastSignInAt, language) : t("admin.user.neverSignedIn")}
            </p>
            {user.bio && <p className="mt-2 break-words text-small text-text-secondary">{user.bio}</p>}
            <Link href={`/profile/real?username=${encodeURIComponent(user.username)}`} className="mt-2 inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
              <ExternalLink size={12} aria-hidden /> {t("admin.user.openProfile")}
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label={t("admin.user.stat.posts")} value={formatCount(user.postsTotal)} />
        <Stat label={t("admin.user.stat.comments")} value={formatCount(user.comments)} />
        <Stat label={t("admin.user.stat.likesGiven")} value={formatCount(user.likesGiven)} />
        <Stat label={t("admin.user.stat.likesReceived")} value={formatCount(user.likesReceived)} />
        <Stat label={t("admin.user.stat.saves")} value={formatCount(user.saves)} />
        <Stat label={t("admin.user.stat.followers")} value={formatCount(user.followers)} />
        <Stat label={t("admin.user.stat.following")} value={formatCount(user.following)} />
        <Stat label={t("admin.user.stat.messages")} value={formatCount(user.messages)} />
        <Stat label={t("admin.user.stat.conversations")} value={formatCount(user.conversations)} />
        <Stat label={t("admin.user.stat.reportsFiled")} value={user.reportsFiled} />
        <Stat label={t("admin.user.stat.reportsAgainst")} value={user.reportsAgainst} />
      </div>
      <p className="text-caption text-text-muted">{t("admin.user.postsBreakdown", { prompts: user.prompts, requests: user.requests, generators: user.generators, workflows: user.workflows, presets: user.presets })}</p>

      <section className={CARD}>
        <h3 className="mb-3 text-small font-semibold text-text">{t("admin.user.storageTitle")}</h3>
        <div className="space-y-3">
          <StorageBar label={t("admin.user.storageImages")} bytes={user.imageBytes} total={user.storageBytes} />
          <StorageBar label={t("admin.user.storageVideos")} bytes={user.videoBytes} total={user.storageBytes} />
          <StorageBar label={t("admin.user.storageAudio")} bytes={user.audioBytes} total={user.storageBytes} />
        </div>
        <p className="mt-3 text-small text-text-secondary">
          {t("admin.user.storageTotal")}: <span className="font-semibold tabular-nums text-text">{formatBytes(user.storageBytes)}</span> · {t("admin.stats.files", { count: user.storageFiles })}
        </p>
      </section>

      <UserActions user={user} onChanged={reload} onDeleted={onBack} />

      <section className={CARD}>
        <Tabs items={tabs} active={tab} onChange={setTab} ariaLabel={t("admin.user.tabsAria")} />
        <div className="pt-4">
          {tab === "messages" ? (
            <MessagesPanel userId={user.id} />
          ) : tab === "files" ? (
            <FilesList userId={user.id} />
          ) : tab === "audit" ? (
            <AuditList key={auditKey} userId={user.id} />
          ) : (
            <ActivityList key={tab} userId={user.id} kind={tab} />
          )}
        </div>
      </section>
    </div>
  );
}
