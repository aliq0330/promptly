"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, LayoutGrid, SlidersHorizontal, Sparkles, SquareTerminal, UserCheck, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { FOCUS_CHANNELS, type FocusChannel } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/**
 * The one filter chip of Odak's top bar (docs/history/245-*): "Tümü · En yeni ▾". It replaces the two-feed capsule and the
 * hidden vertical section swipe — the post TYPE (Tümü · Prompt · İstek · Workflow · Hazır ayar, the same list Keşfet's menu
 * has) and the SOURCE (En yeni · Takip Ettiklerim) are chosen here, in words. Up / down on a post is the info sheet's gesture.
 */

export type FocusTab = "newest" | "following";

export const CHANNEL_META: Record<FocusChannel, { icon: LucideIcon; label: TranslationKey }> = {
  all: { icon: LayoutGrid, label: "focusFeed.all" },
  prompt: { icon: SquareTerminal, label: "nav.prompts" },
  request: { icon: Sparkles, label: "nav.requestsShort" },
  workflow: { icon: WorkflowIcon, label: "nav.workflows" },
  preset: { icon: SlidersHorizontal, label: "nav.presets" },
};

const TAB_META: Record<FocusTab, { icon: LucideIcon; label: TranslationKey }> = {
  newest: { icon: Clock, label: "home.tabNewest" },
  following: { icon: UserCheck, label: "nav.following" },
};
const TABS: FocusTab[] = ["newest", "following"];

/** İçerik türü süzgeci (docs/history/305-*): Ana Sayfa Filtre'sindeki dört tür; `null` = Tümü. */
const CONTENT_TYPES: ContentTypeId[] = ["image", "text", "audio", "video"];
const CONTENT_TYPE_LABEL: Record<ContentTypeId, TranslationKey> = {
  image: "contentType.image",
  text: "contentType.text",
  audio: "contentType.audio",
  video: "contentType.video",
};

export function FocusFilterMenu({
  channel,
  tab,
  contentType,
  onChannel,
  onTab,
  onContentType,
}: {
  channel: FocusChannel;
  tab: FocusTab;
  contentType: ContentTypeId | null;
  onChannel: (channel: FocusChannel) => void;
  onTab: (tab: FocusTab) => void;
  onContentType: (contentType: ContentTypeId | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Esc closes the menu first (captured before Odak's own Esc = close); a press outside closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const row =
    "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-label font-medium text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const heading = "px-3 pb-1 pt-2 text-caption font-bold uppercase tracking-[0.08em] text-text-muted";

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("focusFeed.filter")}
        title={t("focusFeed.filter")}
        className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/10 pl-4 pr-3 text-label font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="truncate">{t(CHANNEL_META[channel].label)}</span>
        {contentType && <span className="truncate font-medium text-white/65">· {t(CONTENT_TYPE_LABEL[contentType])}</span>}
        <span className="truncate font-medium text-white/65">· {t(TAB_META[tab].label)}</span>
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 transition-transform duration-200 ease-soft", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("focusFeed.filter")}
          className="absolute left-1/2 top-full z-40 mt-2 max-h-[calc(100dvh-6rem)] w-[min(18rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-border-soft bg-surface-elevated p-1.5 shadow-pop animate-pop-in"
        >
          <p className={heading}>{t("toolbar.postKind")}</p>
          {FOCUS_CHANNELS.map((key) => {
            const Icon = CHANNEL_META[key].icon;
            const selected = key === channel;
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  onChannel(key);
                }}
                className={cn(row, selected && "bg-surface-soft font-semibold")}
              >
                <Icon size={18} aria-hidden className="text-text-secondary" />
                {t(CHANNEL_META[key].label)}
                {selected && <Check size={16} aria-hidden className="ml-auto text-primary" />}
              </button>
            );
          })}
          <div role="separator" className="my-1.5 border-t border-border-soft" />
          <p className={heading}>{t("toolbar.contentType")}</p>
          {[null, ...CONTENT_TYPES].map((key) => {
            const selected = key === contentType;
            return (
              <button
                key={key ?? "all"}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  onContentType(key);
                }}
                className={cn(row, selected && "bg-surface-soft font-semibold")}
              >
                {key ? t(CONTENT_TYPE_LABEL[key]) : t("focusFeed.all")}
                {selected && <Check size={16} aria-hidden className="ml-auto text-primary" />}
              </button>
            );
          })}
          <div role="separator" className="my-1.5 border-t border-border-soft" />
          <p className={heading}>{t("focusFeed.source")}</p>
          {TABS.map((key) => {
            const Icon = TAB_META[key].icon;
            const selected = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  onTab(key);
                }}
                className={cn(row, selected && "bg-surface-soft font-semibold")}
              >
                <Icon size={18} aria-hidden className="text-text-secondary" />
                {t(TAB_META[key].label)}
                {selected && <Check size={16} aria-hidden className="ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
