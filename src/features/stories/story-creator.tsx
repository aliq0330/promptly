"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  BarChart3,
  Check,
  Clapperboard,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  Plus,
  RotateCcw,
  Save,
  SquareTerminal,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createStory,
  deleteDraft,
  fetchDrafts,
  fetchQuestionAnswer,
  fetchStoryById,
  prepareStoryMedia,
  saveDraft,
  uploadStoryMedia,
  type PreparedStoryMedia,
} from "@/lib/supabase/stories";
import {
  STORY_BACKGROUNDS,
  STORY_LIMITS,
  STORY_LINKED_TYPES,
  STORY_TEXT_COLORS,
  STORY_TEXT_SIZES,
  clampUnit,
  defaultTextColorFor,
  isStoryEmpty,
  newLayerId,
  validateSticker,
} from "@/lib/stories";
import { communityHref } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime, isUuid } from "@/lib/utils";
import type { StoryAudience, StoryDraft, StoryKind, StoryLayout, StoryLinkedType, StorySticker, StoryTextLayer } from "@/types";
import { STORY_BG_CLASS, STORY_SWATCH_CLASS, StoryCanvas, type CanvasElement } from "./story-canvas";
import { StoryAudiencePicker } from "./story-audience-picker";
import { StoryContentPicker } from "./story-content-picker";
import { useStoryViewer } from "./story-viewer-provider";

type Step = "choose" | "edit" | "preview";

interface MediaState {
  prepared: PreparedStoryMedia | null;
  /** Önizleme adresi: yerel `blob:` ya da (taslaktan) kimlik URL'si. */
  previewUrl: string;
  /** Yüklendiyse kimlik URL'si (yeniden yüklenmez). */
  uploadedUrl: string | null;
  /** Bu oturumda üretilen hedef yol: yeniden deneme aynı nesneye yazar (çift dosya yok). */
  path: string | null;
  mime: string;
  width: number;
  height: number;
  durationMs: number | null;
}

type Busy = { kind: "preparing" } | { kind: "uploading"; progress: number; purpose: "publish" | "draft" } | { kind: "publishing" } | { kind: "saving" };

const SIZE_LABEL: Record<(typeof STORY_TEXT_SIZES)[number], TranslationKey> = {
  s: "stories.editor.sizeS",
  m: "stories.editor.sizeM",
  l: "stories.editor.sizeL",
  xl: "stories.editor.sizeXl",
};

const AUDIENCE_STORAGE_KEY = "promptly-story-audience";

/**
 * Hikâye oluşturucu (docs/history/198-*): fotoğraf, kısa video, metin ve mevcut Promptly içeriği TEK düzenleyicide. Katmanlar
 * tuvalde sürüklenir (yalnız katmanın kendisi dokunmayı yakalar; sayfa kaydırması ve yazı alanları etkilenmez), seçili katman
 * ok tuşlarıyla da kaydırılır. Paylaşmadan önce önizleme; yayımlama `client_token` ile idempotenttir (çift dokunma / yeniden
 * deneme ikinci hikâye üretmez). Yükleme başarısız olursa düzenleme bellekte kalır ve "tekrar dene" aynı dosya yoluna yazar.
 */
export function StoryCreator() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { notifyChanged } = useStoryViewer();

  const [step, setStep] = useState<Step>("choose");
  const [kind, setKind] = useState<StoryKind>("text");
  const [media, setMedia] = useState<MediaState | null>(null);
  const [layout, setLayout] = useState<StoryLayout>({ v: 1, bg: "cobalt", layers: [] });
  const [linked, setLinked] = useState<{ type: StoryLinkedType; id: string } | null>(null);
  const [sticker, setSticker] = useState<StorySticker | null>(null);
  const [audience, setAudience] = useState<StoryAudience>(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(AUDIENCE_STORAGE_KEY) : null;
      return saved === "followers" ? "followers" : "public";
    } catch {
      return "public";
    }
  });
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CanvasElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<StoryDraft[] | null>(null);
  const [dirty, setDirty] = useState(false);

  const clientToken = useRef(crypto.randomUUID());
  const canvasRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const prefillDone = useRef(false);
  const blobUrls = useRef<string[]>([]);

  // --- Başlangıç: önceki kitle tercihi, URL ile gelen bağlam (?community, ?link, ?draft, ?story&answer) ---------------------
  useEffect(() => {
    if (!user || prefillDone.current) return;
    prefillDone.current = true;
    const community = searchParams.get("community");
    if (community && isUuid(community)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adresle gelen bağlam (topluluk/bağlantı/yanıt/taslak) oturum çözülünce bir kez uygulanır
      setAudience("community");
      setCommunityId(community);
    }
    const link = searchParams.get("link");
    if (link) {
      const [type, id] = link.split(":");
      if (STORY_LINKED_TYPES.includes(type as StoryLinkedType) && id && isUuid(id)) {
        startText("ink");
        setLinked({ type: type as StoryLinkedType, id });
        setLayout({ v: 1, bg: "ink", layers: [], link: { x: 0.5, y: 0.55 } });
      }
    }
    const answerId = searchParams.get("answer");
    const sourceStory = searchParams.get("story");
    if (answerId && sourceStory && isUuid(answerId) && isUuid(sourceStory)) {
      Promise.all([fetchStoryById(sourceStory), fetchQuestionAnswer(sourceStory, answerId)])
        .then(([story, answer]) => {
          if (!answer) return;
          const question = story?.sticker?.question ?? "";
          startText("ink");
          setLayout({
            v: 1,
            bg: "ink",
            layers: [
              ...(question ? [makeLayer({ text: question.slice(0, STORY_LIMITS.layerTextMax), y: 0.3, size: "s", color: "yellow" })] : []),
              makeLayer({ text: answer.body.slice(0, STORY_LIMITS.layerTextMax), y: 0.5, size: "l", color: "white", bg: false }),
            ],
          });
        })
        .catch(() => setError(t("stories.error.generic")));
    }
    fetchDrafts(user.id)
      .then((list) => {
        setDrafts(list);
        const draftParam = searchParams.get("draft");
        const draft = draftParam ? list.find((d) => d.id === draftParam) : null;
        if (draft) openDraft(draft);
      })
      .catch(() => setDrafts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız ilk açılışta
  }, [user]);

  // Kaydedilmemiş düzenleme varken sayfadan ayrılmayı sor.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const urls = blobUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const touch = () => setDirty(true);

  function makeLayer(over: Partial<StoryTextLayer> = {}): StoryTextLayer {
    return { id: newLayerId(), text: "", x: 0.5, y: 0.4, align: "center", size: "m", color: "white", bg: false, ...over };
  }

  function startText(bg: StoryLayout["bg"] = "cobalt") {
    setKind("text");
    setMedia(null);
    setLayout({ v: 1, bg, layers: [] });
    setStep("edit");
    touch();
  }

  function openDraft(draft: StoryDraft) {
    const p = draft.payload;
    setDraftId(draft.id);
    setKind(p.kind);
    setLayout(p.layout);
    setLinked(p.linkedType && p.linkedId ? { type: p.linkedType, id: p.linkedId } : null);
    setSticker(p.sticker);
    setAudience(p.audience);
    setCommunityId(p.communityId);
    setMedia(
      draft.mediaUrl && draft.mediaMime && p.kind !== "text"
        ? {
            prepared: null,
            previewUrl: draft.mediaUrl,
            uploadedUrl: draft.mediaUrl,
            path: null,
            mime: draft.mediaMime,
            width: p.mediaWidth ?? 1080,
            height: p.mediaHeight ?? 1920,
            durationMs: p.mediaDurationMs,
          }
        : null,
    );
    setStep("edit");
    setDirty(false);
  }

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy({ kind: "preparing" });
    try {
      const prepared = await prepareStoryMedia(file);
      const url = URL.createObjectURL(prepared.blob);
      blobUrls.current.push(url);
      setKind(prepared.kind);
      setMedia({
        prepared,
        previewUrl: url,
        uploadedUrl: null,
        path: null,
        mime: prepared.mime,
        width: prepared.width,
        height: prepared.height,
        durationMs: prepared.durationMs,
      });
      setLayout({ v: 1, fit: "cover", layers: [] });
      setStep("edit");
      touch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
    } finally {
      setBusy(null);
    }
  }

  // --- Katmanlar ----------------------------------------------------------------------------------------------------------------
  const selectedLayer = selected?.type === "layer" ? (layout.layers.find((l) => l.id === selected.id) ?? null) : null;

  const updateLayer = (id: string, patch: Partial<StoryTextLayer>) => {
    setLayout((prev) => ({ ...prev, layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    touch();
  };

  const addLayer = () => {
    if (layout.layers.length >= STORY_LIMITS.maxLayers) {
      setError(t("stories.error.tooManyLayers", { max: STORY_LIMITS.maxLayers }));
      return;
    }
    const layer = makeLayer({ text: t("stories.editor.sampleText"), y: 0.3 + 0.08 * (layout.layers.length % 4), color: kind === "text" ? defaultTextColorFor(layout.bg) : "white", bg: kind !== "text" });
    setLayout((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelected({ type: "layer", id: layer.id });
    touch();
  };

  const removeLayer = (id: string) => {
    setLayout((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== id) }));
    setSelected(null);
    touch();
  };

  // Sürükleme: yalnız katman/kart/çıkartma dokunmayı yakalar; < 4 px hareket dokunma (seçim) sayılır.
  const onElementPointerDown = useCallback((element: CanvasElement, event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || event.button !== 0) return;
    event.preventDefault();
    setSelected(element);
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      moved = true;
      const x = clampUnit((e.clientX - rect.left) / rect.width);
      const y = clampUnit((e.clientY - rect.top) / rect.height);
      setLayout((prev) => {
        if (element.type === "layer") return { ...prev, layers: prev.layers.map((l) => (l.id === element.id ? { ...l, x, y } : l)) };
        if (element.type === "link") return { ...prev, link: { x, y } };
        return { ...prev, sticker: { x, y } };
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) setDirty(true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, []);

  // Klavye: seçili öğeyi oklarla kaydır (fare/dokunma olmadan da yerleştirilebilsin).
  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    setLayout((prev) => {
      const shift = (p: { x: number; y: number }) => ({ x: clampUnit(p.x + delta[0]), y: clampUnit(p.y + delta[1]) });
      if (selected.type === "layer") return { ...prev, layers: prev.layers.map((l) => (l.id === selected.id ? { ...l, ...shift(l) } : l)) };
      if (selected.type === "link") return { ...prev, link: shift(prev.link ?? { x: 0.5, y: 0.62 }) };
      return { ...prev, sticker: shift(prev.sticker ?? { x: 0.5, y: 0.72 }) };
    });
    touch();
  };

  // --- Doğrulama, yükleme, yayımlama ----------------------------------------------------------------------------------------------
  function validate(): string | null {
    if (kind !== "text" && !media) return t("stories.error.media");
    if (isStoryEmpty(kind, layout, Boolean(linked), sticker)) return t("stories.error.empty");
    if (layout.layers.some((l) => !l.text.trim())) return t("stories.error.emptyLayer");
    const checked = validateSticker(sticker);
    if (!checked.ok) return t(checked.error);
    if (audience === "community" && !communityId) return t("stories.error.pickCommunity");
    return null;
  }

  async function ensureUploaded(purpose: "publish" | "draft"): Promise<{ url: string; mime: string } | null> {
    if (!media) return null;
    if (media.uploadedUrl) return { url: media.uploadedUrl, mime: media.mime };
    if (!user || !media.prepared) throw new Error(t("stories.error.media"));
    setBusy({ kind: "uploading", progress: 0, purpose });
    const path = media.path ?? `${user.id}/${crypto.randomUUID()}.${media.prepared.kind === "image" ? "jpg" : media.mime === "video/webm" ? "webm" : media.mime === "video/quicktime" ? "mov" : "mp4"}`;
    setMedia((prev) => (prev ? { ...prev, path } : prev));
    const result = await uploadStoryMedia(user.id, media.prepared, path, (fraction) => setBusy({ kind: "uploading", progress: fraction, purpose }));
    setMedia((prev) => (prev ? { ...prev, uploadedUrl: result.url } : prev));
    return { url: result.url, mime: media.mime };
  }

  function draftPayload() {
    return {
      v: 1 as const,
      kind,
      layout,
      linkedType: linked?.type ?? null,
      linkedId: linked?.id ?? null,
      sticker,
      audience,
      communityId: audience === "community" ? communityId : null,
      mediaWidth: media?.width ?? null,
      mediaHeight: media?.height ?? null,
      mediaDurationMs: media?.durationMs ?? null,
    };
  }

  async function onSaveDraft() {
    if (!user || busy) return;
    setError(null);
    try {
      const uploaded = await ensureUploaded("draft");
      setBusy({ kind: "saving" });
      const id = await saveDraft(user.id, draftId, draftPayload(), uploaded?.url ?? null, uploaded?.mime ?? null);
      setDraftId(id);
      setDirty(false);
      setNotice(t("stories.draft.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
    } finally {
      setBusy(null);
    }
  }

  async function onPublish() {
    if (!user || busy) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      const uploaded = await ensureUploaded("publish");
      setBusy({ kind: "publishing" });
      const checked = validateSticker(sticker);
      await createStory({
        clientToken: clientToken.current,
        kind,
        mediaUrl: uploaded?.url ?? null,
        mediaMime: uploaded?.mime ?? null,
        mediaWidth: media?.width ?? null,
        mediaHeight: media?.height ?? null,
        mediaDurationMs: kind === "video" ? (media?.durationMs ?? null) : null,
        layout: { ...layout, layers: layout.layers.map((l) => ({ ...l, text: l.text.trim() })) },
        linkedType: linked?.type ?? null,
        linkedId: linked?.id ?? null,
        sticker: checked.ok ? checked.sticker : null,
        audience,
        communityId,
      });
      try {
        if (audience !== "community") window.localStorage.setItem(AUDIENCE_STORAGE_KEY, audience);
      } catch {
        // Tercih yalnız kolaylık; yazılamazsa sorun değil.
      }
      if (draftId) await deleteDraft(draftId).catch(() => undefined);
      setDirty(false);
      notifyChanged();
      router.push(audience === "community" && communityId ? communityHref(communityId) : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
      setBusy(null);
    }
  }

  // --- Görünüm ------------------------------------------------------------------------------------------------------------------
  const canvasData = {
    kind,
    mediaUrl: media?.previewUrl ?? null,
    layout,
    linkedType: linked?.type ?? null,
    linkedId: linked?.id ?? null,
    sticker,
  };

  if (!user) return null;

  if (step === "choose") {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6 px-3 py-6 sm:px-5">
        <header className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft">
            <ArrowLeft size={20} aria-hidden />
          </button>
          <h1 className="text-h2">{t("stories.create.title")}</h1>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <ChoiceTile icon={ImageIcon} label={t("stories.create.photo")} hint={t("stories.create.photoHint")} onClick={() => photoInput.current?.click()} />
          <ChoiceTile icon={Clapperboard} label={t("stories.create.video")} hint={t("stories.create.videoHint", { seconds: STORY_LIMITS.videoMaxMs / 1000 })} onClick={() => videoInput.current?.click()} />
          <ChoiceTile icon={Type} label={t("stories.create.text")} hint={t("stories.create.textHint")} onClick={() => { startText("cobalt"); setSelected(null); }} />
          <ChoiceTile icon={SquareTerminal} label={t("stories.create.content")} hint={t("stories.create.contentHint")} onClick={() => setPickerOpen(true)} />
        </div>
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ""; }} />
        {busy?.kind === "preparing" && (
          <p role="status" className="flex items-center gap-2 text-small text-text-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden /> {t("stories.create.preparing")}
          </p>
        )}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}

        <section className="space-y-2" aria-labelledby="story-drafts-title">
          <h2 id="story-drafts-title" className="text-h3">{t("stories.draft.title")}</h2>
          {drafts === null ? (
            <p className="text-small text-text-muted">{t("common.loading")}</p>
          ) : drafts.length === 0 ? (
            <p className="text-small text-text-muted">{t("stories.draft.none")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {drafts.map((draft) => (
                <li key={draft.id} className="space-y-1">
                  <button type="button" onClick={() => openDraft(draft)} className="block w-full overflow-hidden rounded-md ring-1 ring-border-soft" aria-label={t("stories.draft.open", { time: formatRelativeTime(draft.updatedAt, language) })}>
                    <StoryCanvas
                      mode="thumb"
                      story={{ kind: draft.payload.kind, mediaUrl: draft.mediaUrl, layout: draft.payload.layout, linkedType: draft.payload.linkedType, linkedId: draft.payload.linkedId, sticker: draft.payload.sticker }}
                    />
                  </button>
                  <div className="flex items-center justify-between gap-1 text-caption text-text-muted">
                    <span className="truncate">{formatRelativeTime(draft.updatedAt, language)}</span>
                    <button
                      type="button"
                      aria-label={t("stories.draft.delete")}
                      onClick={async () => {
                        await deleteDraft(draft.id);
                        setDrafts((prev) => (prev ?? []).filter((d) => d.id !== draft.id));
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-soft hover:text-danger"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-text-muted">{t("stories.draft.privacy")}</p>
        </section>

        {pickerOpen && (
          <StoryContentPicker
            onClose={() => setPickerOpen(false)}
            onPick={(item) => {
              setPickerOpen(false);
              startText("ink");
              setLinked({ type: item.type, id: item.id });
              setLayout({ v: 1, bg: "ink", layers: [], link: { x: 0.5, y: 0.55 } });
            }}
          />
        )}
      </div>
    );
  }

  const isPreview = step === "preview";
  const progress = busy?.kind === "uploading" ? Math.round(busy.progress * 100) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 lg:py-6">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (isPreview ? setStep("edit") : setStep("choose"))}
          aria-label={t("common.back")}
          disabled={Boolean(busy)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h1 className="text-h2">{isPreview ? t("stories.create.previewTitle") : t("stories.create.editTitle")}</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Tuval */}
        <div className="mx-auto w-full max-w-[min(420px,calc((100dvh-12rem)*9/16))]">
          <div
            tabIndex={isPreview ? -1 : 0}
            onKeyDown={isPreview ? undefined : onCanvasKeyDown}
            aria-label={t("stories.editor.canvasLabel")}
            className="overflow-hidden rounded-xl shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onPointerDown={(event) => {
              // Boş tuvale dokunmak seçimi kaldırır (katman/kart/çıkartma kendi seçimini yapar).
              if (!isPreview && !(event.target as HTMLElement).closest("[data-story-layer], [data-story-link], [data-story-sticker]")) setSelected(null);
            }}
          >
            <StoryCanvas
              story={canvasData}
              mode={isPreview ? "view" : "edit"}
              canvasRef={canvasRef}
              autoPlayLoop
              selected={selected}
              onElementPointerDown={onElementPointerDown}
              onLayerTap={(layer) => setSelected({ type: "layer", id: layer.id })}
            />
          </div>
          {!isPreview && <p className="mt-2 text-center text-caption text-text-muted">{t("stories.editor.dragHint")}</p>}
        </div>

        {/* Araçlar */}
        <div className="space-y-5">
          {isPreview ? (
            <PreviewSummary audience={audience} kind={kind} hasLink={Boolean(linked)} sticker={sticker} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="toolbar" aria-label={t("stories.editor.toolbar")}>
                <ToolButton icon={Type} label={t("stories.editor.addText")} onClick={addLayer} />
                <ToolButton
                  icon={BarChart3}
                  label={t("stories.editor.poll")}
                  pressed={sticker?.kind === "poll"}
                  onClick={() => {
                    setSticker(sticker?.kind === "poll" ? null : { kind: "poll", question: "", options: ["", ""] });
                    touch();
                  }}
                />
                <ToolButton
                  icon={MessageCircleQuestion}
                  label={t("stories.editor.question")}
                  pressed={sticker?.kind === "question"}
                  onClick={() => {
                    setSticker(sticker?.kind === "question" ? null : { kind: "question", question: "" });
                    touch();
                  }}
                />
                <ToolButton icon={Link2} label={linked ? t("stories.editor.changeLink") : t("stories.editor.addLink")} pressed={Boolean(linked)} onClick={() => setPickerOpen(true)} />
                {linked && <ToolButton icon={X} label={t("stories.editor.removeLink")} onClick={() => { setLinked(null); touch(); }} />}
                {kind !== "text" && (
                  <ToolButton
                    icon={layout.fit === "contain" ? Maximize2 : Minimize2}
                    label={layout.fit === "contain" ? t("stories.editor.fill") : t("stories.editor.fit")}
                    onClick={() => {
                      setLayout((prev) => ({ ...prev, fit: prev.fit === "contain" ? "cover" : "contain" }));
                      touch();
                    }}
                  />
                )}
              </div>

              {kind === "text" && (
                <fieldset>
                  <legend className="mb-1.5 text-label font-semibold text-text">{t("stories.editor.background")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {STORY_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        aria-pressed={layout.bg === bg}
                        aria-label={t(`stories.bg.${bg}` as TranslationKey)}
                        title={t(`stories.bg.${bg}` as TranslationKey)}
                        onClick={() => {
                          setLayout((prev) => ({ ...prev, bg }));
                          touch();
                        }}
                        className={cn("h-9 w-9 rounded-full ring-1 ring-border", STORY_BG_CLASS[bg], layout.bg === bg && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                      />
                    ))}
                  </div>
                </fieldset>
              )}

              {selectedLayer && (
                <LayerPanel
                  layer={selectedLayer}
                  onChange={(patch) => updateLayer(selectedLayer.id, patch)}
                  onRemove={() => removeLayer(selectedLayer.id)}
                  onDone={() => setSelected(null)}
                />
              )}

              {sticker && (
                <StickerPanel
                  sticker={sticker}
                  onChange={(next) => {
                    setSticker(next);
                    touch();
                  }}
                  onRemove={() => {
                    setSticker(null);
                    touch();
                  }}
                />
              )}

              <StoryAudiencePicker
                audience={audience}
                communityId={communityId}
                onChange={(nextAudience, nextCommunity) => {
                  setAudience(nextAudience);
                  setCommunityId(nextCommunity);
                  touch();
                }}
              />
            </>
          )}

          {progress !== null && (
            <div role="status" aria-live="polite" className="space-y-1">
              <div className="flex justify-between text-caption text-text-muted">
                <span>{t("stories.create.uploading")}</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-small text-danger">
              {error}
              {media && !media.uploadedUrl && media.prepared && !busy && (
                <button type="button" onClick={() => void (isPreview ? onPublish() : onSaveDraft())} className="inline-flex items-center gap-1 font-semibold text-primary">
                  <RotateCcw size={13} aria-hidden /> {t("common.retry")}
                </button>
              )}
            </p>
          )}
          {notice && <p role="status" className="text-small text-success">{notice}</p>}

          <div className="flex flex-wrap gap-2">
            {isPreview ? (
              <>
                <Button type="button" variant="outline" onClick={() => setStep("edit")} disabled={Boolean(busy)}>
                  {t("stories.create.backToEdit")}
                </Button>
                <Button type="button" onClick={() => void onPublish()} disabled={Boolean(busy)} data-story-publish>
                  {busy?.kind === "publishing" || busy?.kind === "uploading" ? (
                    <>
                      <Loader2 size={15} className="animate-spin" aria-hidden /> {t("stories.create.publishing")}
                    </>
                  ) : (
                    <>
                      <Check size={15} aria-hidden /> {t("stories.create.publish")}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => void onSaveDraft()} disabled={Boolean(busy)}>
                  {busy?.kind === "saving" || (busy?.kind === "uploading" && busy.purpose === "draft") ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} aria-hidden />}
                  {t("stories.draft.save")}
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    const problem = validate();
                    if (problem) setError(problem);
                    else {
                      setError(null);
                      setSelected(null);
                      setStep("preview");
                    }
                  }}
                >
                  {t("stories.create.next")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <StoryContentPicker
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            setPickerOpen(false);
            setLinked({ type: item.type, id: item.id });
            setLayout((prev) => ({ ...prev, link: prev.link ?? { x: 0.5, y: 0.62 } }));
            touch();
          }}
        />
      )}
    </div>
  );
}

function ChoiceTile({ icon: Icon, label, hint, onClick }: { icon: typeof Type; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-28 flex-col items-start justify-between gap-3 rounded-lg border border-border-soft bg-surface p-4 text-left shadow-card transition-colors duration-200 ease-soft hover:border-border-strong"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <span>
        <span className="block text-small font-semibold text-text">{label}</span>
        <span className="block text-caption text-text-muted">{hint}</span>
      </span>
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick, pressed }: { icon: typeof Type; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-label font-medium transition-colors duration-200 ease-soft",
        pressed ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text",
      )}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function LayerPanel({ layer, onChange, onRemove, onDone }: { layer: StoryTextLayer; onChange: (patch: Partial<StoryTextLayer>) => void; onRemove: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-lg border border-border-soft bg-surface p-3" aria-label={t("stories.editor.layerPanel")}>
      <textarea
        value={layer.text}
        onChange={(event) => onChange({ text: event.target.value.slice(0, STORY_LIMITS.layerTextMax) })}
        rows={2}
        autoFocus
        aria-label={t("stories.editor.layerText")}
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label={t("stories.editor.align")}>
          {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => (
            <button key={align} type="button" aria-pressed={layer.align === align} aria-label={t(`stories.editor.align.${align}` as TranslationKey)} onClick={() => onChange({ align })} className={cn("flex h-9 w-9 items-center justify-center rounded-md", layer.align === align ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}>
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label={t("stories.editor.size")}>
          {STORY_TEXT_SIZES.map((size) => (
            <button key={size} type="button" aria-pressed={layer.size === size} onClick={() => onChange({ size })} className={cn("flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-label font-semibold", layer.size === size ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}>
              {t(SIZE_LABEL[size])}
            </button>
          ))}
        </div>
        <label className="inline-flex min-h-9 items-center gap-2 text-label text-text-secondary">
          <input type="checkbox" checked={layer.bg} onChange={(event) => onChange({ bg: event.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
          {t("stories.editor.textBackground")}
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("stories.editor.color")}>
        {STORY_TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={layer.color === color}
            aria-label={t(`stories.color.${color}` as TranslationKey)}
            title={t(`stories.color.${color}` as TranslationKey)}
            onClick={() => onChange({ color })}
            className={cn("h-9 w-9 rounded-full ring-1 ring-border", STORY_SWATCH_CLASS[color], layer.color === color && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-danger">
          <Trash2 size={14} aria-hidden /> {t("stories.editor.removeLayer")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {t("stories.editor.done")}
        </Button>
      </div>
    </section>
  );
}

function StickerPanel({ sticker, onChange, onRemove }: { sticker: StorySticker; onChange: (sticker: StorySticker) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const isPoll = sticker.kind === "poll";
  return (
    <section className="space-y-2 rounded-lg border border-border-soft bg-surface p-3" aria-label={isPoll ? t("stories.editor.poll") : t("stories.editor.question")}>
      <label className="block text-label font-semibold text-text" htmlFor="story-sticker-question">
        {isPoll ? t("stories.editor.pollQuestion") : t("stories.editor.questionText")}
      </label>
      <input
        id="story-sticker-question"
        value={sticker.question}
        maxLength={isPoll ? STORY_LIMITS.pollQuestionMax : STORY_LIMITS.questionMax}
        onChange={(event) => onChange({ ...sticker, question: event.target.value })}
        placeholder={isPoll ? t("stories.editor.pollQuestionPlaceholder") : t("stories.editor.questionPlaceholder")}
        className="min-h-10 w-full rounded-md border border-border bg-surface px-3 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
      {sticker.kind === "poll" && (
        <div className="space-y-1.5">
          {sticker.options.map((option, index) => (
            <div key={index} className="flex gap-1.5">
              <input
                value={option}
                maxLength={STORY_LIMITS.pollOptionMax}
                aria-label={t("stories.editor.pollOption", { n: index + 1 })}
                placeholder={t("stories.editor.pollOption", { n: index + 1 })}
                onChange={(event) => onChange({ ...sticker, options: sticker.options.map((o, i) => (i === index ? event.target.value : o)) })}
                className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              {sticker.options.length > STORY_LIMITS.pollOptionsMin && (
                <button type="button" aria-label={t("stories.editor.removeOption")} onClick={() => onChange({ ...sticker, options: sticker.options.filter((_, i) => i !== index) })} className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger">
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {sticker.options.length < STORY_LIMITS.pollOptionsMax && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...sticker, options: [...sticker.options, ""] })}>
              <Plus size={14} aria-hidden /> {t("stories.editor.addOption")}
            </Button>
          )}
          <p className="text-caption text-text-muted">{t("stories.editor.pollPolicy")}</p>
        </div>
      )}
      {sticker.kind === "question" && <p className="text-caption text-text-muted">{t("stories.editor.questionPolicy")}</p>}
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-danger">
        <Trash2 size={14} aria-hidden /> {t("stories.editor.removeSticker")}
      </Button>
    </section>
  );
}

function PreviewSummary({ audience, kind, hasLink, sticker }: { audience: StoryAudience; kind: StoryKind; hasLink: boolean; sticker: StorySticker | null }) {
  const { t } = useTranslation();
  const rows: string[] = [
    t(`stories.create.kind.${kind}` as TranslationKey),
    t(`stories.audience.${audience}` as TranslationKey),
    t("stories.create.expiresIn"),
  ];
  if (hasLink) rows.push(t("stories.create.withLink"));
  if (sticker) rows.push(sticker.kind === "poll" ? t("stories.editor.poll") : t("stories.editor.question"));
  return (
    <section className="space-y-3 rounded-lg border border-border-soft bg-surface p-4" aria-label={t("stories.create.summary")}>
      <ul className="space-y-1.5 text-small text-text-secondary">
        {rows.map((row) => (
          <li key={row} className="flex items-center gap-2">
            <Check size={14} className="text-success" aria-hidden /> {row}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted">{t(`stories.audience.${audience}Hint` as TranslationKey)}</p>
    </section>
  );
}
