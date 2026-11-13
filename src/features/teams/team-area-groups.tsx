"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { FolderMinus } from "@/components/icons/folder-minus";
import { FolderPlus } from "@/components/icons/folder-plus";
import { ListChecks } from "@/components/icons/list-checks";
import { Loader2 } from "@/components/icons/loader-2";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Palette } from "@/components/icons/palette";
import { Pencil } from "@/components/icons/pencil";
import { Presentation } from "@/components/icons/presentation";
import { Trash2 } from "@/components/icons/trash-2";
import { Button } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StorageImg } from "@/components/ui/storage-media";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { FormError } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useSpaceContext } from "@/features/spaces/space-provider";
import { SPACE_COLOR_CLASS } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SPACE_COLORS, SPACE_GROUP_NAME_MAX, type SpaceColor } from "@/lib/spaces";
import { createSpaceGroup, deleteSpaceGroup, updateSpaceGroup, type SpaceGroup } from "@/lib/supabase/spaces";
import { cn } from "@/lib/utils";

/**
 * Ekip dosyasında gruplar = "Öğeler | Gruplar" sekmeleri (docs/history/378-*, kullanıcı G3'ü seçti): Öğeler sekmesi tüm öğeleri (kartta grup adı),
 * Gruplar sekmesi klasör kartlarıdır; bir klasöre girince yalnız o grubun öğeleri görünür (başlık + ⋮ menü). Grup çipi/ikinci satır YOKTUR.
 * Bu dosya klasör ızgarasını, klasör başlığını, ⋮ menüsünü, yeni grup penceresini ve seçim çubuğunu verir; liste mantığı `team-area-view.tsx`'tedir.
 */

/** `folder`: bir grubun kimliği ya da `"none"` (Grupsuz); `null` = klasör listesi. */
export interface GroupNav {
  view: "items" | "groups";
  folder: string | null;
}

export const NO_GROUP = "none";

export interface FolderPreview {
  kind: "image" | "prompt" | "note" | "palette" | "other";
  mediaUrl?: string | null;
  color?: string | null;
}

const PREVIEW_TONE: Record<FolderPreview["kind"], string> = {
  image: "bg-surface-soft",
  prompt: "bg-primary-soft",
  note: "bg-warning/15",
  palette: "bg-surface-soft",
  other: "bg-surface-soft",
};

/** Öğeler | Gruplar anahtarı (segmentli). */
export function ViewSegment({ view, onView, itemCount, groupCount }: { view: GroupNav["view"]; onView: (view: GroupNav["view"]) => void; itemCount: number; groupCount: number }) {
  const { t } = useTranslation();
  const tab = (key: GroupNav["view"], label: string, count: number) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={view === key}
      onClick={() => onView(key)}
      data-area-view={key}
      className={cn("h-10 flex-1 rounded-full text-small font-bold transition-colors", view === key ? "bg-surface text-text shadow-xs" : "text-text-secondary")}
    >
      {label} <span className="font-semibold opacity-60">{count}</span>
    </button>
  );
  return (
    <div role="tablist" aria-label={t("tf.view.aria")} className="flex min-w-0 flex-1 gap-1 rounded-full bg-surface-soft p-1 md:max-w-xs" data-testid="area-view-segment">
      {tab("items", t("tf.view.items"), itemCount)}
      {tab("groups", t("tf.view.groups"), groupCount)}
    </div>
  );
}

/** Klasör kartları ızgarası: her grup + Grupsuz + "Yeni grup". */
export function FolderGrid({
  groups,
  counts,
  previews,
  canAdd,
  onOpen,
  onNew,
}: {
  groups: SpaceGroup[];
  counts: Map<string, number>;
  previews: Map<string, FolderPreview[]>;
  canAdd: boolean;
  onOpen: (folder: string) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const card = (key: string, name: string, dot: string, count: number, stack: FolderPreview[], muted?: boolean) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => onOpen(key)}
        data-area-folder={key}
        className={cn("flex h-full min-h-[9.5rem] w-full flex-col gap-3 rounded-xl border border-border-soft p-3 text-left transition-colors hover:bg-surface-soft", muted ? "bg-background" : "bg-surface")}
      >
        <span aria-hidden className="relative block h-[4.5rem] w-full">
          {stack.slice(0, 3).map((preview, index) => (
            <span
              key={index}
              className={cn("absolute top-0 h-16 w-[62%] overflow-hidden rounded-xl border-2 border-surface", PREVIEW_TONE[preview.kind])}
              style={{ left: `${index * 18}%`, top: `${(2 - index) * 4}px`, zIndex: index, background: preview.color ?? undefined }}
            >
              {preview.kind === "image" && preview.mediaUrl && <StorageImg src={preview.mediaUrl} alt="" className="h-full w-full object-cover" />}
            </span>
          ))}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-body font-bold text-text">
            <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} />
            <span className="truncate">{name}</span>
          </span>
          <span className="block text-small text-text-muted">{t("spaces.groups.count", { count })}</span>
        </span>
      </button>
    </li>
  );
  return (
    <ul className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4" data-testid="area-folders">
      {groups.map((group) => card(group.id, group.name, SPACE_COLOR_CLASS[group.color].dot, counts.get(group.id) ?? 0, previews.get(group.id) ?? []))}
      {(counts.get(NO_GROUP) ?? 0) > 0 && card(NO_GROUP, t("spaces.groups.none"), "bg-border-strong", counts.get(NO_GROUP) ?? 0, previews.get(NO_GROUP) ?? [], true)}
      {canAdd && (
        <li>
          <button type="button" onClick={onNew} data-area-folder-new="" className="flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-soft/50 text-small font-bold text-primary transition-colors hover:bg-surface-soft">
            <FolderPlus size={24} aria-hidden />
            {t("tf.group.newTile")}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Klasörün içinde başlık: geri (Gruplar), grup adı + renk, ⋮ menü (Grupsuz'da menü yok). */
export function FolderHeader({ title, dot, onBack, onMenu }: { title: string; dot: string; onBack: () => void; onMenu?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1" data-testid="area-folder-header">
      <button type="button" onClick={onBack} aria-label={t("tf.folder.back")} data-area-folder-back="" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text hover:bg-surface-soft">
        <ChevronLeft size={24} aria-hidden />
      </button>
      <h3 className="flex min-w-0 flex-1 items-center gap-2 font-display text-h3 font-bold text-text">
        <span aria-hidden className={cn("h-3 w-3 shrink-0 rounded-full", dot)} />
        <span className="truncate" data-area-folder-title="">
          {title}
        </span>
      </h3>
      {onMenu && (
        <button type="button" onClick={onMenu} aria-label={t("tf.folder.menu")} data-area-folder-menu="" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-surface-soft">
          <MoreVertical size={20} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Boş klasör (mockup G3-6). */
export function EmptyFolder({ name, canAdd, onAdd, onPick }: { name: string; canAdd: boolean; onAdd: () => void; onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-sm space-y-4 px-2 py-10 text-center" data-testid="area-folder-empty">
      <span aria-hidden className="mx-auto grid h-20 w-20 place-items-center rounded-xl bg-primary-soft text-primary">
        <FolderPlus size={38} />
      </span>
      <div className="space-y-1.5">
        <h3 className="font-display text-h2 font-bold text-text">{t("tf.folder.emptyTitle")}</h3>
        <p className="text-body text-text-secondary">{t("tf.folder.emptyBody")}</p>
      </div>
      {canAdd && (
        <div className="grid gap-3">
          <Button type="button" onClick={onAdd} className="h-12 rounded-full" data-folder-empty-add="">
            {t("tf.group.addHere", { name })}
          </Button>
          <Button type="button" variant="outline" onClick={onPick} className="h-12 rounded-full" data-folder-empty-pick="">
            {t("tf.folder.emptyPick")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renk seçici (grup renkleri = Space renkleri). */
function ColorPicker({ value, onChange, disabled }: { value: SpaceColor; onChange: (color: SpaceColor) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("spaces.notes.color")} className="flex flex-wrap gap-3">
      {SPACE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(`spaces.color.${color}` as TranslationKey)}
          disabled={disabled}
          onClick={() => onChange(color)}
          data-group-color={color}
          className={cn("h-9 w-9 rounded-full transition-shadow", SPACE_COLOR_CLASS[color].dot, value === color && "ring-2 ring-primary ring-offset-2 ring-offset-surface")}
        />
      ))}
    </div>
  );
}

/** "Yeni grup" penceresi: ekranın ORTASINDA (telefonda da), ad + renk. */
export function NewGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (group: SpaceGroup) => void }) {
  const { t } = useTranslation();
  const { space, groups, setGroups, userId } = useSpaceContext();
  const [name, setName] = useState("");
  const [color, setColor] = useState<SpaceColor>("primary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const group = await createSpaceGroup(space.id, name, userId, groups.length, color);
      setGroups((list) => [...list, group]);
      onCreated?.(group);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="new-group-title" overLayers centered>
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5" data-testid="new-group-form">
        <div className="space-y-1">
          <h2 id="new-group-title" className="font-display text-h3 font-bold text-text">
            {t("tf.new.title")}
          </h2>
          <p className="text-small text-text-secondary">{t("tf.new.hint")}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-group-name" className="text-label font-semibold text-text">
            {t("spaces.groups.nameLabel")}
          </label>
          <input id="new-group-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={SPACE_GROUP_NAME_MAX} placeholder={t("spaces.groups.newPlaceholder")} className={cn(fieldInputClassName, "h-12")} data-new-group-name="" />
        </div>
        <div className="space-y-1.5">
          <span className="text-label font-semibold text-text">{t("spaces.notes.color")}</span>
          <ColorPicker value={color} onChange={setColor} disabled={busy} />
        </div>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" className="h-12 flex-1" disabled={busy || !name.trim()} data-new-group-create="">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t("tf.new.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Klasör ⋮ menüsü: yeniden adlandır, renk, öğeleri seç, hepsini panoya ekle, grubu sil (öğeler silinmez). */
export function GroupMenuDialog({
  group,
  count,
  onClose,
  onSelect,
  onToBoard,
  onDeleted,
}: {
  group: SpaceGroup;
  count: number;
  onClose: () => void;
  onSelect: () => void;
  onToBoard?: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { setGroups, setItems, caps } = useSpaceContext();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const updated = await updateSpaceGroup(group.id, { name });
      setGroups((list) => list.map((entry) => (entry.id === group.id ? updated : entry)));
      setRenaming(false);
    });
  };
  const recolor = (color: SpaceColor) =>
    void run(async () => {
      const updated = await updateSpaceGroup(group.id, { color });
      setGroups((list) => list.map((entry) => (entry.id === group.id ? updated : entry)));
    });
  const remove = () =>
    void run(async () => {
      await deleteSpaceGroup(group.id);
      setGroups((list) => list.filter((entry) => entry.id !== group.id));
      // Sunucu `on delete set null`: öğeler gruptan çıkar, silinmez.
      setItems((list) => list.map((item) => (item.groupId === group.id ? { ...item, groupId: null } : item)));
      onDeleted();
    });

  const row = (key: string, icon: ReactNode, label: string, hint: string | null, onClick: () => void, danger = false) => (
    <li key={key}>
      <button type="button" onClick={onClick} disabled={busy} data-group-menu-item={key} className={cn("flex min-h-14 w-full items-center gap-4 rounded-xl px-2 text-left text-body font-semibold hover:bg-surface-soft disabled:opacity-50", danger ? "text-danger hover:bg-danger/10" : "text-text")}>
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block">{label}</span>
          {hint && <span className="block text-small font-normal text-text-muted">{hint}</span>}
        </span>
      </button>
    </li>
  );

  if (confirmDelete) {
    return (
      <ConfirmDialog
        id="group-delete"
        title={t("spaces.groups.deleteTitle", { name: group.name })}
        body={t("spaces.groups.deleteBody")}
        confirmLabel={t("spaces.groups.deleteConfirm")}
        danger
        busy={busy}
        error={error}
        overLayers
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    );
  }

  return (
    <SpaceDialog title={group.name} eyebrow={t("spaces.groups.count", { count })} onClose={onClose} busy={busy} formTestId="group-menu">
      <div className="space-y-2" data-testid="group-menu-body">
        {renaming ? (
          <form onSubmit={rename} className="flex gap-2" data-group-rename-form="">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={SPACE_GROUP_NAME_MAX} aria-label={t("spaces.groups.nameLabel")} className={cn(fieldInputClassName, "h-12 min-w-0 flex-1")} data-group-rename-input="" />
            <Button type="submit" className="h-12" disabled={busy || !name.trim()}>
              {t("common.save")}
            </Button>
          </form>
        ) : (
          <ul className="-mx-1">
            {caps.edit && row("rename", <Pencil size={24} />, t("tf.folder.rename"), null, () => setRenaming(true))}
            {caps.edit && (
              <li className="flex items-start gap-4 px-2 py-3" data-group-menu-item="color">
                <Palette size={24} aria-hidden className="mt-0.5 shrink-0 text-text" />
                <div className="min-w-0 space-y-3">
                  <span className="block text-body font-semibold text-text">{t("spaces.notes.color")}</span>
                  <ColorPicker value={group.color} onChange={recolor} disabled={busy} />
                </div>
              </li>
            )}
            {row("select", <ListChecks size={24} />, t("tf.folder.select"), null, onSelect)}
            {onToBoard && count > 0 && row("board", <Presentation size={24} />, t("tf.folder.toBoard"), t("tf.folder.toBoardHint", { count }), onToBoard)}
            {caps.edit && <li aria-hidden className="my-1 h-px bg-border-soft" />}
            {caps.edit && row("delete", <Trash2 size={24} />, t("tf.folder.delete"), t("tf.folder.deleteHint"), () => setConfirmDelete(true), true)}
          </ul>
        )}
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

export interface BarAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger";
  disabled?: boolean;
}

/** Seçim kipinin alt çubuğu: sayı + Tümünü seç + eylemler (mockup G4 / G3-5). Eylemler etiketli düğmelerdir. */
export function SelectionBar({ count, allSelected, onAll, onClose, actions }: { count: number; allSelected: boolean; onAll: () => void; onClose: () => void; actions: BarAction[] }) {
  const { t } = useTranslation();
  return (
    <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 pt-2 md:bottom-4" data-testid="area-select-bar" data-keyboard-hide="">
      <div className="mx-auto max-w-xl space-y-2 rounded-lg border border-border-soft bg-surface p-2.5 shadow-pop">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClose} aria-label={t("tf.select.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-surface-soft" data-select-close="">
            <span aria-hidden className="text-h3 leading-none">
              ×
            </span>
          </button>
          <span className="min-w-0 flex-1 truncate text-small font-bold text-text" data-select-count="" aria-live="polite">
            {t("tf.select.count", { count })}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onAll} data-select-all="">
            {t(allSelected ? "tf.select.none" : "tf.select.all")}
          </Button>
        </div>
        <div className="flex gap-1.5" role="toolbar" aria-label={t("tf.select.actions")}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              data-select-action={action.key}
              className={cn(
                "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-caption font-bold transition-colors disabled:opacity-50",
                action.tone === "primary" ? "border-primary bg-primary text-primary-foreground" : action.tone === "danger" ? "border-border-soft bg-surface text-danger hover:bg-danger/10" : "border-border-soft bg-surface text-text hover:bg-surface-soft",
              )}
            >
              <span aria-hidden>{action.icon}</span>
              <span className="max-w-full truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Toplu silme onayı. */
export function BulkDeleteDialog({ count, busy, error, onConfirm, onCancel }: { count: number; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog id="bulk-delete" title={t("tf.bulk.deleteTitle", { count })} body={t("tf.bulk.deleteBody")} confirmLabel={t("tf.bulk.delete")} danger busy={busy} error={error} overLayers onConfirm={onConfirm} onCancel={onCancel} />
  );
}

export { FolderMinus as RemoveFromGroupIcon, FolderPlus as AddToGroupIcon, Trash2 as BulkTrashIcon, Presentation as BulkBoardIcon };

/** Klasör açıkken silinen/boşalan grup kimliğini geçerliye indirir (grup silinince liste kendiliğinden Gruplar'a döner). */
export function useValidFolder(nav: GroupNav, groups: SpaceGroup[], setNav: (nav: GroupNav) => void) {
  useEffect(() => {
    if (nav.folder && nav.folder !== NO_GROUP && !groups.some((group) => group.id === nav.folder)) setNav({ view: "groups", folder: null });
  }, [nav, groups, setNav]);
}
