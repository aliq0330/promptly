"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Search, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatRelativeTime } from "@/lib/utils";
import { matchesQuery } from "@/lib/spaces";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { CopyTextButton, DraftEditorModal, ItemDetailModal, resolveSource, sourceReasonKey, usePlaceNewItems, useItemTitle } from "../space-items";
import { SpaceImage } from "../space-visuals";

type Source = "all" | "post" | "draft" | "image";
type Sort = "newest" | "oldest" | "title";

const SOURCE_LABEL: Record<Source, TranslationKey> = {
  all: "spaces.prompts.sourceAll",
  post: "spaces.prompts.sourcePost",
  draft: "spaces.prompts.sourceDraft",
  image: "spaces.prompts.sourceImage",
};

interface Row {
  item: SpaceItem;
  source: Exclude<Source, "all">;
}

/**
 * Promptlar (docs/history/213-*): Space'e bağlanan Promptly promptları, kullanıcının kendi taslakları ve eklenen görsellerin kaynak
 * promptları tek listede; kaynağa göre süzülür, başlığa/tarihe göre sıralanır. Özgün gönderi ile taslak AYRIDIR: taslak düzenlemek
 * gönderiyi değiştirmez ("Taslağa kopyala" bağımsız bir kopya açar, kaynağı yalnız gösterir).
 */
export function PromptsTab({ onShowOnBoard }: { onShowOnBoard: (id: string) => void }) {
  const { t, language } = useTranslation();
  const { space, items, sources, readable, caps, addItems } = useSpaceContext();
  const itemTitle = useItemTitle();
  const place = usePlaceNewItems();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SpaceItem | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.kind === "prompt") {
        out.push({ item, source: item.isDraft ? "draft" : "post" });
        if (item.promptId) seen.add(item.promptId);
      }
    }
    for (const item of items) {
      if (item.kind === "image" && item.promptId && !seen.has(item.promptId) && sources.prompts.get(item.promptId)?.promptText) {
        seen.add(item.promptId);
        out.push({ item, source: "image" });
      }
    }
    return out;
  }, [items, sources]);

  const visible = rows
    .filter((row) => source === "all" || row.source === source)
    .filter((row) => {
      const resolved = resolveSource(row.item, sources, readable);
      return matchesQuery(query, row.item.title, row.item.body, row.item.note, resolved.prompt?.title, resolved.prompt?.promptText);
    })
    .sort((a, b) => {
      if (sort === "title") return itemTitle(a.item).localeCompare(itemTitle(b.item), language);
      return sort === "oldest" ? a.item.createdAt.localeCompare(b.item.createdAt) : b.item.createdAt.localeCompare(a.item.createdAt);
    });

  async function copyAsDraft(item: SpaceItem) {
    const prompt = item.promptId ? sources.prompts.get(item.promptId) : null;
    if (!prompt) return;
    setError(null);
    try {
      await addItems(place([{ spaceId: space.id, kind: "prompt", isDraft: true, sourcePromptId: prompt.id, title: prompt.title, body: prompt.promptText }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  return (
    <div className="space-y-4" data-testid="space-prompts">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.prompts.search")}
            aria-label={t("spaces.prompts.search")}
            className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-small text-text placeholder:text-text-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t("spaces.sort.label")} className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-small font-medium text-text sm:flex-none">
            <option value="newest">{t("profile.sortNewest")}</option>
            <option value="oldest">{t("profile.sortOldest")}</option>
            <option value="title">{t("spaces.sort.title")}</option>
          </select>
          {caps.edit && (
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} aria-hidden />
              {t("spaces.prompts.newDraft")}
            </Button>
          )}
        </div>
      </div>
      <ChipRow aria-label={t("spaces.prompts.sourceFilter")}>
        {(Object.keys(SOURCE_LABEL) as Source[]).map((key) => (
          <Chip key={key} selected={source === key} onClick={() => setSource(key)}>
            {t(SOURCE_LABEL[key])}
          </Chip>
        ))}
      </ChipRow>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={SquareTerminal}
          title={t("spaces.prompts.empty")}
          description={caps.edit ? t("spaces.prompts.emptyEditor") : undefined}
          action={caps.edit ? { label: t("spaces.prompts.newDraft"), onClick: () => setEditing("new") } : undefined}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title={t("spaces.home.noResults")} compact />
      ) : (
        <ul className="space-y-3">
          {visible.map(({ item, source: rowSource }) => {
            const resolved = resolveSource(item, sources, readable);
            const reason = rowSource === "draft" ? null : sourceReasonKey(resolved.state);
            const text = rowSource === "draft" ? item.body : (resolved.prompt?.promptText ?? "");
            return (
              <li key={`${rowSource}-${item.id}`} data-prompt-row={rowSource} className="rounded-lg border border-border-soft bg-surface p-3.5 shadow-xs">
                <div className="flex items-start gap-3">
                  {rowSource === "image" && <SpaceImage url={item.mediaUrl} alt="" available={!reason} className="h-14 w-14 shrink-0 rounded-md" />}
                  <div className="min-w-0 flex-1 space-y-1">
                    <button type="button" onClick={() => setOpenId(item.id)} className="block max-w-full truncate text-left text-body font-semibold text-text hover:text-primary">
                      {rowSource === "image" ? (resolved.prompt?.title ?? itemTitle(item)) : itemTitle(item)}
                    </button>
                    <p className="text-caption text-text-muted">
                      {t(SOURCE_LABEL[rowSource])}
                      {resolved.prompt && rowSource !== "draft" && <> · {resolved.prompt.author.displayName}</>}
                      {" · "}
                      {formatRelativeTime(item.createdAt, language)}
                    </p>
                  </div>
                </div>
                {reason ? (
                  <p className="mt-2 rounded-md bg-surface-soft px-3 py-2 text-small text-text-muted">{t(reason)}</p>
                ) : (
                  text && <pre className="prompt-text mt-2 line-clamp-3 whitespace-pre-wrap break-words rounded-md bg-surface-soft p-3 text-small text-text">{text}</pre>
                )}
                {item.note && <p className="mt-2 break-words text-caption text-text-secondary">{item.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {text && !reason && <CopyTextButton text={text} />}
                  {resolved.href && rowSource !== "draft" && (
                    <Link href={resolved.href} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-label font-semibold text-text-secondary hover:bg-surface-soft hover:text-text">
                      <ExternalLink size={14} aria-hidden />
                      {t("spaces.source.open")}
                    </Link>
                  )}
                  {caps.edit && rowSource === "draft" && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                      <Pencil size={14} aria-hidden />
                      {t("spaces.prompts.editDraft")}
                    </Button>
                  )}
                  {caps.edit && rowSource !== "draft" && resolved.prompt && (
                    <Button variant="ghost" size="sm" onClick={() => void copyAsDraft(item)}>
                      <Pencil size={14} aria-hidden />
                      {t("spaces.prompts.copyAsDraft")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openId && <ItemDetailModal itemId={openId} onClose={() => setOpenId(null)} onShowOnBoard={onShowOnBoard} />}
      {editing && <DraftEditorModal draft={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
