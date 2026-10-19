"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { BarChart3, Film, MessageCircleQuestion } from "lucide-react";
import { StorageImg, StorageVideo } from "@/components/ui/storage-media";
import { SharedPresetCard, SharedPromptCard, SharedRequestCard, SharedWorkflowCard } from "@/features/messages/shared-content-card";
import { cn } from "@/lib/utils";
import type { StoryBackground, StoryKind, StoryLayout, StoryLinkedType, StorySticker, StoryTextColor, StoryTextLayer, StoryTextSize } from "@/types";

/**
 * Bir hikâyenin GÖRSELİ — tek çizim, dört yerde (docs/history/198-*): görüntüleyici, düzenleyici önizlemesi, arşiv/öne çıkan
 * küçük resmi ve mesajdaki yanıt kartı. 9:16 tuval; katman konumları tuvalin 0–1 oranı, yazı boyutları tuval genişliğine
 * göre (`cqw`) — böylece aynı hikâye telefonda da masaüstünde de aynı yerleşimle görünür. Renkler sabit `story-*`
 * token'larıdır (izleyicinin paletinden bağımsız; hikâye yazarın seçtiği renklerle görünür).
 */

export const STORY_BG_CLASS: Record<StoryBackground, string> = {
  cobalt: "bg-story-cobalt",
  sunset: "bg-story-sunset",
  ink: "bg-story-ink",
  paper: "bg-story-paper",
  forest: "bg-story-forest",
  berry: "bg-story-berry",
};

export const STORY_TEXT_CLASS: Record<StoryTextColor, string> = {
  white: "text-story-white",
  black: "text-story-black",
  yellow: "text-story-yellow",
  cobalt: "text-story-cobalt",
  orange: "text-story-orange",
  mint: "text-story-mint",
};

/** Swatch'lar için aynı renkler zemin olarak. */
export const STORY_SWATCH_CLASS: Record<StoryTextColor, string> = {
  white: "bg-story-white",
  black: "bg-story-black",
  yellow: "bg-story-yellow",
  cobalt: "bg-story-cobalt",
  orange: "bg-story-orange",
  mint: "bg-story-mint",
};

const SIZE_CLASS: Record<StoryTextSize, string> = {
  s: "text-[4.4cqw]",
  m: "text-[6cqw]",
  l: "text-[8cqw]",
  xl: "text-[11cqw]",
};

/** Okunabilirlik zemini: koyu yazıya açık, açık yazıya koyu yarı saydam şerit. */
const DARK_TEXT = new Set<StoryTextColor>(["black", "cobalt"]);

export interface StoryCanvasData {
  kind: StoryKind;
  /** Kimlik URL'si ya da düzenleyicide yerel `blob:` adresi. */
  mediaUrl: string | null;
  layout: StoryLayout;
  linkedType: StoryLinkedType | null;
  linkedId: string | null;
  sticker: StorySticker | null;
}

export type CanvasElement = { type: "layer"; id: string } | { type: "link" } | { type: "sticker" };

export function StoryCanvas({
  story,
  mode = "view",
  className,
  canvasRef,
  videoRef,
  muted = true,
  onMediaReady,
  onMediaError,
  onVideoEnded,
  renderSticker,
  onLinkOpen,
  selected,
  onElementPointerDown,
  onLayerTap,
  autoPlayLoop = false,
}: {
  story: StoryCanvasData;
  mode?: "view" | "edit" | "thumb";
  className?: string;
  canvasRef?: RefObject<HTMLDivElement | null>;
  videoRef?: RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  onMediaReady?: () => void;
  onMediaError?: () => void;
  onVideoEnded?: () => void;
  /** Etkileşimli çıkartma (görüntüleyici); yoksa durağan önizleme. */
  renderSticker?: (sticker: StorySticker) => ReactNode;
  /** Bağlantı kartı tıklanınca (görüntüleyici kendini kapatır; gezinme kartın kendi bağlantısıyla olur). */
  onLinkOpen?: () => void;
  selected?: CanvasElement | null;
  onElementPointerDown?: (element: CanvasElement, event: ReactPointerEvent<HTMLElement>) => void;
  onLayerTap?: (layer: StoryTextLayer) => void;
  /** Düzenleyici/önizleme: videoyu sessiz ve döngüde kendiliğinden oynat (görüntüleyici oynatmayı kendisi yönetir). */
  autoPlayLoop?: boolean;
}) {
  const { layout } = story;
  const isThumb = mode === "thumb";
  const isEdit = mode === "edit";
  const fit = layout.fit === "contain" ? "object-contain" : "object-cover";
  const linkPoint = layout.link ?? { x: 0.5, y: 0.62 };
  const stickerPoint = layout.sticker ?? { x: 0.5, y: 0.72 };
  const isSelected = (element: CanvasElement) =>
    selected?.type === element.type && (element.type !== "layer" || (selected.type === "layer" && selected.id === element.id));

  return (
    <div
      ref={canvasRef}
      data-story-canvas
      className={cn(
        "@container relative aspect-[9/16] w-full overflow-hidden bg-story-stage select-none",
        story.kind === "text" && STORY_BG_CLASS[layout.bg ?? "ink"],
        className,
      )}
    >
      {story.kind === "image" && story.mediaUrl && (
        <StorageImg
          src={story.mediaUrl}
          alt=""
          draggable={false}
          loading={isThumb ? "lazy" : undefined}
          onLoad={onMediaReady}
          onError={onMediaError}
          className={cn("absolute inset-0 h-full w-full", fit)}
        />
      )}
      {story.kind === "video" && story.mediaUrl && (
        <>
          <StorageVideo
            src={story.mediaUrl}
            ref={videoRef}
            muted={autoPlayLoop ? true : muted}
            autoPlay={autoPlayLoop}
            loop={autoPlayLoop}
            playsInline
            preload={isThumb ? "metadata" : "auto"}
            onLoadedData={onMediaReady}
            onError={onMediaError}
            onEnded={onVideoEnded}
            className={cn("absolute inset-0 h-full w-full", fit)}
          />
          {isThumb && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-story-scrim p-1 text-story-white">
              <Film size={12} aria-hidden />
            </span>
          )}
        </>
      )}

      {layout.layers.map((layer) => {
        const element: CanvasElement = { type: "layer", id: layer.id };
        return (
          <div
            key={layer.id}
            data-story-layer={layer.id}
            onPointerDown={isEdit ? (event) => onElementPointerDown?.(element, event) : undefined}
            onClick={isEdit ? () => onLayerTap?.(layer) : undefined}
            className={cn(
              "absolute max-w-[88%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap break-words font-display font-semibold leading-tight",
              SIZE_CLASS[layer.size],
              STORY_TEXT_CLASS[layer.color],
              layer.align === "left" ? "text-left" : layer.align === "right" ? "text-right" : "text-center",
              layer.bg && "rounded-[1.6cqw] px-[2.4cqw] py-[1.2cqw]",
              layer.bg && (DARK_TEXT.has(layer.color) ? "bg-story-white/85" : "bg-story-black/55"),
              isEdit && "cursor-move touch-none",
              isEdit && isSelected(element) && "outline-2 outline-offset-4 outline-dashed outline-story-white",
            )}
            style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%` }}
          >
            {layer.text}
          </div>
        );
      })}

      {story.linkedType && story.linkedId && (
        <div
          data-story-link
          onPointerDown={isEdit ? (event) => onElementPointerDown?.({ type: "link" }, event) : undefined}
          onClickCapture={mode === "view" ? () => onLinkOpen?.() : undefined}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2",
            isThumb ? "pointer-events-none origin-center scale-[0.35]" : "",
            isEdit && "cursor-move touch-none",
            isEdit && isSelected({ type: "link" }) && "rounded-xl outline-2 outline-offset-4 outline-dashed outline-story-white",
          )}
          style={{ left: `${linkPoint.x * 100}%`, top: `${linkPoint.y * 100}%` }}
        >
          <div className={cn(isEdit && "pointer-events-none")}>
            <LinkedContentCard type={story.linkedType} id={story.linkedId} />
          </div>
        </div>
      )}

      {story.sticker && !isThumb && (
        <div
          data-story-sticker={story.sticker.kind}
          onPointerDown={isEdit ? (event) => onElementPointerDown?.({ type: "sticker" }, event) : undefined}
          className={cn(
            "absolute w-[78%] -translate-x-1/2 -translate-y-1/2",
            isEdit && "cursor-move touch-none",
            isEdit && isSelected({ type: "sticker" }) && "rounded-xl outline-2 outline-offset-4 outline-dashed outline-story-white",
          )}
          style={{ left: `${stickerPoint.x * 100}%`, top: `${stickerPoint.y * 100}%` }}
        >
          {renderSticker && !isEdit ? renderSticker(story.sticker) : <StaticSticker sticker={story.sticker} />}
        </div>
      )}
      {story.sticker && isThumb && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-story-scrim p-1 text-story-white">
          {story.sticker.kind === "poll" ? <BarChart3 size={12} aria-hidden /> : <MessageCircleQuestion size={12} aria-hidden />}
        </span>
      )}
    </div>
  );
}

/** Bağlantı kartı: içerik KOPYALANMAZ — kart içeriği kimliğiyle, izleyicinin kendi yetkisiyle okur (gizlenen/silinen = "erişilemiyor"). */
function LinkedContentCard({ type, id }: { type: StoryLinkedType; id: string }) {
  if (type === "prompt") return <SharedPromptCard promptId={id} />;
  if (type === "request") return <SharedRequestCard requestId={id} />;
  if (type === "workflow") return <SharedWorkflowCard workflowId={id} />;
  return <SharedPresetCard presetId={id} />;
}

/** Düzenleyicide ve çıkartması etkileşimsiz yerlerde: aynı görünüm, düğmeler devre dışı. */
export function StaticSticker({ sticker }: { sticker: StorySticker }) {
  return (
    <div className="rounded-[3cqw] bg-story-white p-[3.5cqw] text-story-black shadow-pop">
      <p className="text-center text-[4.6cqw] font-semibold leading-snug">{sticker.question || "…"}</p>
      {sticker.kind === "poll" ? (
        <div className="mt-[2.5cqw] space-y-[1.6cqw]">
          {sticker.options.map((option, index) => (
            <div key={index} className="rounded-[2cqw] border border-story-black/15 px-[3cqw] py-[1.8cqw] text-center text-[4cqw] font-medium">
              {option || "…"}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-[2.5cqw] rounded-[2cqw] bg-story-black/5 px-[3cqw] py-[2.2cqw] text-center text-[3.8cqw] text-story-black/60">…</div>
      )}
    </div>
  );
}
