"use client";

import { useState } from "react";
import { Check } from "@/components/icons/check";
import { FolderPlus } from "@/components/icons/folder-plus";
import { Layers } from "@/components/icons/layers";
import { Loader2 } from "@/components/icons/loader-2";
import { Button } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { GroupsManagerModal } from "@/features/spaces/space-items";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useSpaceContext } from "@/features/spaces/space-provider";
import { SPACE_COLOR_CLASS } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_GROUP_NAME_MAX } from "@/lib/spaces";
import { createSpaceGroup } from "@/lib/supabase/spaces";
import { cn } from "@/lib/utils";

/**
 * "Gruba ekle" (docs/history/377-*, mockup C2): seçilen bir ya da birkaç öğeyi tek pencerede bir gruba koyar. Gruplar karo olarak görünür
 * (ad + öğe sayısı), "Grupsuz" gruptan çıkarır, "Yeni grup" aynı pencerede grup açıp seçer. Bir öğe tek grupta durur; başka gruptakiler
 * seçilen gruba taşınır. Grup değişikliği asıl öğeye yazılır (`patchItem`); pano yansımalarının düzeni ayrıdır.
 * Dosya listesindeki çoklu seçim çubuğu ve öğe çekmecesinin ⋮ menüsü AYNI pencereyi açar — ikinci bir grup atama yüzeyi yazılmaz.
 */
export function GroupAssignDialog({ itemIds, onClose, onDone }: { itemIds: string[]; onClose: () => void; onDone?: (groupId: string | null) => void }) {
  const { t } = useTranslation();
  const { space, groups, setGroups, items, patchItem, userId, caps } = useSpaceContext();
  // `undefined`: henüz seçilmedi · `null`: "Grupsuz" (gruptan çıkar) · string: grup kimliği.
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const countIn = (groupId: string | null) => items.filter((item) => (item.groupId ?? null) === groupId && item.kind !== "frame" && item.kind !== "text" && item.kind !== "shape").length;
  const single = itemIds.length === 1 ? (items.find((item) => item.id === itemIds[0]) ?? null) : null;
  const currentGroup = single ? (single.groupId ?? null) : undefined;

  async function createGroup() {
    const trimmed = name.trim();
    if (!trimmed || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const group = await createSpaceGroup(space.id, trimmed, userId, groups.length);
      setGroups((list) => [...list, group]);
      setChoice(group.id);
      setName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (creating) {
      void createGroup();
      return;
    }
    if (choice === undefined) return setError(t("tf.group.pick"));
    setBusy(true);
    setError(null);
    try {
      await Promise.all(itemIds.map((id) => patchItem(id, { groupId: choice })));
      onDone?.(choice);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  const chosenName = typeof choice === "string" ? (groups.find((group) => group.id === choice)?.name ?? "") : "";
  const submitLabel = creating ? t("spaces.groups.add") : choice === null ? t("tf.group.removeFrom") : chosenName ? t("tf.group.addTo", { name: chosenName }) : t("tf.group.add");

  const tile = (key: string, selected: boolean, current: boolean, onPick: () => void, children: React.ReactNode, extra?: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={busy}
      onClick={onPick}
      data-group-tile={key}
      className={cn("flex min-h-[6.5rem] flex-col gap-2 rounded-lg border-[1.5px] p-4 text-left transition-colors disabled:opacity-50", selected ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft", extra)}
    >
      {children}
      {current && <span className="mt-auto text-caption font-semibold text-text-muted">{t("tf.group.current")}</span>}
    </button>
  );

  return (
    <SpaceDialog
      title={itemIds.length > 1 ? t("tf.group.addTitleMany", { count: itemIds.length }) : t("tf.group.addTitle")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="group-assign-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!creating && choice === undefined}>
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4" data-testid="group-assign">
        <div role="radiogroup" aria-label={t("spaces.groups.label")} className="grid grid-cols-2 gap-3">
          {groups.map((group) =>
            tile(
              group.id,
              choice === group.id,
              currentGroup === group.id,
              () => {
                setCreating(false);
                setChoice(group.id);
              },
              <>
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cn("h-3 w-3 shrink-0 rounded-full", SPACE_COLOR_CLASS[group.color].dot)} />
                  <span className="min-w-0 flex-1 truncate text-small font-bold text-text">{group.name}</span>
                  {choice === group.id && <Check size={16} aria-hidden className="shrink-0 text-primary" />}
                </span>
                <span className="text-caption text-text-secondary">{t("spaces.groups.count", { count: countIn(group.id) })}</span>
              </>,
            ),
          )}
          {tile(
            "none",
            choice === null,
            currentGroup === null,
            () => {
              setCreating(false);
              setChoice(null);
            },
            <>
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full bg-border-strong" />
                <span className="min-w-0 flex-1 truncate text-small font-bold text-text">{t("spaces.groups.none")}</span>
                {choice === null && <Check size={16} aria-hidden className="shrink-0 text-primary" />}
              </span>
              <span className="text-caption text-text-secondary">{t("tf.group.noneHint")}</span>
            </>,
          )}
          {caps.edit && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setError(null);
              }}
              disabled={busy}
              aria-expanded={creating}
              data-group-tile="new"
              className={cn("flex min-h-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed p-4 text-small font-bold text-primary transition-colors", creating ? "border-primary bg-primary-soft" : "border-border bg-surface-soft/50 hover:bg-surface-soft")}
            >
              <FolderPlus size={24} aria-hidden />
              {t("tf.group.newTile")}
            </button>
          )}
        </div>

        {creating && (
          <div className="space-y-1.5" data-group-new-row>
            <label htmlFor="group-assign-name" className="text-label font-semibold text-text">
              {t("spaces.groups.nameLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="group-assign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={SPACE_GROUP_NAME_MAX}
                placeholder={t("spaces.groups.newPlaceholder")}
                className={cn(fieldInputClassName, "h-12 min-w-0 flex-1")}
                data-group-new-name
              />
              <Button type="button" className="h-12 px-5" disabled={busy || !name.trim()} onClick={() => void createGroup()} data-group-new-create>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t("spaces.groups.add")}
              </Button>
            </div>
          </div>
        )}

        <p className="text-caption text-text-secondary">{t("tf.group.moveNote")}</p>
        <FormError message={error} />
        {caps.edit && groups.length > 0 && (
          <button type="button" onClick={() => setManage(true)} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:underline" data-group-manage>
            <Layers size={16} aria-hidden />
            {t("spaces.groups.manage")}
          </button>
        )}
      </div>
      {manage && <GroupsManagerModal onClose={() => setManage(false)} />}
    </SpaceDialog>
  );
}
