"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "@/components/icons/chevron-down";
import { GripVertical } from "@/components/icons/grip-vertical";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/features/communities/dropdown-menu";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { ROOM_LIMIT, activeRooms, archivedRooms, groupRoomsBySection } from "@/lib/community-rooms";
import { useTranslation } from "@/lib/i18n/language-provider";
import { archiveCommunityRoom, deleteCommunityRoom, reorderCommunityRooms } from "@/lib/supabase/community-rooms";
import { cn, roomHref } from "@/lib/utils";
import type { ChatGroup, CommunityRoom } from "@/types";
import { RoomFormModal } from "./room-form-modal";
import { RoomIconTile } from "./room-icon";
import { refreshCommunityRooms, useCommunityRooms } from "./use-community-rooms";

/** Satırın ikinci satırı: kim yazar / kim görür (mockup 6). */
function useManageSubtitle() {
  const { t } = useTranslation();
  return (room: CommunityRoom): string => {
    if (room.isDefault) return t("rooms.manage.defaultRoom");
    if (room.readPolicy === "staff") return t("rooms.manage.private");
    return room.postingPolicy === "admins" ? t("rooms.manage.writesStaff") : t("rooms.manage.writesAll");
  };
}

/**
 * Yönetim → Sohbet odaları (docs/history/352-*, mockup 6): odaları sırala (sürükle ya da menüden yukarı/aşağı), düzenle, bölüme taşı, arşivle, sil.
 * Her işlem sunucuda `manage_rooms` yeteneğiyle yeniden yetkilendirilir; silme yalnız topluluk sahibine açıktır. Genel (varsayılan oda) silinemez.
 */
export function RoomsManageSection({ group, onToast }: { group: ChatGroup; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const subtitle = useManageSubtitle();
  const { rooms, loading, error, reload } = useCommunityRooms(group.id, { live: false });
  const [formRoom, setFormRoom] = useState<CommunityRoom | "new" | null>(null);
  const [sectionRoom, setSectionRoom] = useState<CommunityRoom | null>(null);
  const [deleting, setDeleting] = useState<CommunityRoom | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isOwner = group.myRole === "owner";

  const active = useMemo(() => activeRooms(rooms), [rooms]);
  const archived = useMemo(() => archivedRooms(rooms), [rooms]);
  const sections = useMemo(() => groupRoomsBySection(rooms, t("rooms.sectionDefault")), [rooms, t]);

  // Sürükleme önizlemesi: bırakılana kadar yalnız yerel sıra; bırakınca tek RPC ile kaydedilir.
  const [dragState, setDragState] = useState<{ order: string[]; base: CommunityRoom[] } | null>(null);
  // Sunucudan yeni liste gelince (taban değişir) önizleme otomatik düşer; efektle sıfırlamaya gerek yok.
  const dragOrder = dragState && dragState.base === rooms ? dragState.order : null;
  const setDragOrder = (order: string[] | null) => setDragState(order ? { order, base: rooms } : null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const orderedActive = useMemo(() => {
    if (!dragOrder) return active;
    const byId = new Map(active.map((room) => [room.id, room]));
    return dragOrder.map((id) => byId.get(id)).filter((room): room is CommunityRoom => Boolean(room));
  }, [active, dragOrder]);

  async function saveOrder(ids: string[]) {
    setBusy(true);
    setActionError(null);
    try {
      await reorderCommunityRooms(group.id, [...ids, ...archived.map((room) => room.id)]);
      await refreshCommunityRooms(group.id);
    } catch (err) {
      console.error("reorderCommunityRooms", err);
      setActionError(t("rooms.manage.saveOrderFailed"));
      setDragOrder(null);
    } finally {
      setBusy(false);
    }
  }

  /** Bir odayı kendi bölümünün içinde bir adım kaydırır (menü ve klavye için); bölümler arası sıra değişmez. */
  function moveWithinSection(room: CommunityRoom, delta: -1 | 1) {
    const sameSection = orderedActive.filter((other) => (other.section?.trim().toLocaleLowerCase("tr") ?? "") === (room.section?.trim().toLocaleLowerCase("tr") ?? ""));
    const index = sameSection.findIndex((other) => other.id === room.id);
    const swap = sameSection[index + delta];
    if (!swap) return;
    const ids = orderedActive.map((other) => other.id);
    const a = ids.indexOf(room.id);
    const b = ids.indexOf(swap.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    setDragOrder(ids);
    void saveOrder(ids);
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, room: CommunityRoom) {
    if (busy) return;
    event.preventDefault();
    const section = room.section?.trim().toLocaleLowerCase("tr") ?? "";
    const sameSection = (other: CommunityRoom) => (other.section?.trim().toLocaleLowerCase("tr") ?? "") === section;
    let order = orderedActive.map((other) => other.id);
    setDraggingId(room.id);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      const siblings = order.map((id) => orderedActive.find((r) => r.id === id)).filter((r): r is CommunityRoom => Boolean(r) && sameSection(r as CommunityRoom));
      let targetIndex = siblings.findIndex((r) => r.id === room.id);
      for (let i = 0; i < siblings.length; i += 1) {
        const rect = rowRefs.current.get(siblings[i].id)?.getBoundingClientRect();
        if (rect && move.clientY >= rect.top && move.clientY <= rect.bottom) targetIndex = i;
      }
      const from = order.indexOf(room.id);
      const to = order.indexOf(siblings[targetIndex].id);
      if (from === to) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, room.id);
      order = next;
      setDragOrder(next);
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      setDraggingId(null);
      const changed = order.some((id, i) => id !== active[i]?.id);
      if (changed) void saveOrder(order);
      else setDragOrder(null);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  async function run(action: () => Promise<void>, toast?: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await refreshCommunityRooms(group.id);
      if (toast) onToast(toast);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("rooms.manage.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const renderRow = (room: CommunityRoom, index: number, siblings: readonly CommunityRoom[]) => {
    const dragging = draggingId === room.id;
    return (
      <div
        key={room.id}
        ref={(node) => {
          if (node) rowRefs.current.set(room.id, node);
          else rowRefs.current.delete(room.id);
        }}
        data-manage-room={room.id}
        className={cn(
          "flex items-center gap-2.5 rounded-xl border bg-surface px-2.5 py-2 transition-[background-color,border-color,box-shadow] duration-200 ease-soft",
          dragging ? "border-primary/40 bg-primary-soft shadow-card" : "border-border-soft",
        )}
      >
        {room.archivedAt ? (
          <span className="w-5 shrink-0" />
        ) : (
          <button
            type="button"
            aria-label={t("rooms.manage.dragHandle", { name: room.name })}
            data-room-drag-handle
            onPointerDown={(event) => startDrag(event, room)}
            className="flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
          >
            <GripVertical size={20} aria-hidden />
          </button>
        )}
        <RoomIconTile icon={room.icon} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-bold text-text">{room.name}</div>
          <div className={cn("truncate text-caption", dragging ? "font-semibold text-primary" : "text-text-muted")}>{dragging ? t("rooms.manage.dragging") : room.archivedAt ? t("rooms.row.archived") : subtitle(room)}</div>
        </div>
        {room.isDefault && <Lock size={16} className="shrink-0 text-text-muted" aria-label={t("rooms.manage.defaultRoom")} />}
        <DropdownMenu
          label={t("rooms.manage.rowMenu", { name: room.name })}
          triggerClassName="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {(close) => (
            <>
              <Link href={roomHref(group.id, room.id)} role="menuitem" onClick={close} className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft">{t("rooms.manage.openInChat")}</Link>
              {!room.archivedAt && (
                <>
                  <button type="button" role="menuitem" onClick={() => { close(); setFormRoom(room); }} className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft">{t("rooms.manage.edit")}</button>
                  <button type="button" role="menuitem" onClick={() => { close(); setSectionRoom(room); }} className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft">{t("rooms.manage.moveSection")}</button>
                  {index > 0 && (
                    <button type="button" role="menuitem" onClick={() => { close(); moveWithinSection(room, -1); }} className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft">{t("rooms.manage.moveUp")}</button>
                  )}
                  {index < siblings.length - 1 && (
                    <button type="button" role="menuitem" onClick={() => { close(); moveWithinSection(room, 1); }} className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft">{t("rooms.manage.moveDown")}</button>
                  )}
                </>
              )}
              {!room.isDefault && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    void run(() => archiveCommunityRoom(room.id, !room.archivedAt));
                  }}
                  className="flex w-full px-3 py-2 text-left text-small text-text hover:bg-surface-soft"
                >
                  {room.archivedAt ? t("rooms.manage.unarchive") : t("rooms.manage.archive")}
                </button>
              )}
              {!room.isDefault && isOwner && (
                <button type="button" role="menuitem" onClick={() => { close(); setDeleting(room); }} className="flex w-full px-3 py-2 text-left text-small text-danger hover:bg-surface-soft">{t("rooms.manage.delete")}</button>
              )}
            </>
          )}
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div data-rooms-manage className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small text-text-secondary">{t("rooms.manage.intro")}</p>
          {!isOwner && <p className="mt-1 text-caption text-text-muted">{t("rooms.manage.deleteOwnerOnly")}</p>}
        </div>
        <span data-rooms-count className="shrink-0 rounded-full bg-surface-soft px-3 py-1.5 text-small font-bold tabular-nums text-text-secondary">
          {t("rooms.manage.count", { count: active.length, max: ROOM_LIMIT })}
        </span>
      </div>

      {actionError && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">{actionError}</p>}

      {loading && rooms.length === 0 ? (
        <div className="space-y-2" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-soft" />)}</div>
      ) : error && rooms.length === 0 ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-danger/10 px-3 py-3 text-small text-danger">
          {t("rooms.hub.loadFailed")}
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>{t("common.retry")}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupRoomsBySection(orderedActive, t("rooms.sectionDefault")).map((section) => (
            <section key={section.key || "default"} aria-label={section.label} className="space-y-2">
              <h3 className="px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">{section.label}</h3>
              {section.rooms.map((room, index) => renderRow(room, index, section.rooms))}
            </section>
          ))}
          {sections.length === 0 && <p className="text-small text-text-muted">{t("rooms.hub.noRooms")}</p>}

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setArchivedOpen((open) => !open)}
                aria-expanded={archivedOpen}
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-dashed border-border-strong px-3.5 text-small font-semibold text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span>{t("rooms.manage.archived")}</span>
                <span className="flex items-center gap-1.5">
                  {archived.length}
                  <ChevronDown size={18} className={cn("transition-transform", archivedOpen && "rotate-180")} aria-hidden />
                </span>
              </button>
              {archivedOpen && <div className="mt-2 space-y-2">{archived.map((room, index) => renderRow(room, index, archived))}</div>}
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-3 z-10 pt-2">
        <Button type="button" size="lg" className="w-full" disabled={busy || active.length >= ROOM_LIMIT} onClick={() => setFormRoom("new")} data-manage-add-room>
          <Plus size={20} strokeWidth={2.4} aria-hidden /> {t("rooms.switcher.addRoom")}
        </Button>
      </div>

      {formRoom && <RoomFormModal communityId={group.id} rooms={rooms} room={formRoom === "new" ? undefined : formRoom} onClose={() => setFormRoom(null)} />}
      {sectionRoom && <RoomFormModal communityId={group.id} rooms={rooms} room={sectionRoom} sectionOnly onClose={() => setSectionRoom(null)} />}
      {deleting && (
        <ConfirmDialog
          id="delete-room-title"
          title={t("rooms.manage.deleteTitle", { name: deleting.name })}
          body={t("rooms.manage.deleteBody")}
          confirmLabel={t("rooms.manage.delete")}
          danger
          busy={busy}
          error={null}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            void run(() => deleteCommunityRoom(target.id)).then(() => setDeleting(null));
          }}
        />
      )}
    </div>
  );
}
