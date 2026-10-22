"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, LayoutDashboard, Loader2, Palette, Pencil, Pipette, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import { extractPaletteFromBlob, normalizeHex } from "@/lib/color-palette";
import { resolveMediaUrl } from "@/lib/supabase/media-url";
import { SPACE_PALETTE_COLORS_MAX, SPACE_PALETTE_DESCRIPTION_MAX, SPACE_PALETTE_NAME_MAX } from "@/lib/spaces";
import { createSpacePalette, deleteSpacePalette, updateSpacePalette, type SpacePalette } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { resolveSource, sourceReasonKey, usePlaceNewItems, useItemTitle } from "../space-items";
import { FormError } from "../space-forms";
import { SpaceDialog } from "../space-modals";
import { SpaceImage } from "../space-visuals";

/**
 * Paletler ve stil rehberi (docs/history/213-*): her Space'te birden çok palet; renk ekle/düzenle/sil/sırala, HEX gir, tek tıkla
 * kopyala. "Görselden çıkar" gerçekten çalışır: görsel okuyucunun yetkisiyle (signed URL) indirilir, tarayıcıda median-cut ile
 * baskın renkler çıkarılır; okunamayan/çözülemeyen görselde hata söylenir, sahte palet üretilmez. Renkler kullanıcı verisidir
 * (satır içi `style`), arayüz tokenları değildir.
 */
export function PaletteTab() {
  const { t } = useTranslation();
  const { space, palettes, setPalettes, caps, userId } = useSpaceContext();
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);

  return (
    <div className="space-y-4" data-testid="space-palettes">
      {caps.edit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            {t("spaces.palette.new")}
          </Button>
          <Button variant="outline" onClick={() => setExtracting(true)}>
            <Pipette size={16} aria-hidden />
            {t("spaces.palette.fromImage")}
          </Button>
        </div>
      )}
      {palettes.length === 0 ? (
        <EmptyState icon={Palette} title={t("spaces.palette.empty")} description={caps.edit ? t("spaces.palette.emptyEditor") : undefined} />
      ) : (
        <ul className="space-y-4">
          {palettes.map((palette) => (
            <PaletteCard key={palette.id} palette={palette} />
          ))}
        </ul>
      )}
      {creating && userId && (
        <PaletteFormModal
          onClose={() => setCreating(false)}
          onSubmit={async (name, description) => {
            const created = await createSpacePalette(space.id, { name, description, colors: [] }, userId, palettes.length);
            setPalettes((list) => [...list, created]);
          }}
        />
      )}
      {extracting && <ExtractPaletteModal onClose={() => setExtracting(false)} />}
    </div>
  );
}

function PaletteCard({ palette }: { palette: SpacePalette }) {
  const { t, language } = useTranslation();
  const { space, setPalettes, setItems, caps, items, addItems } = useSpaceContext();
  const place = usePlaceNewItems();
  const [hex, setHex] = useState("");
  const [picker, setPicker] = useState("#7c5cff");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const hexId = useId();
  const onBoard = items.some((item) => item.kind === "palette" && item.paletteId === palette.id);

  async function saveColors(colors: string[]) {
    const previous = palette.colors;
    setPalettes((list) => list.map((entry) => (entry.id === palette.id ? { ...entry, colors } : entry)));
    setError(null);
    try {
      const saved = await updateSpacePalette(palette.id, { colors });
      setPalettes((list) => list.map((entry) => (entry.id === palette.id ? saved : entry)));
    } catch (err) {
      setPalettes((list) => list.map((entry) => (entry.id === palette.id ? { ...entry, colors: previous } : entry)));
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  function addColor(event: React.FormEvent) {
    event.preventDefault();
    const value = normalizeHex(hex || picker);
    if (!value) {
      setError(t("spaces.palette.invalidHex"));
      return;
    }
    if (palette.colors.length >= SPACE_PALETTE_COLORS_MAX) {
      setError(t("spaces.palette.tooMany", { max: SPACE_PALETTE_COLORS_MAX }));
      return;
    }
    if (selected !== null) {
      const next = [...palette.colors];
      next[selected] = value;
      void saveColors(next);
    } else void saveColors([...palette.colors, value]);
    setHex("");
    setSelected(null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= palette.colors.length) return;
    const next = [...palette.colors];
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(target);
    void saveColors(next);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      setError(t("spaces.share.copyFailed"));
    }
  }

  async function addToBoard() {
    setError(null);
    try {
      await addItems(place([{ spaceId: space.id, kind: "palette", paletteId: palette.id }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  return (
    <li className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 shadow-xs" data-palette={palette.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-h3 font-semibold text-text">{palette.name}</h3>
          {palette.description && <p className="break-words text-small text-text-secondary">{palette.description}</p>}
          <p className="text-caption text-text-muted">
            {palette.source === "image" ? t("spaces.palette.sourceImage") : t("spaces.palette.sourceManual")} · {formatRelativeTime(palette.updatedAt, language)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {palette.colors.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void copy(palette.colors.join(", "))}>
              <Copy size={14} aria-hidden />
              {copied === palette.colors.join(", ") ? t("common.copied") : t("spaces.palette.copyAll")}
            </Button>
          )}
          {caps.edit && !onBoard && (
            <Button variant="ghost" size="sm" onClick={() => void addToBoard()}>
              <LayoutDashboard size={14} aria-hidden />
              {t("spaces.palette.addToBoard")}
            </Button>
          )}
          {caps.edit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={t("spaces.palette.edit")}>
                <Pencil size={14} aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setConfirmDelete(true)} aria-label={t("spaces.palette.delete")}>
                <Trash2 size={14} aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      {palette.colors.length === 0 ? (
        <p className="text-small text-text-muted">{t("spaces.palette.noColors")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label={t("spaces.palette.colors")}>
          {palette.colors.map((color, index) => (
            <li key={`${color}-${index}`} className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  if (caps.edit) {
                    setSelected(selected === index ? null : index);
                    setHex(color);
                    setPicker(color);
                  }
                  void copy(color);
                }}
                aria-pressed={caps.edit ? selected === index : undefined}
                aria-label={t("spaces.palette.copyColor", { hex: color })}
                className={cn("block h-14 w-full rounded-md border border-border-soft", selected === index && "ring-2 ring-primary ring-offset-2 ring-offset-surface")}
                style={{ backgroundColor: color }}
              />
              <span className="block text-center font-mono text-caption text-text-secondary">{copied === color ? t("common.copied") : color}</span>
            </li>
          ))}
        </ul>
      )}

      {caps.edit && (
        <form onSubmit={addColor} className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-3">
          <div>
            <label htmlFor={hexId} className={fieldLabelClassName}>
              {selected !== null ? t("spaces.palette.editColor") : t("spaces.palette.addColor")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={picker}
                onChange={(event) => {
                  setPicker(event.target.value);
                  setHex(event.target.value);
                }}
                aria-label={t("spaces.palette.picker")}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
              />
              <input
                id={hexId}
                value={hex}
                onChange={(event) => {
                  setHex(event.target.value);
                  const normalized = normalizeHex(event.target.value);
                  if (normalized) setPicker(normalized);
                }}
                placeholder="#7c5cff"
                maxLength={7}
                spellCheck={false}
                className={cn(fieldInputClassName, "h-10 w-32 font-mono")}
              />
            </div>
          </div>
          <Button type="submit" size="md">
            {selected !== null ? t("common.save") : t("spaces.palette.add")}
          </Button>
          {selected !== null && (
            <>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(selected, -1)} aria-label={t("spaces.palette.moveLeft")} disabled={selected === 0}>
                <ChevronLeft size={16} />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(selected, 1)} aria-label={t("spaces.palette.moveRight")} disabled={selected === palette.colors.length - 1}>
                <ChevronRight size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger/10"
                onClick={() => {
                  void saveColors(palette.colors.filter((_, i) => i !== selected));
                  setSelected(null);
                  setHex("");
                }}
              >
                <Trash2 size={14} aria-hidden />
                {t("spaces.palette.removeColor")}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label={t("common.cancel")}>
                <X size={16} />
              </Button>
            </>
          )}
        </form>
      )}
      <FormError message={error} />

      {editing && (
        <PaletteFormModal
          palette={palette}
          onClose={() => setEditing(false)}
          onSubmit={async (name, description) => {
            const saved = await updateSpacePalette(palette.id, { name, description });
            setPalettes((list) => list.map((entry) => (entry.id === palette.id ? saved : entry)));
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          id="delete-palette"
          title={t("spaces.palette.deleteTitle", { name: palette.name })}
          body={t("spaces.palette.deleteBody")}
          confirmLabel={t("spaces.palette.delete")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await deleteSpacePalette(palette.id);
              setPalettes((list) => list.filter((entry) => entry.id !== palette.id));
              // Panodaki palet kartı sunucuda zincirle silinir; yerelde de düşer.
              setItems((list) => list.filter((item) => item.paletteId !== palette.id));
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setBusy(false);
              setConfirmDelete(false);
            }
          }}
        />
      )}
    </li>
  );
}

function PaletteFormModal({ palette, onClose, onSubmit }: { palette?: SpacePalette; onClose: () => void; onSubmit: (name: string, description: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(palette?.name ?? "");
  const [description, setDescription] = useState(palette?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const descriptionId = useId();
  return (
    <SpaceDialog title={palette ? t("spaces.palette.edit") : t("spaces.palette.new")} onClose={onClose} busy={busy}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError(t("spaces.palette.nameRequired"));
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onSubmit(name, description);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : t("spaces.error.generic"));
            setBusy(false);
          }
        }}
      >
        <div>
          <label htmlFor={nameId} className={fieldLabelClassName}>
            {t("spaces.palette.name")}
          </label>
          <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} maxLength={SPACE_PALETTE_NAME_MAX} className={fieldInputClassName} autoFocus />
        </div>
        <div>
          <label htmlFor={descriptionId} className={fieldLabelClassName}>
            {t("spaces.form.description")} <span className="font-normal text-text-muted">{t("spaces.form.optional")}</span>
          </label>
          <input id={descriptionId} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={SPACE_PALETTE_DESCRIPTION_MAX} className={fieldInputClassName} />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t("common.save")}
          </Button>
        </div>
      </form>
    </SpaceDialog>
  );
}

function ExtractPaletteModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { space, items, sources, readable, palettes, setPalettes, userId } = useSpaceContext();
  const itemTitle = useItemTitle();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const images = items.filter((item) => item.kind === "image" && !sourceReasonKey(resolveSource(item, sources, readable).state));

  async function extract(itemId: string) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item?.mediaUrl || !userId) return;
    setBusy(itemId);
    setError(null);
    try {
      const signed = await resolveMediaUrl(item.mediaUrl);
      const response = signed ? await fetch(signed) : null;
      const colors = response?.ok ? await extractPaletteFromBlob(await response.blob(), 6) : null;
      if (!colors) {
        setError(t("spaces.palette.extractFailed"));
        setBusy(null);
        return;
      }
      const created = await createSpacePalette(
        space.id,
        { name: t("spaces.palette.fromImageName", { title: itemTitle(item) }).slice(0, SPACE_PALETTE_NAME_MAX), description: "", colors, source: "image", sourceItemId: item.id },
        userId,
        palettes.length,
      );
      setPalettes((list) => [...list, created]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.palette.extractFailed"));
      setBusy(null);
    }
  }

  return (
    <SpaceDialog title={t("spaces.palette.fromImage")} onClose={onClose} busy={busy !== null} wide>
      <div className="space-y-3" data-testid="extract-palette">
        <p className="text-small text-text-secondary">{t("spaces.palette.fromImageHelp")}</p>
        {images.length === 0 ? (
          <p className="text-small text-text-muted">{t("spaces.settings.noImages")}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void extract(item.id)} disabled={busy !== null} className="relative block w-full overflow-hidden rounded-md" aria-label={itemTitle(item)}>
                  <SpaceImage url={item.mediaUrl} alt="" className="aspect-square w-full" />
                  {busy === item.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 size={20} className="animate-spin text-primary" aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
