"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Pin } from "@/components/icons/pin";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SegmentedChoice } from "@/features/messages/segmented-choice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { communityHref } from "@/lib/communities";
import { archiveCommunityRoom, setRoomMuted } from "@/lib/supabase/community-rooms";
import { cn } from "@/lib/utils";
import type { CommunityRoom } from "@/types";
import { RoomFormModal } from "./room-form-modal";
import { RoomIconTile } from "./room-icon";
import { patchCachedRoom, refreshCommunityRooms } from "./use-community-rooms";

type RoomNotify = "all" | "none";

/**
 * Oda bilgisi (Yön A, mockup "Topluluk 4", docs/history/353-*): topluluk sohbetinin oda çipinden / bilgi sayfasındaki oda satırından açılan alttan sayfa.
 * Kim görür · Kim yazar, bu odadaki bildirim (Tümü / Sessiz — oda bildirimi iki düzeylidir), sabit mesajlar · ara · topluluk sayfası ve
 * (oda yönetimi yetkisine) Düzenle · Arşivle. Yetkiyi yalnızca gizlemek yetmez: her işlem sunucuda yeniden yetkilendirilir.
 */
export function RoomInfoSheet({
  community,
  rooms,
  room,
  canManage,
  pinnedCount,
  onShowPinned,
  onSearch,
  onClose,
  onGone,
}: {
  community: { id: string; name: string };
  rooms: readonly CommunityRoom[];
  room: CommunityRoom;
  canManage: boolean;
  /** Yalnız açık odanın sabit mesajı bilinir; başka odanın bilgisi açıldıysa 0 verilir ve satır pasif kalır. */
  pinnedCount: number;
  onShowPinned: () => void;
  onSearch: () => void;
  onClose: () => void;
  /** Oda arşivlendi: sohbet varsayılan odaya döner. */
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editing, setEditing] = useState(false);
  const readOnly = !room.isDefault && room.postingPolicy === "admins";

  async function changeNotify(next: RoomNotify) {
    setBusy(true);
    setError(null);
    const muted = next === "none";
    patchCachedRoom(community.id, room.id, { muted });
    try {
      await setRoomMuted(room.id, muted);
    } catch {
      patchCachedRoom(community.id, room.id, { muted: !muted });
      setError(t("rooms.chat.muteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    setError(null);
    try {
      await archiveCommunityRoom(room.id, true);
      await refreshCommunityRooms(community.id);
      setConfirmArchive(false);
      onGone();
    } catch {
      setError(t("rooms.info.failed"));
    } finally {
      setBusy(false);
    }
  }

  const facts: [string, string][] = [
    [t("rooms.info.whoSees"), room.readPolicy === "staff" ? t("rooms.info.seesStaff") : t("rooms.info.seesAll")],
    [t("rooms.info.whoPosts"), room.isDefault ? t("rooms.info.postsDefault") : room.postingPolicy === "admins" ? t("rooms.info.postsStaff") : t("rooms.info.postsAll")],
  ];
  const rowClass =
    "flex min-h-12 w-full items-center gap-3 border-b border-border-soft px-3.5 text-left last:border-b-0 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50";

  return (
    <>
      <Modal onClose={busy ? () => undefined : onClose} labelledBy="room-info-title">
        <div data-room-info className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-border-soft bg-surface shadow-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-5">
            <RoomIconTile icon={room.icon} size={44} />
            <div className="min-w-0 flex-1 leading-tight">
              <h2 id="room-info-title" className="truncate font-display text-h3 font-bold text-text">
                {room.name}
              </h2>
              <p className="truncate text-small text-text-muted">{t("rooms.info.title", { community: community.name })}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            <p className="text-small leading-relaxed text-text-secondary">{room.description || t("rooms.info.noDescription")}</p>

            <dl className="overflow-hidden rounded-2xl border border-border-soft">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border-soft px-3.5 py-2.5 text-small last:border-b-0">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className="text-right font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1.5">
              <p className="text-caption font-bold text-text-muted">{t("rooms.info.notifyHeading")}</p>
              <SegmentedChoice<RoomNotify>
                value={room.muted ? "none" : "all"}
                ariaLabel={t("rooms.info.notifyHeading")}
                testId="room-notify"
                disabled={busy}
                onChange={(next) => void changeNotify(next)}
                options={[
                  { key: "all", label: t("rooms.info.notifyAll") },
                  { key: "none", label: t("rooms.info.notifyNone") },
                ]}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border-soft">
              <button type="button" data-room-info-row="pinned" disabled={pinnedCount === 0} onClick={onShowPinned} className={rowClass}>
                <Pin size={19} strokeWidth={1.75} className="shrink-0 text-text" aria-hidden />
                <span className="min-w-0 flex-1 text-small font-semibold text-text">{t("rooms.info.pinned")}</span>
                <span className="text-small text-text-muted">{pinnedCount}</span>
              </button>
              <button type="button" data-room-info-row="search" onClick={onSearch} className={rowClass}>
                <Search size={19} strokeWidth={1.75} className="shrink-0 text-text" aria-hidden />
                <span className="min-w-0 flex-1 text-small font-semibold text-text">{t("rooms.info.search")}</span>
              </button>
              <Link href={communityHref(community.id)} data-room-info-row="community" className={rowClass}>
                <ArrowUpRight size={19} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 text-small font-semibold text-primary">{t("rooms.info.communityPage")}</span>
              </Link>
            </div>

            {readOnly && !canManage && <p className="text-caption text-text-muted">{t("rooms.info.readOnlyHint")}</p>}

            {canManage && (
              <div className="space-y-2" data-room-admin>
                <p className="text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("rooms.info.adminHeading")}</p>
                <div className="flex gap-2">
                  <button type="button" data-room-edit onClick={() => setEditing(true)} className="flex h-11 flex-1 items-center justify-center rounded-full border border-border text-small font-bold text-text hover:bg-surface-soft">
                    {t("rooms.info.edit")}
                  </button>
                  {!room.isDefault && (
                    <button type="button" data-room-archive onClick={() => setConfirmArchive(true)} className={cn("flex h-11 flex-1 items-center justify-center rounded-full border border-border text-small font-bold text-text hover:bg-surface-soft")}>
                      {t("rooms.manage.archive")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {error && !confirmArchive && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {confirmArchive && (
        <ConfirmDialog
          id="room-archive-title"
          title={t("rooms.info.archiveTitle", { name: room.name })}
          body={t("rooms.info.archiveBody")}
          confirmLabel={t("rooms.manage.archive")}
          busy={busy}
          error={error}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => void archive()}
        />
      )}
      {editing && <RoomFormModal communityId={community.id} rooms={rooms} room={room} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </>
  );
}
