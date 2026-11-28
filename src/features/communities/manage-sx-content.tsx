"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useGrowingList } from "@/features/content/use-growing-list";
import { LoadMore, LoadMoreButton } from "@/features/feed/load-more";
import { REPORT_REASON_TITLE } from "@/features/moderation/report-modal";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBarAction, SxBtn, SxCard, SxConfirmPage, SxField, SxFoot, SxGap, SxLabel, SxNote, SxPage, SxRow, SxSub, SxSwitch, SxTag } from "@/features/settings/sx";
import { can } from "@/lib/chat-groups";
import {
  auditActionKey,
  communityChatHref,
  communityHref,
  COMMUNITY_ANNOUNCEMENT_BODY_MAX,
  COMMUNITY_PINNED_ANNOUNCEMENTS_MAX,
  COMMUNITY_TITLE_MAX,
  type CommunityStats,
} from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { toGroupError } from "@/lib/supabase/chat-groups";
import {
  deleteAnnouncement,
  fetchAnnouncements,
  fetchCommunityAudit,
  fetchCommunityReports,
  fetchCommunityStats,
  publishAnnouncement,
  resolveCommunityReport,
  updateAnnouncement,
  type CommunityAnnouncement,
  type CommunityAuditEntry,
  type CommunityReport,
} from "@/lib/supabase/communities";
import { formatCount, formatRelativeTime, profileHref } from "@/lib/utils";
import type { ChatGroup } from "@/types";

/**
 * Topluluk yönetimi — mockup'ta olmayan içerik/moderasyon yüzeyleri (Özet · Duyurular · Moderasyon · İşlem geçmişi), AYNI ayar dilinde
 * (`features/settings/sx.tsx`). Telefonda tam ekran sayfa, md+'da aynı gövde okuma sütununda; alt formlar (`SxSub`) md+'da pencere.
 */

const back = (group: ChatGroup) => communityHref(group.id, "manage");

// ---------------------------------------------------------------------------------------------
// Özet
// ---------------------------------------------------------------------------------------------

const PERIODS = [7, 30, 90] as const;

export function StatsPage({ group }: { group: ChatGroup }) {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [state, setState] = useState<{ days: number; stats: CommunityStats | null; error: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchCommunityStats(group.id, days)
      .then((stats) => !cancelled && setState({ days, stats, error: null }))
      .catch((err) => {
        console.error("community stats", err);
        if (!cancelled) setState({ days, stats: null, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, days, reloadKey]);
  const current = state && state.days === days ? state : null;

  return (
    <SxPage parent={t("ay.manage.title")} title={t("ay.manage.stats")} backHref={back(group)} testId="community-stats-page">
      <div className="chips" style={{ marginTop: 10 }} role="group" aria-label={t("communities.stats.periodAria")}>
        {PERIODS.map((value) => (
          <button key={value} type="button" className={value === days ? "chip on" : "chip"} aria-pressed={value === days} onClick={() => setDays(value)}>
            {t("communities.stats.days", { count: value })}
          </button>
        ))}
      </div>
      <SxGap h={14} />
      {!current ? (
        <SxNote>{t("common.loading")}</SxNote>
      ) : current.error || !current.stats ? (
        <SxCard>
          <SxRow title={<span className="dgt">{current.error ?? t("communities.stats.loadError")}</span>} trailing={<SxBtn onClick={() => { setState(null); setReloadKey((k) => k + 1); }}>{t("common.retry")}</SxBtn>} />
        </SxCard>
      ) : (
        <StatsBody stats={current.stats} />
      )}
    </SxPage>
  );
}

function StatsBody({ stats }: { stats: CommunityStats }) {
  const { t } = useTranslation();
  const net = stats.members.net;
  const groups: { label: string; items: { label: string; value: string; hint?: string }[] }[] = [
    {
      label: t("communities.stats.totalMembers"),
      items: [
        { label: t("communities.stats.totalMembers"), value: formatCount(stats.members.total) },
        { label: t("communities.stats.newMembers"), value: formatCount(stats.members.joined) },
        { label: t("communities.stats.leftMembers"), value: formatCount(stats.members.left), hint: t("communities.stats.net", { value: `${net > 0 ? "+" : ""}${net}` }) },
      ],
    },
    {
      label: t("communities.stats.posts"),
      items: [
        { label: t("communities.stats.posts"), value: formatCount(stats.posts.inPeriod), hint: t("communities.stats.postsTotal", { count: stats.posts.total }) },
        { label: t("communities.stats.likes"), value: formatCount(stats.engagement.likes) },
        { label: t("communities.stats.comments"), value: formatCount(stats.engagement.comments) },
      ],
    },
    {
      label: t("communities.stats.messages"),
      items: [
        { label: t("communities.stats.eventsRsvp"), value: formatCount(stats.events.goingUpcoming), hint: t("communities.stats.eventsHint", { upcoming: stats.events.upcoming, total: stats.events.total }) },
        { label: t("communities.stats.messages"), value: formatCount(stats.chat.messagesInPeriod) },
        { label: t("communities.stats.activeSenders"), value: formatCount(stats.chat.activeSendersInPeriod) },
      ],
    },
  ];
  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.label}>
          <div className="stats" style={{ marginTop: 10 }}>
            {group.items.map((item) => (
              <div className="stat" key={item.label}>
                <b>{item.value}</b>
                <span>{item.label}</span>
                {item.hint && <span style={{ display: "block" }}>{item.hint}</span>}
              </div>
            ))}
          </div>
        </Fragment>
      ))}
      <SxLabel>{t("communities.stats.seriesPosts")}</SxLabel>
      <SxCard style={{ padding: 16 }}>
        <MiniBars label={t("communities.stats.seriesJoined")} values={stats.series.map((p) => p.joined)} />
        <SxGap h={14} />
        <MiniBars label={t("communities.stats.seriesPosts")} values={stats.series.map((p) => p.posts)} />
        <SxGap h={14} />
        <MiniBars label={t("communities.stats.seriesMessages")} values={stats.series.map((p) => p.messages)} />
      </SxCard>
      <SxGap h={16} />
      <SxNote>
        {t("communities.stats.queue", { requests: stats.queue.pendingRequests, invitations: stats.queue.pendingInvitations, reports: stats.queue.openReports })} {t("communities.stats.privacyNote")}
      </SxNote>
    </>
  );
}

/** Günlük sayılar için küçük sütun grafiği (erişilebilir ad + toplam; renk dışında bilgi: yükseklik). */
function MiniBars({ label, values }: { label: string; values: number[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, v) => sum + v, 0);
  return (
    <figure style={{ margin: 0 }} aria-label={`${label}: ${total}`}>
      <figcaption className="s" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span>{label}</span>
        <b>{total}</b>
      </figcaption>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 56 }} role="img" aria-label={t("communities.stats.chartAria", { label, total })}>
        {values.map((value, index) => (
          <span key={index} style={{ flex: 1, minWidth: 1, borderRadius: "2px 2px 0 0", background: "var(--color-primary)", height: `${Math.max(value > 0 ? 8 : 2, (value / max) * 100)}%`, opacity: value > 0 ? 0.75 : 0.25 }} />
        ))}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// İşlem geçmişi
// ---------------------------------------------------------------------------------------------

export function AuditPage({ group }: { group: ChatGroup }) {
  const { t, language } = useTranslation();
  const [entries, setEntries] = useState<CommunityAuditEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await fetchCommunityAudit(group.id, null);
      setEntries(page.entries);
      setHasMore(page.hasMore);
      setLoadError(false);
    } catch (err) {
      console.error("community audit", err);
      setLoadError(true);
    }
  }, [group.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [load]);

  async function loadMore() {
    if (!entries || entries.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchCommunityAudit(group.id, entries[entries.length - 1].createdAt);
      setEntries([...entries, ...page.entries]);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("community audit (more)", err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <SxPage parent={t("ay.manage.title")} title={t("communities.manage.history")} backHref={back(group)} testId="community-audit-page">
      <SxGap h={8} />
      <SxNote>{t("communities.audit.help")}</SxNote>
      <SxGap h={4} />
      {loadError ? (
        <SxCard>
          <SxRow title={<span className="dgt">{t("communities.audit.loadError")}</span>} trailing={<SxBtn onClick={() => void load()}>{t("common.retry")}</SxBtn>} />
        </SxCard>
      ) : entries === null ? (
        <SxNote>{t("common.loading")}</SxNote>
      ) : entries.length === 0 ? (
        <SxCard>
          <SxRow title={t("communities.audit.empty")} />
        </SxCard>
      ) : (
        <>
          <SxLabel>{t("communities.manage.history")}</SxLabel>
          <SxCard>
            {entries.map((entry) => (
              <SxRow
                key={entry.id}
                top
                lead={<SxAvatar name={entry.actor?.displayName ?? t("communities.audit.system")} src={entry.actor?.avatarUrl} />}
                title={entry.actor?.displayName ?? t("communities.audit.system")}
                desc={t(auditActionKey(entry.action))}
              >
                <div className="s">{formatRelativeTime(entry.createdAt, language)}</div>
              </SxRow>
            ))}
          </SxCard>
          {hasMore && (
            <div style={{ padding: "14px 16px 0" }}>
              <LoadMoreButton size="sm" wrapperClassName="flex justify-center" onLoadMore={() => void loadMore()} loading={loadingMore} />
            </div>
          )}
        </>
      )}
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// Duyurular
// ---------------------------------------------------------------------------------------------

export function AnnouncementsPage({ group, onToast }: { group: ChatGroup; onToast: (message: string) => void }) {
  const { t, language } = useTranslation();
  const [items, setItems] = useState<CommunityAnnouncement[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<CommunityAnnouncement | "new" | null>(null);
  const [deleting, setDeleting] = useState<CommunityAnnouncement | null>(null);
  const del = useAsyncAction();
  const canManage = can(group.myRole, "manage_announcements", group.rolePermissions) && !group.closedAt;

  const load = useCallback(async () => {
    try {
      setItems(await fetchAnnouncements(group.id, 50));
      setLoadError(false);
    } catch (err) {
      console.error("fetchAnnouncements", err);
      setLoadError(true);
    }
  }, [group.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    const ok = await del.run(async () => {
      await deleteAnnouncement(target.id);
      return true;
    });
    if (!ok) return;
    setDeleting(null);
    onToast(t("communities.announcements.deletedToast"));
    await load();
  }
  const pinnedCount = items?.filter((item) => item.pinned).length ?? 0;

  return (
    <>
      <SxPage
        parent={t("ay.manage.title")}
        title={t("communities.manage.announcements")}
        backHref={back(group)}
        testId="community-announcements-page"
        action={canManage ? <SxBarAction onClick={() => setEditing("new")}>{t("communities.announcements.publish")}</SxBarAction> : undefined}
      >
        <SxGap h={8} />
        {loadError ? (
          <SxCard>
            <SxRow title={<span className="dgt">{t("communities.announcements.loadError")}</span>} trailing={<SxBtn onClick={() => void load()}>{t("common.retry")}</SxBtn>} />
          </SxCard>
        ) : items === null ? (
          <SxNote>{t("common.loading")}</SxNote>
        ) : items.length === 0 ? (
          <SxCard>
            <SxRow title={t("communities.announcements.empty")} />
          </SxCard>
        ) : (
          <SxCard>
            {items.map((item) => (
              <SxRow
                key={item.id}
                top
                title={
                  <>
                    {item.pinned && <SxTag tone="or">{t("communities.announcements.pinned")}</SxTag>} {item.title}
                  </>
                }
                desc={<span style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.body}</span>}
                trailing={
                  canManage ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <SxBtn sm onClick={() => setEditing(item)}>{t("common.edit")}</SxBtn>
                      <SxBtn sm tone="dng" onClick={() => setDeleting(item)}>{t("common.delete")}</SxBtn>
                    </span>
                  ) : undefined
                }
              >
                <div className="s">
                  {item.author && (
                    <Link href={profileHref(item.author)} style={{ textDecoration: "underline" }}>
                      {item.author.displayName}
                    </Link>
                  )}
                  {item.author && " · "}
                  {formatRelativeTime(item.createdAt, language)}
                  {item.editedAt && ` · ${t("communities.announcements.edited")}`}
                </div>
              </SxRow>
            ))}
          </SxCard>
        )}
      </SxPage>

      {editing && (
        <AnnouncementFormPage
          group={group}
          announcement={editing === "new" ? null : editing}
          pinnedCount={pinnedCount}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            onToast(message);
            await load();
          }}
        />
      )}
      {deleting && (
        <SxConfirmPage
          parent={t("communities.manage.announcements")}
          title={t("communities.announcements.deleteTitle")}
          lead={t("communities.announcements.deleteBody")}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.delete")}
          busy={del.busy}
          error={del.error}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
          testId="community-announcement-delete"
        />
      )}
    </>
  );
}

function AnnouncementFormPage({
  group,
  announcement,
  pinnedCount,
  onClose,
  onSaved,
}: {
  group: ChatGroup;
  announcement: CommunityAnnouncement | null;
  pinnedCount: number;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { busy, error, run } = useAsyncAction();
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [notify, setNotify] = useState(true);
  const [postToChat, setPostToChat] = useState(false);
  const [touched, setTouched] = useState(false);
  const titleOk = title.trim().length > 0 && [...title.trim()].length <= COMMUNITY_TITLE_MAX;
  const bodyOk = body.trim().length > 0 && [...body.trim()].length <= COMMUNITY_ANNOUNCEMENT_BODY_MAX;
  const pinBlocked = pinned && !announcement?.pinned && pinnedCount >= COMMUNITY_PINNED_ANNOUNCEMENTS_MAX;

  async function submit() {
    setTouched(true);
    if (!titleOk || !bodyOk || pinBlocked) return;
    const ok = await run(async () => {
      if (announcement) await updateAnnouncement(announcement.id, { title, body, pinned });
      else await publishAnnouncement(group.id, { title, body, pinned, notify, postToChat });
      return true;
    });
    if (ok) await onSaved(announcement ? t("communities.announcements.updatedToast") : t("communities.announcements.publishedToast"));
  }

  return (
    <SxSub
      open
      onClose={busy ? () => undefined : onClose}
      parent={t("communities.manage.announcements")}
      title={announcement ? t("communities.announcements.editTitle") : t("communities.announcements.newTitle")}
      testId="community-announcement-form"
      footer={
        <SxFoot>
          <SxBtn tone="pri" full disabled={busy} onClick={() => void submit()}>
            {busy ? t("common.loading") : announcement ? t("common.save") : t("communities.announcements.publish")}
          </SxBtn>
        </SxFoot>
      }
    >
      <SxLabel>{t("communities.manage.announcements")}</SxLabel>
      <SxCard>
        <SxField
          id="duyuru-baslik"
          label={t("communities.announcements.titleLabel")}
          inputProps={{ value: title, maxLength: COMMUNITY_TITLE_MAX + 20, onChange: (e) => setTitle(e.target.value), disabled: busy }}
          hint={`${[...title.trim()].length}/${COMMUNITY_TITLE_MAX}`}
          error={touched && !titleOk}
        />
        <SxField
          id="duyuru-govde"
          label={t("communities.announcements.bodyLabel")}
          multiline
          style={{ minHeight: 140 }}
          textareaProps={{ value: body, onChange: (e) => setBody(e.target.value), disabled: busy }}
          hint={`${[...body.trim()].length}/${COMMUNITY_ANNOUNCEMENT_BODY_MAX}`}
          error={touched && !bodyOk}
        />
      </SxCard>
      <SxLabel>{t("ay.settings.title")}</SxLabel>
      <SxCard>
        <SxRow title={t("communities.announcements.pinLabel", { max: COMMUNITY_PINNED_ANNOUNCEMENTS_MAX })} trailing={<SxSwitch checked={pinned} onChange={setPinned} label={t("communities.announcements.pinned")} disabled={busy} />} />
        {!announcement && <SxRow title={t("communities.announcements.notifyLabel")} trailing={<SxSwitch checked={notify} onChange={setNotify} label={t("communities.announcements.notifyLabel")} disabled={busy} />} />}
        {!announcement && <SxRow title={t("communities.announcements.chatLabel")} trailing={<SxSwitch checked={postToChat} onChange={setPostToChat} label={t("communities.announcements.chatLabel")} disabled={busy} />} />}
      </SxCard>
      {(error || pinBlocked) && (
        <>
          <SxGap h={12} />
          <SxNote>
            <span className="dgt">{pinBlocked ? t("communities.error.pin_limit_reached") : error}</span>
          </SxNote>
        </>
      )}
    </SxSub>
  );
}

// ---------------------------------------------------------------------------------------------
// Moderasyon
// ---------------------------------------------------------------------------------------------

type Filter = "open" | "closed";

export function ModerationPage({ group, onChanged }: { group: ChatGroup; onChanged: () => void | Promise<void> }) {
  const { t, language } = useTranslation();
  const [filter, setFilter] = useState<Filter>("open");
  const [pending, setPending] = useState<{ report: CommunityReport; action: "dismiss" | "remove" } | null>(null);
  const [note, setNote] = useState("");
  const action = useAsyncAction();
  const list = useGrowingList(`${group.id}|${filter}`, (limit) => fetchCommunityReports(group.id, filter, limit));
  const reports = list.items;
  const loadError = list.failed && reports !== null && reports.length === 0;

  async function confirm() {
    if (!pending) return;
    const { report, action: kind } = pending;
    const ok = await action.run(async () => {
      await resolveCommunityReport(report.id, kind, note);
      return true;
    });
    if (!ok) return;
    setPending(null);
    setNote("");
    await list.reload();
    await onChanged();
  }

  const body = useMemo(() => reports ?? [], [reports]);
  return (
    <>
      <SxPage parent={t("ay.manage.title")} title={t("communities.manage.moderation")} backHref={back(group)} testId="community-moderation-page">
        <div style={{ margin: "10px 16px 0" }}>
          <ChoiceGroup<Filter>
            ariaLabel={t("communities.moderation.filterAria")}
            variant="sx-seg"
            value={filter}
            onChange={setFilter}
            options={[
              { key: "open", label: t("communities.moderation.open") },
              { key: "closed", label: t("communities.moderation.closed") },
            ]}
          />
        </div>
        <SxGap h={8} />
        <SxNote>{t("communities.moderation.help")}</SxNote>
        <SxGap h={4} />
        {loadError ? (
          <SxCard>
            <SxRow title={<span className="dgt">{t("communities.moderation.loadError")}</span>} trailing={<SxBtn onClick={() => void list.reload()}>{t("common.retry")}</SxBtn>} />
          </SxCard>
        ) : reports === null || list.loading ? (
          <SxNote>{t("common.loading")}</SxNote>
        ) : body.length === 0 ? (
          <SxCard>
            <SxRow title={filter === "open" ? t("communities.moderation.emptyOpen") : t("communities.moderation.emptyClosed")} />
          </SxCard>
        ) : (
          <>
            <SxLabel>{filter === "open" ? t("communities.moderation.open") : t("communities.moderation.closed")}</SxLabel>
            <SxCard>
              {body.map((report) => (
                <div key={report.id} className="row col" data-testid="community-report">
                  <div className="t">
                    <SxTag>{report.kind === "post" ? t("communities.moderation.kindPost") : t("communities.moderation.kindMessage")}</SxTag>{" "}
                    {report.status !== "open" && <SxTag tone={report.status === "dismissed" ? undefined : "ok"}>{report.status === "dismissed" ? t("communities.moderation.dismissed") : t("communities.moderation.resolved")}</SxTag>}{" "}
                    <span className="s">{formatRelativeTime(report.createdAt, language)}</span>
                  </div>
                  {report.kind === "post" && report.postTitle && <div className="t">{report.postTitle}</div>}
                  {report.kind === "message" && <div className="s">{report.messagePreview ?? t("communities.moderation.messageGone")}</div>}
                  <div className="s">
                    <b>{t("communities.moderation.reason")}: </b>
                    {report.reasonCode ? t(REPORT_REASON_TITLE[report.reasonCode]) : report.reason}
                  </div>
                  {report.details && <div className="s" style={{ whiteSpace: "pre-line" }}>{report.details}</div>}
                  {report.reporter && (
                    <div className="s">
                      <Link href={profileHref(report.reporter)} style={{ textDecoration: "underline" }}>
                        {t("communities.moderation.reportedBy", { name: report.reporter.displayName })}
                      </Link>
                    </div>
                  )}
                  {report.status === "open" ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {report.kind === "message" && report.messageId && (
                        <SxBtn sm href={`${communityChatHref(group.id)}&hl=message:${report.messageId}`}>
                          {t("communities.moderation.viewInChat")}
                        </SxBtn>
                      )}
                      <SxBtn sm onClick={() => { action.setError(null); setPending({ report, action: "dismiss" }); }}>{t("communities.moderation.dismiss")}</SxBtn>
                      <SxBtn sm tone="dng" onClick={() => { action.setError(null); setPending({ report, action: "remove" }); }}>{t("communities.moderation.remove")}</SxBtn>
                    </div>
                  ) : (
                    report.resolution && report.resolution !== "content_removed" && report.resolution !== "dismissed" && <div className="s">{t("communities.moderation.note", { note: report.resolution })}</div>
                  )}
                </div>
              ))}
            </SxCard>
            <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />
          </>
        )}
      </SxPage>

      {pending && (
        <SxConfirmPage
          parent={t("communities.manage.moderation")}
          title={pending.action === "remove" ? t("communities.moderation.removeTitle") : t("communities.moderation.dismissTitle")}
          lead={pending.action === "remove" ? t("communities.moderation.removeBody") : t("communities.moderation.dismissBody")}
          extra={
            <>
              <SxLabel>{t("communities.moderation.noteLabel")}</SxLabel>
              <SxCard>
                <SxField id="rapor-not" label={t("communities.moderation.noteLabel")} note={t("common.optional")} multiline style={{ minHeight: 80 }} textareaProps={{ value: note, maxLength: 300, onChange: (e) => setNote(e.target.value), disabled: action.busy }} />
              </SxCard>
            </>
          }
          cancelLabel={t("common.cancel")}
          confirmLabel={pending.action === "remove" ? t("communities.moderation.remove") : t("communities.moderation.dismiss")}
          confirmTone={pending.action === "remove" ? "dng" : "pri"}
          busy={action.busy}
          error={action.error}
          onConfirm={() => void confirm()}
          onClose={() => setPending(null)}
          testId="community-report-confirm"
        />
      )}
    </>
  );
}
