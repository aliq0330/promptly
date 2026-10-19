"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, SlidersHorizontal, Sparkles, SquareTerminal, Workflow, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchLinkableContent, type LinkableContent } from "@/lib/supabase/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { StoryLinkedType } from "@/types";

export const LINKED_TYPE_META: Record<StoryLinkedType, { icon: typeof SquareTerminal; label: TranslationKey }> = {
  prompt: { icon: SquareTerminal, label: "communities.feed.type.prompt" },
  workflow: { icon: Workflow, label: "communities.feed.type.workflow" },
  preset: { icon: SlidersHorizontal, label: "communities.feed.type.preset" },
  request: { icon: Sparkles, label: "communities.feed.type.request" },
};

/**
 * Hikâyeye bağlanacak içerik (docs/history/198-*): arama boşken kendi paylaşımların, yazınca sitedeki herkese açık içerik. Yalnız
 * yayında + herkese açık + topluluğa ait olmayan içerik listelenir (sunucu yayımlarken yeniden denetler). İçerik kopyalanmaz.
 */
export function StoryContentPicker({ onPick, onClose }: { onPick: (item: LinkableContent) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableContent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setResults(null);
      fetchLinkableContent(user.id, query)
        .then((items) => {
          if (!alive) return;
          setResults(items);
          setFailed(false);
        })
        .catch(() => {
          if (!alive) return;
          setResults([]);
          setFailed(true);
        });
    }, query ? 300 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [user, query]);

  return (
    <Modal onClose={onClose} labelledBy="story-content-picker-title">
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <h2 id="story-content-picker-title" className="text-h3 font-semibold text-text">
            {t("stories.link.pickTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">{t("stories.link.searchLabel")}</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("stories.link.searchPlaceholder")}
              className="min-h-11 w-full rounded-full border border-border bg-surface-soft pl-9 pr-3 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <p className="mt-2 text-caption text-text-muted">{query ? t("stories.link.searchingAll") : t("stories.link.yourContent")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {results === null ? (
            <p className="flex items-center justify-center gap-2 py-8 text-small text-text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden /> {t("common.loading")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-small text-text-muted">{failed ? t("stories.error.generic") : t("stories.link.none")}</p>
          ) : (
            <ul>
              {results.map((item) => {
                const meta = LINKED_TYPE_META[item.type];
                const Icon = meta.icon;
                return (
                  <li key={`${item.type}:${item.id}`}>
                    <button
                      type="button"
                      onClick={() => onPick(item)}
                      className="flex min-h-12 w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-soft"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-small font-semibold text-text">{item.title}</span>
                        <span className="block truncate text-caption text-text-muted">
                          {t(meta.label)}
                          {item.description ? ` · ${item.description}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
