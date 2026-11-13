"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { useToast } from "@/features/groups/use-toast";
import { bulkMuteTarget, bulkPinTarget } from "@/lib/messages-hub";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ConversationsMoreMenu, SelectionActionBar, SelectionHeader, useSelectionChrome } from "./conversation-selection";
import { DialogShell } from "@/components/ui/dialog-shell";

/** Seçim cümlesindeki ad: kanal / oda / sohbet (proje dosya sohbeti) / öğe (kanal ile proje karışık seçildiyse). */
export type HubWord = "channel" | "room" | "chat" | "item";

const COUNT_KEYS = { channel: "th.sel.count.channel", room: "th.sel.count.room", chat: "th.sel.count.chat", item: "th.sel.count.item" } as const;
const SELECT_KEYS = { channel: "th.sel.selectChannels", room: "th.sel.selectRooms", chat: "messages.selectChats", item: "th.sel.selectChannels" } as const;

/**
 * Bir kanal/oda listesinin toplu işlem sözleşmesi (docs/history/381-*). Anahtarlar satırları tanımlar (`key`); işlemler TEK satıra uygulanır ve sunucuya yazar,
 * hata fırlatır (sessiz başarı yok). Toplu uygulama ve hata/seçili kalma kuralları sohbet listesindekiyle aynıdır (6'şar paralel).
 */
export interface HubBulkActions {
  /** Listelenen (süzgeçten geçen) seçilebilir satırlar. */
  keys: readonly string[];
  /** Okunmamış rozeti görünen satırlar ("Tümü okundu"). */
  unreadKeys: readonly string[];
  isPinned: (key: string) => boolean;
  isMuted: (key: string) => boolean;
  /** Silinebilen satır mı (varsayılan/ana kanal, proje ve yetkisiz kullanıcı için false). */
  canRemove: (key: string) => boolean;
  pin: (key: string, pinned: boolean) => Promise<void>;
  read: (key: string) => Promise<void>;
  mute: (key: string, muted: boolean) => Promise<void>;
  /** Verilmezse Sil düğmesi hiç çizilmez (görüntüleyen hiçbir satırı silemiyor). */
  remove?: (key: string) => Promise<void>;
}

type BulkKind = "pin" | "read" | "mute" | "delete" | "readAll";

/** Kanal/oda listesinin seçim modu: durum + işlem uygulama + (başlık, alt çubuk, onay penceresi, ⋮ menüsü) parçaları. Görünümler bunları yerleştirir. */
export function useHubSelection(actions: HubBulkActions, options: { word: (selected: readonly string[]) => HubWord; deleteBody: string }) {
  const { t } = useTranslation();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { node: toastNode, show: showToast } = useToast();
  useSelectionChrome(selecting);

  // Listeden çıkan (silinen, süzgeçle gizlenen) satır seçimde kalmaz.
  const selected = actions.keys.filter((key) => selectedIds.has(key));
  const word = options.word(selected);

  function exit() {
    setSelecting(false);
    setSelectedIds(new Set());
    setConfirmDelete(false);
    setError(null);
  }
  function toggle(key: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runBulk(keys: string[], act: (key: string) => Promise<void>): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < keys.length; i += 6) {
      const chunk = keys.slice(i, i + 6);
      const results = await Promise.allSettled(chunk.map(act));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error("hub bulk action", result.reason);
          failed.push(chunk[index]);
        }
      });
    }
    return failed;
  }

  async function apply(kind: BulkKind) {
    if (busy) return;
    const keys = kind === "readAll" ? [...actions.unreadKeys] : kind === "delete" ? selected.filter(actions.canRemove) : [...selected];
    if (keys.length === 0) {
      if (kind === "readAll") showToast(t("th.sel.nothingUnread"));
      return;
    }
    setBusy(true);
    setError(null);
    const pinning = kind === "pin" ? bulkPinTarget(keys, actions.isPinned) : true;
    const muting = kind === "mute" ? bulkMuteTarget(keys, actions.isMuted) : true;
    const act =
      kind === "pin"
        ? (key: string) => actions.pin(key, pinning)
        : kind === "mute"
          ? (key: string) => actions.mute(key, muting)
          : kind === "delete"
            ? (key: string) => (actions.remove ? actions.remove(key) : Promise.reject(new Error("remove_unavailable")))
            : actions.read;
    const failed = await runBulk(keys, act);
    const done = keys.length - failed.length;
    if (done > 0) {
      if (kind === "pin") showToast(t(pinning ? "th.sel.pinnedToast" : "th.sel.unpinnedToast"));
      else if (kind === "mute") showToast(t(muting ? "th.sel.mutedToast" : "th.sel.unmutedToast"));
      else if (kind === "delete") showToast(t("th.sel.deletedToast", { count: done }));
      else showToast(t("th.sel.readToast", { count: done }));
    }
    setConfirmDelete(false);
    if (failed.length > 0) {
      setError(t("th.sel.partialFailed", { failed: failed.length }));
      if (kind !== "readAll") setSelectedIds(new Set(failed));
    } else if (kind !== "readAll") {
      exit();
    }
    setBusy(false);
  }

  const anyRemovable = actions.remove !== undefined;
  const noneSelected = selected.length === 0;
  const pinLabel = !noneSelected && selected.every(actions.isPinned) ? t("rooms.list.unpin") : t("rooms.list.pin");
  const muteLabel = !noneSelected && selected.every(actions.isMuted) ? t("th.sel.unmute") : t("th.sel.mute");
  // Sil görünür ama seçimde silinemeyen satır varsa (varsayılan/ana kanal, proje) soluk ve basılamaz.
  const deleteDisabled = noneSelected || selected.some((key) => !actions.canRemove(key));

  const header = (embedded: boolean): ReactNode => <SelectionHeader count={selected.length} onDone={exit} embedded={embedded} title={selected.length > 0 ? t(COUNT_KEYS[word], { count: selected.length }) : t(SELECT_KEYS[word])} />;

  const bar = (embedded: boolean): ReactNode => {
    const node = (
      <SelectionActionBar
        embedded={embedded}
        compact
        disabled={noneSelected}
        busy={busy}
        onPin={() => void apply("pin")}
        pinLabel={pinLabel}
        onRead={() => void apply("read")}
        onMute={() => void apply("mute")}
        muteLabel={muteLabel}
        onDelete={anyRemovable ? () => setConfirmDelete(true) : undefined}
        deleteDisabled={deleteDisabled}
      />
    );
    return embedded ? node : <Portal>{node}</Portal>;
  };

  const dialogs = (
    <>
      {confirmDelete && selected.length > 0 && (
        <Modal onClose={busy ? () => undefined : () => setConfirmDelete(false)} labelledBy="hub-bulk-delete-title">
          <DialogShell className="w-full max-w-sm space-y-4 rounded-lg border border-border-soft bg-surface p-5 shadow-pop">
            <h2 id="hub-bulk-delete-title" className="text-body font-semibold text-text">
              {t("th.sel.deleteTitle", { count: selected.length })}
            </h2>
            <p className="text-small text-text-secondary">{options.deleteBody}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => void apply("delete")} disabled={busy} data-hub-delete-confirm>
                {busy ? t("common.loading") : t("common.delete")}
              </Button>
            </div>
          </DialogShell>
        </Modal>
      )}
      {toastNode}
    </>
  );

  const moreMenu = (
    <ConversationsMoreMenu
      canSelect={actions.keys.length > 0}
      canMarkAllRead={actions.unreadKeys.length > 0}
      onSelect={() => setSelecting(true)}
      onMarkAllRead={() => void apply("readAll")}
      selectLabel={t(SELECT_KEYS[word === "item" ? "channel" : word])}
    />
  );

  return {
    selecting,
    error,
    header,
    bar,
    dialogs,
    moreMenu,
    exit,
    rowSelection: (key: string) => (selecting ? { selected: selectedIds.has(key), onToggle: () => toggle(key) } : undefined),
  };
}
