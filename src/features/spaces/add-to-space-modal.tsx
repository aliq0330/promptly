"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, CheckCircle2, ImageIcon, Loader2, Plus, Search, SquareTerminal } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { placeMany, boundsOf, topZ } from "@/lib/space-board";
import { defaultItemSize, matchesQuery, SPACE_KIND_LABEL, spaceHref, type SpaceContentType } from "@/lib/spaces";
import { fetchPromptById } from "@/lib/supabase/prompts";
import {
  addSpaceItems,
  createSpace,
  fetchSpaceItems,
  findExistingItems,
  listEditableSpaces,
  summaryCover,
  type NewSpaceItem,
  type SpaceSummary,
} from "@/lib/supabase/spaces";
import type { Prompt } from "@/types";
import { FormError } from "./space-forms";
import { SpaceDialog } from "./space-modals";
import { SpaceCoverArt, SpaceImage } from "./space-visuals";

export interface AddToSpaceTarget {
  type: "prompt" | SpaceContentType;
  id: string;
  /** Topluluğa ait içerik Space'e eklenemez (içerik topluluktan dışarı çıkmaz; sunucu da reddeder). */
  communityId?: string | null;
}

/**
 * "Space'e ekle" (docs/history/213-*): gönderi kartı / detay menüsü, Odak ve hikâye bağlantısından açılır. Akış: Space seç (ya da
 * adıyla yenisini oluştur) → ekle → sonuç + "Space'i aç". İçerik KOPYALANMAZ: görsel öğe gönderinin görsel kimliğine, prompt kartı
 * gönderiye başvurur (kaynak gizlenirse/silinirse Space'te "erişilemiyor" görünür). Görselli promptta hangi görsellerin ve prompt
 * kartının ekleneceği seçilir. Aynı içerik o Space'te zaten varsa listede "Zaten var" yazar; yinelenen ekleme sunucuda da engellenir.
 */
export function AddToSpaceModal({
  target,
  onClose,
  overLayers,
  onOpenSpace,
}: {
  target: AddToSpaceTarget;
  onClose: () => void;
  overLayers?: boolean;
  /** Tam ekran bir katmandan (hikâye görüntüleyici) açıldıysa: "Space'i aç" önce o katmanı kapatıp öyle gider. */
  onOpenSpace?: (href: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null | undefined>(target.type === "prompt" ? undefined : null);
  const [chosenImages, setChosenImages] = useState<string[]>([]);
  const [includePrompt, setIncludePrompt] = useState(false);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; title: string; count: number } | null>(null);
  const newId = useId();

  useEffect(() => {
    let alive = true;
    listEditableSpaces()
      .then((list) => alive && setSpaces(list))
      .catch(() => alive && setSpaces([]));
    if (target.type === "prompt") {
      fetchPromptById(target.id)
        .then((loaded) => {
          if (!alive) return;
          setPrompt(loaded);
          const images = (loaded?.media ?? []).filter((media) => !/\.(mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i.test(media.url));
          setChosenImages(images.slice(0, 1).map((media) => media.url));
          setIncludePrompt(images.length === 0);
        })
        .catch(() => alive && setPrompt(null));
    }
    return () => {
      alive = false;
    };
  }, [target.type, target.id]);

  const images = useMemo(() => (prompt?.media ?? []).filter((media) => !/\.(mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i.test(media.url)), [prompt]);
  const primaryRef = useMemo(() => {
    if (target.type !== "prompt") return { contentId: target.id };
    if (chosenImages[0]) return { mediaUrl: chosenImages[0] };
    return { promptId: target.id };
  }, [target, chosenImages]);

  useEffect(() => {
    if (!spaces || spaces.length === 0) return;
    let alive = true;
    findExistingItems(spaces.map((space) => space.id), primaryRef).then((set) => alive && setExisting(set));
    return () => {
      alive = false;
    };
  }, [spaces, primaryRef]);

  const visibleSpaces = (spaces ?? []).filter((space) => matchesQuery(query, space.title));

  function drafts(spaceId: string): Omit<NewSpaceItem, "x" | "y" | "w" | "h">[] {
    if (target.type !== "prompt") return [{ spaceId, kind: "content", contentType: target.type, contentId: target.id }];
    const out: Omit<NewSpaceItem, "x" | "y" | "w" | "h">[] = images
      .filter((media) => chosenImages.includes(media.url))
      .map((media) => ({ spaceId, kind: "image", promptId: target.id, mediaUrl: media.url, mediaWidth: media.width || null, mediaHeight: media.height || null }));
    if (includePrompt) out.push({ spaceId, kind: "prompt", promptId: target.id });
    return out;
  }

  async function add(spaceId: string, title: string) {
    if (!user) return;
    const list = drafts(spaceId);
    if (list.length === 0) {
      setError(t("spaces.add.pickSomething"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const current = await fetchSpaceItems(spaceId);
      const b = boundsOf(current);
      const sizes = list.map((draft) => defaultItemSize(draft.kind, { width: draft.mediaWidth ?? null, height: draft.mediaHeight ?? null }));
      const spots = placeMany(current, sizes, b ? { x: b.x + b.w + 200, y: b.y + 130 } : { x: 0, y: 0 });
      const z = topZ(current);
      const created = await addSpaceItems(list.map((draft, index) => ({ ...draft, ...spots[index], ...sizes[index], z: z + index + 1 })), user.id);
      setDone({ id: spaceId, title, count: created.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createSpace({ title: newName, description: "", kind: "moodboard", visibility: "private", groups: [] });
      setBusy(false);
      await add(id, newName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  if (target.communityId) {
    return (
      <SpaceDialog title={t("spaces.add.title")} onClose={onClose} overLayers={overLayers}>
        <p className="text-small text-text-secondary">{t("spaces.add.communityBlocked")}</p>
      </SpaceDialog>
    );
  }

  if (done) {
    return (
      <SpaceDialog title={t("spaces.add.title")} onClose={onClose} overLayers={overLayers}>
        <div className="space-y-4 text-center" data-testid="add-to-space-done">
          <CheckCircle2 size={36} className="mx-auto text-success" aria-hidden />
          <p role="status" className="text-body font-semibold text-text">
            {t("spaces.add.done", { title: done.title, count: done.count })}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
            {onOpenSpace ? (
              <Button onClick={() => onOpenSpace(spaceHref(done.id, "board"))}>{t("spaces.add.openSpace")}</Button>
            ) : (
              <Link href={spaceHref(done.id, "board")} onClick={onClose} className={buttonClassName()}>
                {t("spaces.add.openSpace")}
              </Link>
            )}
          </div>
        </div>
      </SpaceDialog>
    );
  }

  return (
    <SpaceDialog title={t("spaces.add.title")} onClose={onClose} busy={busy} overLayers={overLayers} wide>
      <div className="space-y-4" data-testid="add-to-space">
        {target.type === "prompt" && prompt === undefined && <Loader2 size={18} className="animate-spin text-text-muted" aria-label={t("common.loading")} />}
        {target.type === "prompt" && prompt === null && <p className="text-small text-danger">{t("spaces.source.unavailable")}</p>}
        {prompt && (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-label font-medium text-text">{t("spaces.add.what")}</legend>
            {images.length > 0 && (
              <div className="scrollbar-fine flex gap-2 overflow-x-auto pb-1">
                {images.map((media) => {
                  const on = chosenImages.includes(media.url);
                  return (
                    <label key={media.url} className="relative shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setChosenImages((list) => (on ? list.filter((url) => url !== media.url) : [...list, media.url]))}
                        className="peer sr-only"
                        aria-label={t("spaces.add.image")}
                      />
                      <SpaceImage url={media.url} alt="" className="h-20 w-20 rounded-md opacity-60 ring-primary peer-checked:opacity-100 peer-checked:ring-2 peer-focus-visible:ring-2" />
                      {on && <Check size={16} className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden />}
                    </label>
                  );
                })}
              </div>
            )}
            <label className="flex items-center gap-2 text-small text-text">
              <input type="checkbox" checked={includePrompt} onChange={(event) => setIncludePrompt(event.target.checked)} className="accent-primary" />
              <SquareTerminal size={15} className="text-primary" aria-hidden />
              {t("spaces.add.promptCard")}
            </label>
            <p className="text-caption text-text-muted">{t("spaces.add.referenceNote")}</p>
          </fieldset>
        )}

        <div className="space-y-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("spaces.add.search")} aria-label={t("spaces.add.search")} className={cn(fieldInputClassName, "h-10 pl-9")} />
          </div>
          {spaces === null ? (
            <Loader2 size={18} className="animate-spin text-text-muted" aria-label={t("common.loading")} />
          ) : spaces.length === 0 ? (
            <p className="text-small text-text-muted">{t("spaces.add.noSpaces")}</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain pr-1" role="listbox" aria-label={t("spaces.add.choose")}>
              {visibleSpaces.map((space) => {
                const already = existing.has(space.id);
                const cover = summaryCover(space);
                return (
                  <li key={space.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected === space.id}
                      onClick={() => setSelected(space.id)}
                      data-add-space={space.title}
                      className={cn("flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors", selected === space.id ? "border-primary bg-primary-soft/50" : "border-border-soft hover:bg-surface-soft")}
                    >
                      <SpaceCoverArt urls={cover ? [cover] : space.previewUrls} className="h-11 w-11 shrink-0 overflow-hidden rounded-md" iconSize={18} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-text">{space.title}</span>
                        <span className="flex items-center gap-1 text-caption text-text-muted">
                          <ImageIcon size={12} aria-hidden />
                          {space.imageCount} · {t(SPACE_KIND_LABEL[space.kind])}
                        </span>
                      </span>
                      {already && <span className="shrink-0 rounded-full bg-warning/12 px-2 py-0.5 text-caption font-medium text-warning">{t("spaces.add.already")}</span>}
                      {selected === space.id && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {creating ? (
          <form onSubmit={createAndAdd} className="flex gap-2">
            <label htmlFor={newId} className="sr-only">
              {t("spaces.form.title")}
            </label>
            <input id={newId} value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder={t("spaces.form.titlePlaceholder")} className={cn(fieldInputClassName, "h-10")} autoFocus />
            <Button type="submit" disabled={busy || !newName.trim()}>
              {t("spaces.add.createAndAdd")}
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-small font-medium text-text hover:bg-surface-soft">
            <Plus size={15} aria-hidden />
            {t("spaces.add.newSpace")}
          </button>
        )}

        {selected && existing.has(selected) && <p className="text-caption text-warning">{t("spaces.add.duplicateWarning")}</p>}
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-border-soft pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => selected && void add(selected, spaces?.find((space) => space.id === selected)?.title ?? "")} disabled={busy || !selected || (target.type === "prompt" && !prompt)} data-testid="add-to-space-submit">
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t("spaces.add.submit")}
          </Button>
        </div>
      </div>
    </SpaceDialog>
  );
}
