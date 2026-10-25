"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, House, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { absoluteUrl, cn, formatRelativeTime } from "@/lib/utils";
import {
  createSpace,
  createSpaceLink,
  deleteSpace,
  fetchSpaceItems,
  fetchSpaceLinkStatus,
  revokeSpaceLink,
  updateSpace,
  uploadSpaceImage,
  type Space,
  type SpaceItem,
  setSpaceShared,
} from "@/lib/supabase/spaces";
import { SPACE_TEMPLATE_GROUPS, spaceHref, spaceLinkHref, type SpaceKind, type SpaceVisibility } from "@/lib/spaces";
import { useKeyboardViewport } from "@/lib/use-keyboard-viewport";
import { CoverPicker, DescriptionField, FormError, KindField, SubmitButton, TemplateField, TitleField, VisibilityField } from "./space-forms";
import { SpaceImage } from "./space-visuals";

/** Ortak pencere gövdesi: başlık + ✕ + içerik (mobilde alttan açılan sayfa, masaüstünde ortalanmış). */
export function SpaceDialog({ title, onClose, children, wide, busy, overLayers }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; busy?: boolean; overLayers?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  // Klavye açıkken pencere, klavyenin üstündeki görünür alana sığar (iOS Safari: yoksa başlık ekranın dışında kalır).
  const keyboard = useKeyboardViewport();
  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy={id} overLayers={overLayers}>
      <div
        style={keyboard ? { maxHeight: Math.max(240, keyboard.height - 12) } : undefined}
        className={cn("flex max-h-[92dvh] w-full flex-col rounded-lg border border-border bg-surface shadow-lg", wide ? "max-w-xl" : "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-5 py-3.5">
          <h2 id={id} className="text-h3 font-semibold text-text">
            {title}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("common.close")} className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </Modal>
  );
}

/**
 * Yeni Space: ad (zorunlu), açıklama, tür, görünürlük (varsayılan Özel), başlangıç şablonu, kapak. Başarıda Space'in sayfasına
 * gider. Kapak yüklenemezse Space yine oluşmuştur: pencere bunu söyler ve Space'e geçmeyi önerir (sessizce yutulmaz).
 */
export function CreateSpaceModal({ onClose, onCreated, initialKind }: { onClose: () => void; onCreated?: (id: string) => void; initialKind?: SpaceKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SpaceKind>(initialKind ?? "moodboard");
  const [visibility, setVisibility] = useState<SpaceVisibility>("private");
  const [template, setTemplate] = useState<"empty" | "template">("template");
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdWithoutCover, setCreatedWithoutCover] = useState<string | null>(null);

  function finish(id: string) {
    if (onCreated) onCreated(id);
    else router.push(spaceHref(id));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaces.error.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    let id: string;
    try {
      id = await createSpace({
        title,
        description,
        kind,
        visibility,
        groups: template === "template" ? SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)) : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
      return;
    }
    if (cover) {
      try {
        const { url } = await uploadSpaceImage(id, cover);
        await updateSpace(id, { coverUrl: url });
      } catch {
        setBusy(false);
        setCreatedWithoutCover(id);
        return;
      }
    }
    finish(id);
  }

  if (createdWithoutCover) {
    return (
      <SpaceDialog title={t("spaces.create.title")} onClose={() => finish(createdWithoutCover)}>
        <div className="space-y-4">
          <p role="alert" className="rounded-md bg-warning/12 px-3 py-2 text-small text-text">
            {t("spaces.create.coverFailed")}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => finish(createdWithoutCover)}>
              {t("spaces.create.openSpace")}
            </Button>
          </div>
        </div>
      </SpaceDialog>
    );
  }

  return (
    <SpaceDialog title={t("spaces.create.title")} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4" data-testid="create-space-form" noValidate>
        <TitleField value={title} onChange={setTitle} autoFocus />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} />
        <TemplateField kind={kind} value={template} onChange={setTemplate} />
        <VisibilityField value={visibility} onChange={setVisibility} />
        <CoverPicker file={cover} onChange={setCover} />
        <FormError message={error} />
        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border-soft bg-surface px-5 pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{busy ? t("spaces.create.creating") : t("spaces.create.submit")}</SubmitButton>
        </div>
      </form>
    </SpaceDialog>
  );
}

/**
 * Space ayarları (yalnız sahip): ad, açıklama, tür, kapak (yükle / Space'teki bir görseli seç / kaldır). Görünürlük paylaşım
 * penceresindedir. Kaydetme gerçekten güncellenen satırı döner; hata pencerede kalır.
 */
export function SpaceSettingsModal({
  space,
  images,
  onClose,
  onSaved,
}: {
  space: Space;
  /** Kapak seçimi için Space'in görselleri; verilmezse pencere kendisi yükler (kart menüsünden açılınca). */
  images?: SpaceItem[];
  onClose: () => void;
  onSaved: (space: Space) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(space.title);
  const [description, setDescription] = useState(space.description);
  const [kind, setKind] = useState<SpaceKind>(space.kind);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverItemId, setCoverItemId] = useState<string | null>(space.coverItemId);
  const [removeUpload, setRemoveUpload] = useState(false);
  const [loadedImages, setLoadedImages] = useState<SpaceItem[] | null>(images ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (images) return;
    let alive = true;
    fetchSpaceItems(space.id)
      .then((list) => alive && setLoadedImages(list.filter((item) => item.kind === "image")))
      .catch(() => alive && setLoadedImages([]));
    return () => {
      alive = false;
    };
  }, [images, space.id]);

  const imageItems = (images ?? loadedImages ?? []).filter((item) => item.kind === "image").slice(0, 24);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaces.error.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Yüklenen kapak, seçilen görselden önce gelir: yeni bir görsel SEÇEN kullanıcı yüklenmiş kapağı bırakmak istiyor demektir.
      let coverUrl: string | null | undefined;
      if (coverFile) coverUrl = (await uploadSpaceImage(space.id, coverFile)).url;
      else if (removeUpload || (coverItemId !== space.coverItemId && coverItemId !== null && space.coverUrl)) coverUrl = null;
      const saved = await updateSpace(space.id, {
        title,
        description,
        kind,
        coverItemId,
        ...(coverUrl !== undefined ? { coverUrl } : {}),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  return (
    <SpaceDialog title={t("spaces.settings.title")} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4" data-testid="space-settings-form" noValidate>
        <TitleField value={title} onChange={setTitle} />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} />
        <CoverPicker
          file={coverFile}
          onChange={(file) => {
            setCoverFile(file);
            if (file) setRemoveUpload(false);
          }}
        />
        {space.coverUrl && !coverFile && (
          <label className="flex items-center gap-2 text-small text-text-secondary">
            <input type="checkbox" checked={removeUpload} onChange={(event) => setRemoveUpload(event.target.checked)} className="accent-primary" />
            {t("spaces.settings.removeUploadedCover")}
          </label>
        )}
        <div>
          <p className="mb-1.5 text-label font-medium text-text">{t("spaces.settings.coverFromImages")}</p>
          {loadedImages === null && !images ? (
            <Loader2 size={16} className="animate-spin text-text-muted" aria-label={t("common.loading")} />
          ) : imageItems.length === 0 ? (
            <p className="text-caption text-text-muted">{t("spaces.settings.noImages")}</p>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              <button
                type="button"
                onClick={() => setCoverItemId(null)}
                aria-pressed={coverItemId === null}
                className={cn("flex aspect-square items-center justify-center rounded-md border text-caption text-text-muted", coverItemId === null ? "border-primary ring-2 ring-primary/30" : "border-border-soft")}
              >
                {t("spaces.settings.coverAuto")}
              </button>
              {imageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCoverItemId(item.id)}
                  aria-pressed={coverItemId === item.id}
                  aria-label={item.title || t("spaces.images.untitled")}
                  className={cn("relative aspect-square overflow-hidden rounded-md border", coverItemId === item.id ? "border-primary ring-2 ring-primary/30" : "border-border-soft")}
                >
                  <SpaceImage url={item.mediaUrl} alt="" className="absolute inset-0" />
                  {coverItemId === item.id && <Check size={16} className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </div>
        <FormError message={error} />
        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border-soft bg-surface px-5 pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </div>
      </form>
    </SpaceDialog>
  );
}

/**
 * Paylaşım: görünürlük (neyin yayımlanacağı açıkça yazılır) + "bağlantıya sahip olanlar" için bağlantı yönetimi. Bağlantının
 * kendisi yalnız oluşturulduğu anda gösterilir (sunucu yalnız özetini saklar); kaybolursa yenisi oluşturulur ve eskisi iptal olur.
 */
/**
 * Space paylaşım ayarları (sahip): "Kim görsün?" (Özel · Bağlantıya sahip olanlar · Herkese açık), bağlantı yönetimi ve — herkese açık
 * Space'te — "Akışta gönderi olarak paylaş" (docs/history/215-*: açık onay, varsayılan kapalı; sunucu kuralı `set_space_shared`).
 * Birleşik Paylaş penceresinin (`ShareModal`) Space bölümüdür; tek başına `ShareSpaceModal` içinde de kullanılır.
 */
export function SpaceShareSettings({ space, onChanged }: { space: Space; onChanged: (space: Space) => void }) {
  const { t, language } = useTranslation();
  const [visibility, setVisibility] = useState<SpaceVisibility>(space.visibility);
  const [current, setCurrent] = useState(space);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ createdAt: string; openedCount: number } | null | undefined>(undefined);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (current.visibility !== "link") return;
    let alive = true;
    fetchSpaceLinkStatus(current.id)
      .then((status) => alive && setLink(status))
      .catch(() => alive && setLink(null));
    return () => {
      alive = false;
    };
  }, [current.id, current.visibility]);

  async function applyVisibility(next: SpaceVisibility) {
    setVisibility(next);
    if (next === current.visibility) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await updateSpace(current.id, { visibility: next });
      setCurrent(saved);
      onChanged(saved);
      setFreshUrl(null);
      setLink(next === "link" ? null : undefined);
    } catch (err) {
      setVisibility(current.visibility);
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function makeLink() {
    setBusy(true);
    setError(null);
    try {
      const created = await createSpaceLink(current.id);
      setFreshUrl(absoluteUrl(spaceLinkHref(created.token)));
      setLink({ createdAt: created.createdAt, openedCount: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await revokeSpaceLink(current.id);
      setFreshUrl(null);
      setLink(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("spaces.share.copyFailed"));
    }
  }

  async function toggleFeed(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const sharedAt = await setSpaceShared(current.id, next);
      const saved = { ...current, sharedAt };
      setCurrent(saved);
      onChanged(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const publicUrl = absoluteUrl(spaceHref(current.id));
  const canFeed = current.visibility === "public" && !current.archivedAt;

  return (
      <div className="space-y-4" data-testid="share-space-modal">
        <VisibilityField value={visibility} onChange={(next) => void applyVisibility(next)} name="share-visibility" />
        <p className="rounded-md bg-surface-soft px-3 py-2 text-caption text-text-secondary">{t("spaces.share.neverPublished")}</p>

        {canFeed && (
          <label
            data-space-feed-toggle={current.sharedAt ? "on" : "off"}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-soft bg-background px-3 py-2.5 has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-soft text-text-secondary">
              <House size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-semibold text-text">{t("spaces.feed.toggle")}</span>
              <span className="block text-caption text-text-muted">{current.sharedAt ? t("spaces.feed.toggleOnHint") : t("spaces.feed.toggleHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(current.sharedAt)}
              disabled={busy}
              onChange={(event) => void toggleFeed(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-primary"
            />
          </label>
        )}

        {current.visibility === "public" && (
          <div className="flex items-center gap-2">
            <input readOnly value={publicUrl} aria-label={t("spaces.share.publicUrl")} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-small text-text" />
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(publicUrl)}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? t("common.copied") : t("common.copyLink")}
            </Button>
          </div>
        )}

        {current.visibility === "link" && (
          <div className="space-y-3 rounded-lg border border-border-soft p-3" data-testid="space-link-panel">
            {freshUrl ? (
              <>
                <p className="text-small font-medium text-text">{t("spaces.share.linkReady")}</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={freshUrl} aria-label={t("spaces.share.linkLabel")} data-testid="space-link-url" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-small text-text" />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copy(freshUrl)}>
                    {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
                <p className="text-caption text-text-muted">{t("spaces.share.linkOnce")}</p>
              </>
            ) : link === undefined ? (
              <Loader2 size={16} className="animate-spin text-text-muted" aria-label={t("common.loading")} />
            ) : link ? (
              <p className="text-small text-text-secondary">
                {t("spaces.share.linkActive", { time: formatRelativeTime(link.createdAt, language), count: link.openedCount })}
              </p>
            ) : (
              <p className="text-small text-text-secondary">{t("spaces.share.noLink")}</p>
            )}
            <p className="text-caption text-text-muted">{t("spaces.share.linkRules")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void makeLink()} disabled={busy}>
                <Link2 size={14} aria-hidden />
                {link ? t("spaces.share.newLink") : t("spaces.share.createLink")}
              </Button>
              {link && (
                <Button type="button" variant="outline" size="sm" onClick={() => void revoke()} disabled={busy}>
                  {t("spaces.share.revokeLink")}
                </Button>
              )}
            </div>
          </div>
        )}
        <FormError message={error} />
      </div>
  );
}

/** Tek başına Space paylaşım penceresi (ayarlar bölümü + çerçeve). Birleşik Paylaş penceresi aynı bölümü kullanır. */
export function ShareSpaceModal({ space, onClose, onChanged }: { space: Space; onClose: () => void; onChanged: (space: Space) => void }) {
  const { t } = useTranslation();
  return (
    <SpaceDialog title={t("spaces.share.title")} onClose={onClose}>
      <SpaceShareSettings space={space} onChanged={onChanged} />
    </SpaceDialog>
  );
}

/** Silme onayı: geri alınamaz; Promptly gönderilerine dokunulmadığını söyler. */
export function DeleteSpaceDialog({ space, onClose, onDeleted }: { space: Pick<Space, "id" | "title">; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      id="delete-space"
      title={t("spaces.delete.title")}
      body={t("spaces.delete.body", { title: space.title })}
      confirmLabel={t("spaces.delete.confirm")}
      danger
      busy={busy}
      error={error}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await deleteSpace(space.id);
          onDeleted();
        } catch (err) {
          setError(err instanceof Error ? err.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
    />
  );
}
