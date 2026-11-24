"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "@/components/icons/image-off";
import { ImagePlus } from "@/components/icons/image-plus";
import { Loader2 } from "@/components/icons/loader-2";
import { Paperclip } from "@/components/icons/paperclip";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { OptionRowGroup } from "@/components/ui/option-group";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { SearchField } from "@/components/ui/search-field";
import { SectionMenu } from "@/features/content/section-menu";
import { StorageImage } from "@/components/ui/storage-media";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Modal } from "@/components/ui/modal";
import { CompactContentCard, ATTACHMENT_ICONS, type AttachmentState } from "@/features/content/compact-content-card";
import { CHAT_LIBRARY_TYPES, useChatShareable, type ChatLibraryType } from "@/features/messages/chat-attach";
import { GifPicker } from "@/features/gif/gif-picker";
import { LoadMore } from "@/features/feed/load-more";
import { useGrowingList } from "@/features/content/use-growing-list";
import { SpaceCoverArt } from "@/features/spaces/space-visuals";
import { getCachedCommentMediaUrl, removeCommentPhotos, resolveCommentMediaUrls, uploadCommentPhoto } from "@/lib/supabase/comment-media";
import { attachmentKey, fetchAttachmentCards, fetchSavedPickableWindow, SAVED_SOURCE_TYPES, type AttachmentCard, type PickableContent } from "@/lib/supabase/comment-attachments";
import { ALLOWED_IMAGE_MIME, MessageImageError, prepareMessageImage, sniffImageMime, type PreparedMessageImage } from "@/lib/supabase/message-images";
import { giphyUrl, type GifItem } from "@/lib/giphy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { translateForRuntime } from "@/lib/i18n/runtime";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CommentAttachment, CommentAttachmentType, CommentMedia } from "@/types";
import type { CommentExtras } from "@/lib/supabase/comments";
import { DialogShell } from "@/components/ui/dialog-shell";
import { iconButtonClassName } from "@/components/ui/icon-button";

/** Yazma çubuğundaki seçili ek içerik (henüz gönderilmedi): başlığı yalnız önizleme içindir, veritabanına yazılmaz. */
export interface AttachmentDraft {
  type: CommentAttachmentType;
  id: string;
  title: string;
  /** Düzenlemede yorumda ZATEN olan ek: başlığı yoktur (kart durumu yorum listesinden gelir), değiştirilmeden bırakılırsa aynen korunur. */
  existing?: boolean;
}

/** Yazma çubuğundaki seçili görsel: fotoğraf gönderilene kadar yalnız tarayıcıdadır (yükleme gönderimde), GIF yalnız GIPHY kimliğidir. */
export type MediaDraft =
  | { kind: "gif"; gif: GifItem }
  | { kind: "photo"; key: string; previewUrl: string; prepared: PreparedMessageImage | null }
  /** Düzenlemede yorumda ZATEN olan görsel (fotoğraf yolu ya da GIF kimliği): yeniden yüklenmez, kaldırılabilir ya da başkasıyla değiştirilebilir. */
  | { kind: "existing"; media: CommentMedia };

/** Seçili görselin türü (düzenlemedeki mevcut görsel de kendi türüyle sayılır). */
export const draftMediaKind = (draft: MediaDraft | null): "photo" | "gif" | null => (draft === null ? null : draft.kind === "existing" ? draft.media.kind : draft.kind);

/**
 * Bir yorum yazma alanının (ana kutu ya da yanıt kutusu) ekleri (docs/history/308-*): en çok BİR görsel (fotoğraf ya da GIF — biri diğerinin
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

  /** Yorum düzenlemeye başlarken yorumun mevcut görseli/eki ile açılır (hiçbiri yoksa boş). */
  const load = useCallback(
    (existingMedia: CommentMedia | null, existingAttachment: CommentAttachment | null) => {
      discardMedia();
      const draft: MediaDraft | null = existingMedia ? { kind: "existing", media: existingMedia } : null;
      mediaRef.current = draft;
      setMedia(draft);
      setAttachment(existingAttachment ? { type: existingAttachment.type, id: existingAttachment.id, title: "", existing: true } : null);
      setNotice(null);
    },
    [discardMedia],
  );

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
    } else if (media?.kind === "existing") {
      extras.media = media.media;
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
    load,
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
        aria-pressed={draftMediaKind(extras.media) === "photo"}
        title={t("commentExtras.addPhoto")}
        data-comment-extra="photo"
        className={cn(TOOL_BUTTON, draftMediaKind(extras.media) === "photo" && TOOL_ON)}
      >
        <ImagePlus size={20} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setGifOpen(true)}
        aria-label={t("commentExtras.addGif")}
        aria-pressed={draftMediaKind(extras.media) === "gif"}
        title={t("commentExtras.addGif")}
        aria-haspopup="dialog"
        data-comment-extra="gif"
        className={cn(TOOL_BUTTON, draftMediaKind(extras.media) === "gif" && TOOL_ON)}
      >
        <span aria-hidden className="rounded-xs border-[1.75px] border-current px-[3px] py-[2px] text-caption font-semibold leading-none">
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
        <Paperclip size={20} aria-hidden />
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
export function CommentExtrasPreview({
  extras,
  showHint = true,
  attachmentState,
}: {
  extras: CommentExtrasController;
  showHint?: boolean;
  /** Düzenlemedeki MEVCUT ekin kartı için durum (başlığı yorum listesinden gelir); yoksa seçilen taslağın başlığı kullanılır. */
  attachmentState?: (attachment: CommentAttachment) => AttachmentState;
}) {
  const { t } = useTranslation();
  const { media, attachment, notice } = extras;
  if (!media && !attachment && !notice) return null;
  return (
    <div className="space-y-2" data-comment-extras>
      {(media || attachment) && (
        <div className="flex flex-wrap items-start gap-3">
          {media && (
            <div className="relative shrink-0" data-comment-extra-preview={draftMediaKind(media)}>
              {media.kind === "existing" ? (
                <CommentMediaView media={media.media} className="w-40" />
              ) : media.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi
                <img src={media.previewUrl} alt={t("commentExtras.photoAlt")} className="h-20 w-20 rounded-xl object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- GIPHY'nin kendi adresi
                <img src={media.gif.previewUrl} alt={media.gif.title || t("commentExtras.gifAlt")} className="h-20 w-auto max-w-40 rounded-xl object-cover" style={{ aspectRatio: `${media.gif.width} / ${media.gif.height}` }} />
              )}
              {media.kind === "photo" && !media.prepared && (
                <span role="status" aria-label={t("commentExtras.preparing")} className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                  <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden />
                </span>
              )}
              <button type="button" onClick={extras.removeMedia} aria-label={t(draftMediaKind(media) === "photo" ? "commentExtras.removePhoto" : "commentExtras.removeGif")} data-comment-extra-remove="media" className={REMOVE_BUTTON}>
                <X size={16} aria-hidden />
              </button>
            </div>
          )}
          {attachment && (
            <div className="min-w-0 flex-1 basis-56">
              <CompactContentCard
                attachment={{ type: attachment.type, id: attachment.id }}
                state={
                  attachment.existing && attachmentState
                    ? attachmentState({ type: attachment.type, id: attachment.id })
                    : { status: "ready", card: { type: attachment.type, id: attachment.id, title: attachment.title, ownerName: null, thumbnailUrl: null } }
                }
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
      <span aria-hidden className="absolute bottom-1.5 left-1.5 rounded-md bg-art-chip px-1.5 py-0.5 text-caption font-semibold text-on-art">
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
            {failed || broken ? <ImageOff size={20} aria-hidden /> : <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden />}
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

/** Seçici satırlarının küçük resimleri: görünen içerikler için TEK sorgu (`fetchAttachmentCards`), her kimlik bir kez sorulur; hata olursa tür simgesi kalır. */
function usePickerCards(items: PickableContent[] | null) {
  const [cards, setCards] = useState<Map<string, AttachmentCard>>(new Map());
  const asked = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = items === null ? "" : items.map(attachmentKey).join("|");
  useEffect(() => {
    if (!items) return;
    const todo = items.filter((item) => !asked.current.has(attachmentKey(item)));
    if (todo.length === 0) return;
    for (const item of todo) asked.current.add(attachmentKey(item));
    fetchAttachmentCards(todo.map(({ type, id }) => ({ type, id })))
      .then(({ cards: got }) => {
        if (!mounted.current || got.size === 0) return;
        setCards((prev) => new Map([...prev, ...got]));
      })
      .catch((err) => console.error("usePickerCards", err));
    // `key` kimlik listesinin özeti: `items` her çizimde yeni dizidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cards;
}

/** Satırın küçük resmi: prompt/istek/workflow/ayar paketi görseli, Space kapağı; yoksa tür simgesi. */
function PickerThumb({ item, card }: { item: PickableContent; card: AttachmentCard | undefined }) {
  const Icon = ATTACHMENT_ICONS[item.type];
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-soft text-primary">
      {item.type === "space" ? (
        <SpaceCoverArt urls={card?.thumbnailUrl ? [card.thumbnailUrl] : []} className="h-full w-full" iconSize={24} />
      ) : card?.thumbnailUrl ? (
        <StorageImage src={card.thumbnailUrl} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <Icon size={24} aria-hidden />
      )}
    </span>
  );
}

/**
 * Yoruma içerik ekle (docs/history/457-*, "Tek şerit"): tek satırda tür menüsü + arama, altında "Benimkiler / Kaydettiklerim", küçük resimli satırlar,
 * altbilgide Vazgeç + Ekle ve her zaman görünen yardım metni. Yalnız yayında + herkese açık + topluluğa özgü olmayan içerik listelenir (yorumu okuyan
 * herkes görebilsin; sunucu da aynı kuralı denetler). İstek ve Space kaydedilemediği için o türlerde yalnız "Benimkiler" var (kaynak anahtarı çizilmez).
 */
export function CommentContentPicker({ userId, onPick, onClose }: { userId: string; onPick: (item: PickableContent) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<ChatLibraryType>("prompt");
  const [source, setSource] = useState<Source>("mine");
  const canSave = SAVED_SOURCE_TYPES.includes(type);
  const activeSource: Source = canSave ? source : "mine";
  const [selected, setSelected] = useState<PickableContent | null>(null);

  const mine = useChatShareable(userId, type);
  const [savedSearch, setSavedSearch] = useState("");
  const [savedDebounced, setSavedDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSavedDebounced(savedSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [savedSearch]);
  const saved = useGrowingList<PickableContent>(
    `${userId}|${type}|${savedDebounced}|${activeSource === "saved"}`,
    async (limit) => (activeSource === "saved" && canSave ? fetchSavedPickableWindow(userId, type as "prompt" | "workflow" | "preset" | "skill", { search: savedDebounced, limit }) : { items: [], hasMore: false }),
    30,
  );

  const search = activeSource === "mine" ? mine.search : savedSearch;
  const setSearch = activeSource === "mine" ? mine.setSearch : setSavedSearch;
  const list = activeSource === "mine" ? mine.list : saved;
  const items: PickableContent[] | null = useMemo(() => (list.items === null ? null : list.items.map((item) => ({ id: item.id, type: item.type, title: item.title }))), [list.items]);
  const loadError = list.failed && items !== null && items.length === 0;
  const cards = usePickerCards(items);

  function changeType(next: ChatLibraryType) {
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
      <DialogShell data-comment-content-picker className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg card-flat shadow-pop">
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 id="comment-content-title" className="font-display text-h3 font-bold text-text">
            {t("commentExtras.picker.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-9 w-9")}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="shrink-0 space-y-3 px-5 pb-2 pt-2">
          <div className="flex items-center gap-2">
            <SectionMenu<ChatLibraryType>
              ariaLabel={t("communities.feed.typeAria")}
              title={t("communities.feed.typeAria")}
              active={type}
              onChange={changeType}
              items={CHAT_LIBRARY_TYPES.map(({ type: value, icon }) => ({ key: value, label: t(`communities.feed.type.${value}`), icon }))}
            />
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={t("communities.feed.pickSearch")}
              aria-label={t("communities.feed.pickSearch")}
              clearLabel={t("common.clear")}
              wrapperClassName="flex-1"
              data-comment-content-search=""
            />
          </div>
          {canSave && (
            <ChoiceGroup<Source>
              variant="segmented"
              ariaLabel={t("commentExtras.picker.sourceAria")}
              value={activeSource}
              onChange={changeSource}
              options={[
                { key: "mine", label: t("commentExtras.picker.mine"), attrs: { "data-comment-source": "mine" } },
                { key: "saved", label: t("commentExtras.picker.saved"), attrs: { "data-comment-source": "saved" } },
              ]}
            />
          )}
        </div>
        <div className="min-h-[8rem] flex-1 overflow-y-auto px-3 pb-2">
          {loadError ? (
            <p role="alert" className="px-3 py-6 text-center text-small text-danger">
              {t("communities.feed.pickLoadError")}
            </p>
          ) : items === null || list.loading ? (
            <div className="mx-2 mt-2 h-20 skeleton-shimmer rounded-lg" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="mx-2 mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">
              {activeSource === "saved" ? t("commentExtras.picker.savedEmpty") : t("communities.feed.pickEmpty")}
            </p>
          ) : (
            <OptionRowGroup<string>
              ariaLabel={t("communities.feed.pickAria")}
              value={selected?.id ?? null}
              onChange={(id) => {
                const item = items.find((entry) => entry.id === id);
                if (item) setSelected(item);
              }}
              options={items.map((item) => {
                const card = cards.get(attachmentKey(item));
                return {
                  key: item.id,
                  leading: <PickerThumb item={item} card={card} />,
                  label: item.title || t("communities.feed.untitled"),
                  description: card?.stepCount ? t("commentExtras.stepCount", { count: card.stepCount }) : activeSource === "saved" ? card?.ownerName : undefined,
                  attrs: { "data-comment-content-item": item.id },
                };
              })}
            />
          )}
          {items !== null && items.length > 0 && <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />}
        </div>
        <div data-dialog-footer className="shrink-0 space-y-2 border-t border-border-soft px-5 py-3">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" size="lg" className="flex-1" disabled={!selected} onClick={() => selected && onPick(selected)} data-comment-content-add>
              {selected ? t("commentExtras.picker.add") : t("commentExtras.picker.pickOne")}
            </Button>
          </div>
          <p className="text-center text-caption text-text-muted">{t("commentExtras.picker.help")}</p>
        </div>
      </DialogShell>
    </Modal>
  );
}
