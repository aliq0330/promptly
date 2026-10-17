"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { deleteAnnouncement, fetchAnnouncements, publishAnnouncement, updateAnnouncement, type CommunityAnnouncement } from "@/lib/supabase/communities";
import { can } from "@/lib/chat-groups";
import { COMMUNITY_ANNOUNCEMENT_BODY_MAX, COMMUNITY_PINNED_ANNOUNCEMENTS_MAX, COMMUNITY_TITLE_MAX } from "@/lib/communities";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupRole } from "@/types";
import Link from "next/link";

/**
 * Duyurular: herkes okur (herkese açık topluluk ya da üyelik); yayınlama / düzenleme / silme / sabitleme `manage_announcements` yeteneğiyle
 * (owner her zaman) yapılır — gerçek yetki sunucudadır. Yayınlarken "sohbette de göster" seçilirse sohbette bağlantılı bir duyuru mesajı
 * oluşur; "üyelere bildir" seçimi her üyenin bildirim tercihine göre uygulanır (sessiz tercihli üyeye gitmez).
 */
export function AnnouncementsSection({
  group,
  role,
  limit = 20,
  onToast,
  onChanged,
  highlight = false,
}: {
  group: ChatGroup;
  role: GroupRole | null;
  limit?: number;
  onToast: (message: string) => void;
  onChanged?: () => void;
  /** Akışın üstündeki özet şeridi: yalnızca okuma, boş/yüklenirken/hatada hiçbir şey çizilmez. Yönetim "Yönet → Duyurular"dadır. */
  highlight?: boolean;
}) {
  const { t, language } = useTranslation();
  const [items, setItems] = useState<CommunityAnnouncement[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<CommunityAnnouncement | "new" | null>(null);
  const [deleting, setDeleting] = useState<CommunityAnnouncement | null>(null);
  const del = useAsyncAction();
  const canManage = !highlight && can(role, "manage_announcements", group.rolePermissions) && !group.closedAt;

  const load = useCallback(async () => {
    try {
      setItems(await fetchAnnouncements(group.id, limit));
      setLoadError(false);
    } catch (err) {
      console.error("fetchAnnouncements", err);
      setLoadError(true);
    }
  }, [group.id, limit]);

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
    onChanged?.();
  }

  const pinnedCount = items?.filter((item) => item.pinned).length ?? 0;

  if (highlight && (items === null || loadError || items.length === 0)) return null;

  return (
    <section aria-labelledby="community-announcements-title" className="space-y-3">
      <div className={highlight ? "contents" : "flex items-center justify-between gap-3"}>
        {/* In the feed's summary the warm card speaks for itself; the heading stays for screen readers. */}
        <h2 id="community-announcements-title" className={highlight ? "sr-only" : "flex items-center gap-1.5 text-label font-semibold text-text"}>
          <Megaphone size={15} aria-hidden /> {t("communities.announcements.title")}
        </h2>
        {canManage && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus size={14} /> {t("communities.announcements.publish")}
          </Button>
        )}
      </div>

      {loadError ? (
        <p role="alert" className="text-small text-danger">
          {t("communities.announcements.loadError")}{" "}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            {t("common.retry")}
          </button>
        </p>
      ) : items === null ? (
        <div className="h-20 animate-pulse rounded-lg border border-border-soft bg-surface-soft" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.announcements.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={
                // Meydan (docs/history/190-* Faz 6): in the feed's summary a pinned announcement is the warm card at the top.
                highlight && item.pinned ? "space-y-2 rounded-lg border border-secondary/25 bg-secondary/10 p-4" : "space-y-2 rounded-lg border border-border-soft bg-surface p-4"
              }
            >
              {highlight && item.pinned && (
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-secondary">{t("communities.announcements.pinnedEyebrow")}</p>
              )}
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex min-w-0 items-center gap-1.5 break-words text-sm font-semibold text-text">
                  {item.pinned && !highlight && <Pin size={13} className="shrink-0 text-primary" aria-label={t("communities.announcements.pinned")} />}
                  <span className="min-w-0">{item.title}</span>
                </h3>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(item)} aria-label={t("common.edit")} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setDeleting(item)} aria-label={t("common.delete")} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-danger/10 hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <p className={`whitespace-pre-wrap break-words text-small text-text-secondary${highlight ? " line-clamp-3" : ""}`}>{item.body}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-caption text-text-muted">
                {item.author && (
                  <>
                    <Avatar src={item.author.avatarUrl} alt={item.author.displayName} size={16} />
                    <Link href={profileHref(item.author)} className="hover:underline">
                      {item.author.displayName}
                    </Link>
                    <span>·</span>
                  </>
                )}
                <span>{formatRelativeTime(item.createdAt, language)}</span>
                {item.editedAt && <span>· {t("communities.announcements.edited")}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AnnouncementFormModal
          group={group}
          announcement={editing === "new" ? null : editing}
          pinnedCount={pinnedCount}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            onToast(message);
            await load();
            onChanged?.();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          id="announcement-delete-title"
          title={t("communities.announcements.deleteTitle")}
          body={t("communities.announcements.deleteBody")}
          confirmLabel={t("common.delete")}
          danger
          busy={del.busy}
          error={del.error}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

function AnnouncementFormModal({
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

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="announcement-form-title">
      <form onSubmit={submit} noValidate className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pb-2 pt-5">
          <h2 id="announcement-form-title" className="text-base font-semibold text-text">
            {announcement ? t("communities.announcements.editTitle") : t("communities.announcements.newTitle")}
          </h2>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          <div>
            <label htmlFor="announcement-title" className={fieldLabelClassName}>
              {t("communities.announcements.titleLabel")}
            </label>
            <input id="announcement-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} maxLength={COMMUNITY_TITLE_MAX + 20} aria-invalid={touched && !titleOk} className={fieldInputClassName} />
            <p className={touched && !titleOk ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>{`${[...title.trim()].length}/${COMMUNITY_TITLE_MAX}`}</p>
          </div>
          <div>
            <label htmlFor="announcement-body" className={fieldLabelClassName}>
              {t("communities.announcements.bodyLabel")}
            </label>
            <textarea id="announcement-body" value={body} onChange={(event) => setBody(event.target.value)} rows={6} disabled={busy} aria-invalid={touched && !bodyOk} className={`${fieldControlClassName} resize-none py-2.5`} />
            <p className={touched && !bodyOk ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>{`${[...body.trim()].length}/${COMMUNITY_ANNOUNCEMENT_BODY_MAX}`}</p>
          </div>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 text-small text-text">
              <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} disabled={busy} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>{t("communities.announcements.pinLabel", { max: COMMUNITY_PINNED_ANNOUNCEMENTS_MAX })}</span>
            </label>
            {pinBlocked && (
              <p role="alert" className="text-caption text-danger">
                {t("communities.error.pin_limit_reached")}
              </p>
            )}
            {!announcement && (
              <>
                <label className="flex cursor-pointer items-start gap-2 text-small text-text">
                  <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} disabled={busy} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>{t("communities.announcements.notifyLabel")}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-small text-text">
                  <input type="checkbox" checked={postToChat} onChange={(event) => setPostToChat(event.target.checked)} disabled={busy} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>{t("communities.announcements.chatLabel")}</span>
                </label>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("common.loading") : announcement ? t("common.save") : t("communities.announcements.publish")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

