"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageOff, ImagePlus, Loader2, Paperclip, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { CompactContentCard, ATTACHMENT_ICONS } from "@/features/content/compact-content-card";
import { LIBRARY_TYPES } from "@/features/messages/chat-attach";
import { GifPicker } from "@/features/gif/gif-picker";
import { LoadMore } from "@/features/feed/load-more";
import { useGrowingList } from "@/features/content/use-growing-list";
import { useShareableContent } from "@/features/communities/use-shareable-content";
import { getCachedCommentMediaUrl, removeCommentPhotos, resolveCommentMediaUrls, uploadCommentPhoto } from "@/lib/supabase/comment-media";
import { fetchSavedPickableWindow, SAVED_SOURCE_TYPES, type PickableContent } from "@/lib/supabase/comment-attachments";
import { ALLOWED_IMAGE_MIME, MessageImageError, prepareMessageImage, sniffImageMime, type PreparedMessageImage } from "@/lib/supabase/message-images";
import type { CommunityPostType } from "@/lib/supabase/communities";
import { giphyUrl, type GifItem } from "@/lib/giphy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { translateForRuntime } from "@/lib/i18n/translations";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CommentAttachmentType, CommentMedia } from "@/types";
import type { CommentExtras } from "@/lib/supabase/comments";

/** Yazma çubuğundaki seçili ek içerik (henüz gönderilmedi): başlığı yalnız önizleme içindir, veritabanına yazılmaz. */
export interface AttachmentDraft {
  type: CommentAttachmentType;
  id: string;
  title: string;
}

/** Yazma çubuğundaki seçili görsel: fotoğraf gönderilene kadar yalnız tarayıcıdadır (yükleme gönderimde), GIF yalnız GIPHY kimliğidir. */
export type MediaDraft =
  | { kind: "gif"; gif: GifItem }
  | { kind: "photo"; key: string; previewUrl: string; prepared: PreparedMessageImage | null };

/**
 * Bir yorum yazma alanının (ana kutu ya da yanıt kutusu) ekleri (docs/history/307-*): en çok BİR görsel (fotoğraf ya da GIF — biri diğerinin
 * yerine geçer) ve BİR içerik eki. Seçmek hiçbir şey göndermez: fotoğraf "Gönder"e basılınca yüklenir (kaldırılan taslak depoda dosya bırakmaz),
 * gönderim başarısız olursa yüklenen dosya geri silinir. Fotoğraf mesajlardakiyle AYNI kuraldan geçer (gerçek tür, boyut, küçültme).
 */
export function useCommentExtras() {
  const [media, setMedia] = useState<MediaDraft | null>(null);
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mediaRef = useRef<MediaDraft | null>(null);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  const discardMedia = useCallback(() => {
    const current = mediaRef.current;
    if (current?.kind === "photo") URL.revokeObjectURL(current.previewUrl);
    mediaRef.current = null;
  }, []);

  // Pencere/sayfa kalkarken tutulan önizleme adresi serbest bırakılır.
  useEffect(() => discardMedia, [discardMedia]);

  const addPhoto = useCallback(
    async (file: File) => {
      setNotice(null);
      const mime = await sniffImageMime(file);
      if (!mime) {
        setNotice(translateForRuntime("messages.imageTypeNotAllowed"));
        return;
      }
      discardMedia();
      const key = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const draft: MediaDraft = { kind: "photo", key, previewUrl, prepared: null };
      mediaRef.current = draft;
      setMedia(draft);
      try {
        const prepared = await prepareMessageImage(file);
        setMedia((prev) => {
          if (prev?.kind !== "photo" || prev.key !== key) return prev;
          const next: MediaDraft = { ...prev, prepared };
          mediaRef.current = next;
          return next;
        });
      } catch (err) {
        setNotice(err instanceof MessageImageError ? err.message : translateForRuntime("image.processFailed"));
        setMedia((prev) => {
          if (prev?.kind !== "photo" || prev.key !== key) return prev;
          URL.revokeObjectURL(previewUrl);
          mediaRef.current = null;
          return null;
        });
      }
    },
    [discardMedia],
  );

  const pickGif = useCallback(
    (gif: GifItem) => {
      setNotice(null);
      discardMedia();
      const draft: MediaDraft = { kind: "gif", gif };
      mediaRef.current = draft;
      setMedia(draft);
    },
    [discardMedia],
  );

  const removeMedia = useCallback(() => {
    discardMedia();
    setMedia(null);
    setNotice(null);
  }, [discardMedia]);

  const pickContent = useCallback((item: PickableContent) => {
    setNotice(null);
    setAttachment({ type: item.type, id: item.id, title: item.title });
  }, []);
  const removeAttachment = useCallback(() => setAttachment(null), []);

  const clear = useCallback(() => {
    discardMedia();
    setMedia(null);
    setAttachment(null);
    setNotice(null);
  }, [discardMedia]);

  /**
   * Gönderim için ekleri hazırlar: fotoğraf burada yüklenir. `uploadedPath` doluysa çağıran, yorum yazılamazsa `discardUpload` ile dosyayı geri siler.
   * Fotoğraf hâlâ hazırlanıyorsa fırlatır (düğme bu durumda zaten kapalıdır).
   */
  async function prepare(userId: string): Promise<{ extras: CommentExtras; uploadedPath: string | null }> {
    const extras: CommentExtras = {};
    let uploadedPath: string | null = null;
    if (media?.kind === "photo") {
      if (!media.prepared) throw new Error(translateForRuntime("commentExtras.preparing"));
      const uploaded = await uploadCommentPhoto(userId, media.prepared);
      extras.media = uploaded;
      uploadedPath = uploaded.path;
    } else if (media?.kind === "gif") {
      extras.media = { kind: "gif", gifId: media.gif.id, width: media.gif.width, height: media.gif.height };
    }
    if (attachment) extras.attachment = { type: attachment.type, id: attachment.id };
    return { extras, uploadedPath };
  }

  const isPreparing = media?.kind === "photo" && !media.prepared;
  return {
    media,
    attachment,
    notice,
    hasExtras: media !== null || attachment !== null,
    isPreparing,
    addPhoto,
    pickGif,
    pickContent,
    removeMedia,
    removeAttachment,
    clear,
    prepare,
    discardUpload: (path: string | null) => (path ? removeCommentPhotos([path]) : Promise.resolve()),
    dismissNotice: () => setNotice(null),
  };
}

export type CommentExtrasController = ReturnType<typeof useCommentExtras>;

const TOOL_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50";
const TOOL_ON = "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary";

/** Fotoğraf · GIF · İçerik düğmeleri (yazma çubuğunun yanında ya da altında). Seçici pencereler burada açılır. */
export function CommentExtrasToolbar({ extras, userId, disabled = false, className }: { extras: CommentExtrasController; userId: string; disabled?: boolean; className?: string }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  return (
    <div className={cn("flex items-center gap-0.5", className)} data-comment-extras-toolbar>
      <input
        ref={fileRef}
        type="file"
        accept={ALLOWED_IMAGE_MIME.join(",")}
        hidden
        data-comment-photo-input
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void extras.addPhoto(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        aria-label={t("commentExtras.addPhoto")}
        aria-pressed={extras.media?.kind === "photo"}
        title={t("commentExtras.addPhoto")}
        data-comment-extra="photo"
        className={cn(TOOL_BUTTON, extras.media?.kind === "photo" && TOOL_ON)}
      >
        <ImagePlus size={20} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setGifOpen(true)}
        aria-label={t("commentExtras.addGif")}
        aria-pressed={extras.media?.kind === "gif"}
        title={t("commentExtras.addGif")}
        aria-haspopup="dialog"
        data-comment-extra="gif"
        className={cn(TOOL_BUTTON, extras.media?.kind === "gif" && TOOL_ON)}
      >
        <span aria-hidden className="rounded-[5px] border-[1.75px] border-current px-[3px] py-[2px] text-[9px] font-extrabold leading-none tracking-[0.04em]">
          {t("gif.badge")}
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setContentOpen(true)}
        aria-label={t("commentExtras.addContent")}
        aria-pressed={extras.attachment !== null}
        title={t("commentExtras.addContent")}
        aria-haspopup="dialog"
        data-comment-extra="content"
        className={cn(TOOL_BUTTON, extras.attachment && TOOL_ON)}
      >
        <Paperclip size={20} strokeWidth={1.75} aria-hidden />
      </button>
      {gifOpen && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onPick={(gif) => {
            setGifOpen(false);
            extras.pickGif(gif);
          }}
        />
      )}
      {contentOpen && (
        <CommentContentPicker
          userId={userId}
          onClose={() => setContentOpen(false)}
          onPick={(item) => {
            setContentOpen(false);
            extras.pickContent(item);
          }}
        />
      )}
    </div>
  );
}

const REMOVE_BUTTON =
  "absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-text text-background shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Seçili ekler: görsel önizlemesi + küçük içerik kartı (her birinde ✕), ipucu ve varsa hata. Hiç ek yoksa hiçbir şey çizmez. */
export function CommentExtrasPreview({ extras, showHint = true }: { extras: CommentExtrasController; showHint?: boolean }) {
  const { t } = useTranslation();
  const { media, attachment, notice } = extras;
  if (!media && !attachment && !notice) return null;
  return (
    <div className="space-y-2" data-comment-extras>
      {(media || attachment) && (
        <div className="flex flex-wrap items-start gap-3">
          {media && (
            <div className="relative shrink-0" data-comment-extra-preview={media.kind}>
              {media.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi
                <img src={media.previewUrl} alt={t("commentExtras.photoAlt")} className="h-20 w-20 rounded-xl object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- GIPHY'nin kendi adresi
                <img src={media.gif.previewUrl} alt={media.gif.title || t("commentExtras.gifAlt")} className="h-20 w-auto max-w-40 rounded-xl object-cover" style={{ aspectRatio: `${media.gif.width} / ${media.gif.height}` }} />
              )}
              {media.kind === "photo" && !media.prepared && (
                <span role="status" aria-label={t("commentExtras.preparing")} className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                  <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
                </span>
              )}
              <button type="button" onClick={extras.removeMedia} aria-label={t(media.kind === "photo" ? "commentExtras.removePhoto" : "commentExtras.removeGif")} data-comment-extra-remove="media" className={REMOVE_BUTTON}>
                <X size={14} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          )}
          {attachment && (
            <div className="min-w-0 flex-1 basis-56">
              <CompactContentCard
                attachment={{ type: attachment.type, id: attachment.id }}
                state={{ status: "ready", card: { type: attachment.type, id: attachment.id, title: attachment.title, ownerName: null, thumbnailUrl: null } }}
                onRemove={extras.removeAttachment}
              />
            </div>
          )}
        </div>
      )}
      {notice && (
        <p role="alert" className="text-caption text-danger">
          {notice}
        </p>
      )}
      {showHint && (media || attachment) && <p className="text-caption text-text-muted">{t("commentExtras.hint")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Kayıtlı yorumun medyası
// ---------------------------------------------------------------------------------------------

/** Fotoğrafın imzalı adresi: önbellekteyse hemen, değilse tek toplu çözümleme; çözülemezse `failed`. */
function useCommentPhotoUrl(path: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean } | null>(() => {
    const hit = getCachedCommentMediaUrl(path);
    return hit ? { path, url: hit, failed: false } : null;
  });
  useEffect(() => {
    if (getCachedCommentMediaUrl(path)) return;
    let alive = true;
    resolveCommentMediaUrls([path]).then((resolved) => {
      if (alive) setState({ path, url: resolved.get(path) ?? null, failed: !resolved.has(path) });
    });
    return () => {
      alive = false;
    };
  }, [path]);
  const current = state?.path === path ? state : null;
  return { url: current?.url ?? getCachedCommentMediaUrl(path), failed: current?.failed ?? false };
}

/** Görselin yerleşimi: ölçü biliniyorsa yer ayrılır (liste kaymaz), çok dar/uzun görseller sınırlanır. */
function ratioStyle(width: number | null, height: number | null): React.CSSProperties {
  const ratio = width && height ? Math.min(Math.max(width / height, 0.6), 1.8) : 4 / 3;
  return { aspectRatio: String(ratio) };
}

/** Yorumun kayıtlı görseli: GIF (GIPHY adresi, "hareketi azalt"ta ilk kare) ya da fotoğraf (imzalı adres, dokununca büyür). */
export function CommentMediaView({ media, className }: { media: CommentMedia; className?: string }) {
  if (media.kind === "gif") return <CommentGif gifId={media.gifId} width={media.width} height={media.height} className={className} />;
  return <CommentPhoto path={media.path} width={media.width} height={media.height} className={className} />;
}

function CommentGif({ gifId, width, height, className }: { gifId: string; width: number | null; height: number | null; className?: string }) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);
  const src = giphyUrl(gifId, reduced ? "still" : "fixed");
  if (!src) return null;
  return (
    <span className={cn("relative block w-[min(15rem,100%)] overflow-hidden rounded-xl bg-surface-soft", className)} style={ratioStyle(width, height)} data-comment-media="gif">
      {failed ? (
        <span className="flex h-full w-full items-center justify-center text-text-muted" role="img" aria-label={t("commentExtras.mediaFailed")}>
          <ImageOff size={20} aria-hidden />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- GIPHY'nin kendi adresi; dış hareketli görsel
        <img src={src} alt={t("commentExtras.gifAlt")} loading="lazy" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
      <span aria-hidden className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em] text-white">
        {t("gif.badge")}
      </span>
    </span>
  );
}

function CommentPhoto({ path, width, height, className }: { path: string; width: number | null; height: number | null; className?: string }) {
  const { t } = useTranslation();
  const { url, failed } = useCommentPhotoUrl(path);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => url && !broken && setOpen(true)}
        aria-label={t("commentExtras.photoAlt")}
        data-comment-media="photo"
        style={ratioStyle(width, height)}
        className={cn("relative block w-[min(17rem,100%)] overflow-hidden rounded-xl bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", className)}
      >
        {url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- imzalı Storage adresi
          <img src={url} alt={t("commentExtras.photoAlt")} loading="lazy" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-text-muted">
            {failed || broken ? <ImageOff size={20} aria-hidden /> : <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          </span>
        )}
      </button>
      {open && url && <ImageLightbox images={[{ url, alt: t("commentExtras.photoAlt") }]} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// İçerik seçici
// ---------------------------------------------------------------------------------------------

type Source = "mine" | "saved";

/**
 * Yoruma içerik ekle: tür sekmeleri · "Benimkiler / Kaydettiklerim" · başlık araması · tek seçim. Yalnız yayında + herkese açık + topluluğa özgü olmayan
 * içerik listelenir (yorumu okuyan herkes görebilsin; sunucu da aynı kuralı denetler). İstek ve Space kaydedilemediği için o türlerde yalnız "Benimkiler" var.
 */
export function CommentContentPicker({ userId, onPick, onClose }: { userId: string; onPick: (item: PickableContent) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<CommunityPostType>("prompt");
  const [source, setSource] = useState<Source>("mine");
  const canSave = SAVED_SOURCE_TYPES.includes(type);
  const activeSource: Source = canSave ? source : "mine";
  const [selected, setSelected] = useState<PickableContent | null>(null);

  const mine = useShareableContent(userId, type);
  const [savedSearch, setSavedSearch] = useState("");
  const [savedDebounced, setSavedDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSavedDebounced(savedSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [savedSearch]);
  const saved = useGrowingList<PickableContent>(
    `${userId}|${type}|${savedDebounced}|${activeSource === "saved"}`,
    async (limit) => (activeSource === "saved" && canSave ? fetchSavedPickableWindow(userId, type as "prompt" | "workflow" | "preset", { search: savedDebounced, limit }) : { items: [], hasMore: false }),
    30,
  );

  const search = activeSource === "mine" ? mine.search : savedSearch;
  const setSearch = activeSource === "mine" ? mine.setSearch : setSavedSearch;
  const list = activeSource === "mine" ? mine.list : saved;
  const items: PickableContent[] | null = list.items === null ? null : list.items.map((item) => ({ id: item.id, type: item.type, title: item.title }));
  const loadError = list.failed && items !== null && items.length === 0;
  const Icon = ATTACHMENT_ICONS[type];

  function changeType(next: CommunityPostType) {
    setType(next);
    setSelected(null);
    mine.setSearch("");
    setSavedSearch("");
  }
  function changeSource(next: Source) {
    setSource(next);
    setSelected(null);
  }

  return (
    <Modal onClose={onClose} labelledBy="comment-content-title">
      <div data-comment-content-picker className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 id="comment-content-title" className="font-display text-h3 font-bold text-text">
            {t("commentExtras.picker.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="shrink-0 space-y-2.5 px-5 pb-2 pt-2">
          <Tabs variant="segmented" ariaLabel={t("communities.feed.typeAria")} active={type} onChange={changeType} items={LIBRARY_TYPES.map(({ type: value }) => ({ key: value, label: t(`communities.feed.type.${value}`) }))} />
          {canSave && (
            <Tabs
              variant="underline"
              ariaLabel={t("commentExtras.picker.sourceAria")}
              active={activeSource}
              onChange={changeSource}
              items={[
                { key: "mine", label: t("commentExtras.picker.mine") },
                { key: "saved", label: t("commentExtras.picker.saved") },
              ]}
            />
          )}
          <label className="relative block">
            <span className="sr-only">{t("communities.feed.pickSearch")}</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("communities.feed.pickSearch")} className={cn(fieldControlClassName, "h-11 pl-10")} />
          </label>
          <p className="text-caption text-text-muted">{t("commentExtras.picker.help")}</p>
        </div>
        <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 pb-2">
          {loadError ? (
            <p role="alert" className="px-3 py-6 text-center text-small text-danger">
              {t("communities.feed.pickLoadError")}
            </p>
          ) : items === null || list.loading ? (
            <div className="mx-3 mt-2 h-20 animate-pulse rounded-lg bg-surface-soft" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="mx-3 mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">
              {activeSource === "saved" ? t("commentExtras.picker.savedEmpty") : t("communities.feed.pickEmpty")}
            </p>
          ) : (
            <ul role="radiogroup" aria-label={t("communities.feed.pickAria")}>
              {items.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-comment-content-item={item.id}
                      onClick={() => setSelected(item)}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isSelected ? "bg-primary-soft" : "hover:bg-surface-soft",
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <Icon size={22} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-text">{item.title || t("communities.feed.untitled")}</span>
                        <span className="block truncate text-small text-text-muted">{t(`communities.feed.type.${type}`)}</span>
                      </span>
                      <span aria-hidden className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {items !== null && items.length > 0 && <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />}
        </div>
        <div data-dialog-footer className="flex shrink-0 gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="lg" className="flex-1" disabled={!selected} onClick={() => selected && onPick(selected)} data-comment-content-add>
            {selected ? t("commentExtras.picker.add") : t("commentExtras.picker.pickOne")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
