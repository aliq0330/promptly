"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Hash } from "@/components/icons/hash";
import { Lock } from "@/components/icons/lock";
import { Pin } from "@/components/icons/pin";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SegmentedChoice } from "@/features/messages/segmented-choice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { archiveTeamChannel, deleteTeamChannel, setChannelNotify, type TeamActionError, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink, teamRoleCan } from "@/lib/teams";
import { cn } from "@/lib/utils";

type NotifyLevel = "all" | "mentions" | "none";

/**
 * Kanal bilgisi (Yön A, mockup "Ekip 4", docs/history/353-*): ekip sohbetinin ⋮ menüsünden ya da bilgi sayfasındaki kanal satırından açılan alttan sayfa.
 * Kim görür · Kim yazar · Üyeler · Çevrimiçi, bu kanaldaki bildirim düzeyi, sabit mesajlar · ara · ekip sayfası ve (kanal yönetimi yetkisine) Düzenle · Arşivle · Sil.
 * Yetkiyi yalnızca gizlemek yetmez: her işlem sunucuda yeniden yetkilendirilir.
 */
export function ChannelInfoSheet({
  team,
  channel,
  summary,
  onlineCount,
  pinnedCount,
  onShowPinned,
  onSearch,
  onClose,
  onChanged,
  onGone,
}: {
  team: { id: string; slug: string; name: string };
  channel: TeamChannel;
  summary: TeamSummary | null;
  onlineCount: number;
  pinnedCount: number;
  onShowPinned: () => void;
  onSearch: () => void;
  onClose: () => void;
  /** Bildirim düzeyi/ayar değişti: üst bileşen kanal listesini yeniden okur. */
  onChanged: () => void;
  /** Kanal arşivlendi/silindi: sohbet başka bir kanala (ya da listeye) geçer. */
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = teamRoleCan(summary?.myRole, "manage_channels");
  const seesKey = channel.mode === "private" ? "tm.chan.seesPrivate" : channel.mode === "project" ? "tp.chat.seesProject" : channel.mode === "space" ? "tm.chan.seesSpace" : "tm.chan.seesAll";

  async function run(action: () => Promise<void>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirm(null);
      after();
    } catch (e) {
      setError((e as TeamActionError).message ?? t("tm.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const facts: [string, string][] = [
    [t("tm.chan.whoSees"), t(seesKey)],
    [t("tm.chan.whoPosts"), channel.postingPolicy === "admins" ? t("tm.chan.postsAdmins") : t("tm.chan.postsAll")],
    [t("tm.chan.members"), t("tm.chat.memberCount", { count: channel.memberCount })],
    [t("tm.chan.online"), t("tm.chat.memberCount", { count: onlineCount })],
  ];
  const rows: { key: string; label: string; hint?: string; icon: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean; tone?: string }[] = [
    { key: "pinned", label: t("tm.chan.pinned"), hint: String(pinnedCount), icon: <Pin size={19} strokeWidth={1.75} />, onClick: pinnedCount > 0 ? onShowPinned : undefined, disabled: pinnedCount === 0 },
    { key: "search", label: t("tm.chan.search"), icon: <Search size={19} strokeWidth={1.75} />, onClick: onSearch },
    { key: "team", label: t("tm.chan.openTeam"), icon: <ArrowUpRight size={19} strokeWidth={1.75} />, href: teamLink(team.slug, "chat", { channel: channel.name }), tone: "text-primary" },
  ];

  return (
    <>
      <Modal onClose={busy ? () => undefined : onClose} labelledBy="channel-info-title">
        <div data-channel-info className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-border-soft bg-surface shadow-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-5">
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", channel.mode === "private" ? "bg-warning/10 text-warning" : "bg-primary-soft text-primary")} aria-hidden>
              {channel.mode === "private" ? <Lock size={20} /> : <Hash size={21} strokeWidth={2.2} />}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <h2 id="channel-info-title" className="truncate font-display text-h3 font-bold text-text">
                {channel.name}
              </h2>
              <p className="truncate text-small text-text-muted">{t("tm.chan.title", { team: team.name })}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            <p className="text-small leading-relaxed text-text-secondary">{channel.description || t("tm.chan.noDescription")}</p>

            <dl className="overflow-hidden rounded-2xl border border-border-soft">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border-soft px-3.5 py-2.5 text-small last:border-b-0">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className="text-right font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1.5">
              <p className="text-caption font-bold text-text-muted">{t("tm.chan.notifyHeading")}</p>
              <SegmentedChoice<NotifyLevel>
                value={channel.notifyLevel}
                ariaLabel={t("tm.chan.notifyHeading")}
                testId="channel-notify"
                disabled={busy}
                onChange={(next) => void run(() => setChannelNotify(channel.id, next), onChanged)}
                options={[
                  { key: "all", label: t("tm.chat.notify.all") },
                  { key: "mentions", label: t("tm.chat.notify.mentionsShort") },
                  { key: "none", label: t("tm.chat.notify.none") },
                ]}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border-soft">
              {rows.map((row) => {
                const inner = (
                  <>
                    <span className={cn("shrink-0", row.tone ?? "text-text")} aria-hidden>
                      {row.icon}
                    </span>
                    <span className={cn("min-w-0 flex-1 text-small font-semibold", row.tone ?? "text-text")}>{row.label}</span>
                    {row.hint && <span className="text-small text-text-muted">{row.hint}</span>}
                  </>
                );
                const cls = "flex min-h-12 w-full items-center gap-3 border-b border-border-soft px-3.5 text-left last:border-b-0 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50";
                return row.href ? (
                  <Link key={row.key} href={row.href} data-channel-info-row={row.key} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button key={row.key} type="button" data-channel-info-row={row.key} disabled={row.disabled} onClick={row.onClick} className={cls}>
                    {inner}
                  </button>
                );
              })}
            </div>

            {canManage && (
              <div className="space-y-2" data-channel-admin>
                <p className="text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tm.chan.adminHeading")}</p>
                <div className="flex gap-2">
                  <Link href={teamLink(team.slug, "chat", { channel: channel.name, settings: "1" })} data-channel-edit className="flex h-11 flex-1 items-center justify-center rounded-full border border-border text-small font-bold text-text hover:bg-surface-soft">
                    {t("tm.chan.edit")}
                  </Link>
                  {!channel.isDefault && (
                    <button type="button" data-channel-archive onClick={() => setConfirm("archive")} className="flex h-11 flex-1 items-center justify-center rounded-full border border-border text-small font-bold text-text hover:bg-surface-soft">
                      {t("tm.chan.archive")}
                    </button>
                  )}
                  {!channel.isDefault && (
                    <button type="button" data-channel-delete onClick={() => setConfirm("delete")} className="flex h-11 flex-1 items-center justify-center rounded-full border border-danger/40 text-small font-bold text-danger hover:bg-danger/10">
                      {t("tm.chan.delete")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {error && !confirm && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {confirm && (
        <ConfirmDialog
          id="channel-confirm-title"
          title={t(confirm === "archive" ? "tm.chan.archiveTitle" : "tm.chan.deleteTitle", { name: channel.name })}
          body={t(confirm === "archive" ? "tm.chan.archiveBody" : "tm.chan.deleteBody")}
          confirmLabel={t(confirm === "archive" ? "tm.chan.archive" : "tm.chan.delete")}
          danger={confirm === "delete"}
          busy={busy}
          error={error}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(() => (confirm === "archive" ? archiveTeamChannel(channel.id, true) : deleteTeamChannel(channel.id)), onGone)}
        />
      )}
    </>
  );
}
