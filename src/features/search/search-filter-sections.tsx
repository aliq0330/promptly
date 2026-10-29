"use client";

import { useEffect, useId, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { AI_TOOLS, searchTools } from "@/lib/ai-tool-catalog";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchProfiles } from "@/lib/supabase/profiles";
import { fetchPopularTags, searchTags } from "@/lib/supabase/tags";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { KIND_ICON, KIND_LABEL, tokenChip } from "./search-chip-meta";
import { ALL_KINDS, toggleToken, tokenKey, type SearchToken } from "./search-tokens";

export type SearchSort = NonNullable<ContentSearchFilters["sort"]>;
const SORTS: { key: SearchSort; label: TranslationKey }[] = [
  { key: "relevant", label: "search.sortRelevant" },
  { key: "new", label: "search.sortNew" },
  { key: "popular", label: "search.sortPopular" },
];
const DEBOUNCE_MS = 250;
/** How many tools show before "Tümünü gör". */
const TOOL_PREVIEW = 8;

/**
 * The search's part of the shared Filtre sheet (`ListFilterSheet`, via `ListControlRow`): the same chips the box makes, picked from
 * groups — Biçim, Tür, Kişi, Etiket, AI aracı — plus Sıralama. It edits the SAME `tokens` list live, so the chip strip under the
 * search box and the sheet never disagree; the query logic (`tokensToQuery`: groups AND, inside a group OR, tags all) is untouched.
 */
export function SearchFilterSections({
  tokens,
  onTokensChange,
  hideKinds,
  sort,
  onSortChange,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  /** Single-kind scopes (Keşfet → Promptlar): the post-type group would be pointless. */
  hideKinds?: boolean;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
}) {
  const { t } = useTranslation();
  const has = (token: SearchToken) => tokens.some((existing) => tokenKey(existing) === tokenKey(token));
  const toggle = (token: SearchToken) => onTokensChange(toggleToken(tokens, token));
  const picked = (kind: SearchToken["kind"]) => tokens.filter((token) => token.kind === kind);

  return (
    <>
      <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-secondary">{t("search.filterLogic")}</p>

      <SheetSection title={t("search.groupMedia")}>
        <SheetChips>
          {CONTENT_TYPE_IDS.map((type) => {
            const token: SearchToken = { kind: "media", type };
            return (
              <Chip key={type} icon={CONTENT_TYPE_META[type].icon} selected={has(token)} onClick={() => toggle(token)} className="h-10">
                {t(CONTENT_TYPE_META[type].labelKey)}
              </Chip>
            );
          })}
        </SheetChips>
      </SheetSection>

      {!hideKinds && (
        <SheetSection title={t("search.groupKind")}>
          <SheetChips>
            {ALL_KINDS.map((type) => {
              const token: SearchToken = { kind: "content", type };
              return (
                <Chip key={type} icon={KIND_ICON[type]} selected={has(token)} onClick={() => toggle(token)} className="h-10">
                  {t(KIND_LABEL[type])}
                </Chip>
              );
            })}
          </SheetChips>
        </SheetSection>
      )}

      <SheetSection title={t("search.groupUsers")}>
        <TokenFinder
          kind="user"
          selected={picked("user")}
          onToggle={toggle}
          placeholder={t("search.findPerson")}
          hint={t("search.hintAny")}
          find={async (text) => (await searchProfiles(text, 6)).map((user) => ({ kind: "user" as const, user }))}
        />
      </SheetSection>

      <SheetSection title={t("search.groupTags")}>
        <TokenFinder
          kind="tag"
          selected={picked("tag")}
          onToggle={toggle}
          placeholder={t("search.findTag")}
          hint={t("search.hintAll")}
          find={async (text) => (await searchTags(text, 8)).map((tag) => ({ kind: "tag" as const, tag }))}
          loadInitial={async () => (await fetchPopularTags(8)).map((tag) => ({ kind: "tag" as const, tag }))}
        />
      </SheetSection>

      <ToolSection selected={picked("tool")} onToggle={toggle} has={has} />

      <SheetSection title={t("toolbar.sort")}>
        <div role="radiogroup" aria-label={t("toolbar.sort")} className="space-y-1">
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={sort === item.key}
              onClick={() => onSortChange(item.key)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-label transition-colors",
                sort === item.key ? "bg-primary-soft font-semibold text-text" : "text-text-secondary hover:bg-surface-soft",
              )}
            >
              {t(item.label)}
              {sort === item.key && <Check size={16} className="text-primary" aria-hidden />}
            </button>
          ))}
        </div>
      </SheetSection>
    </>
  );
}

/** Small search field used by the sheet's groups. */
function FinderInput({ value, onChange, placeholder, label }: { value: string; onChange: (next: string) => void; placeholder: string; label: string }) {
  const id = useId();
  return (
    <div className="relative">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        className="h-11 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-small text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

/**
 * People / tags: the chips already picked (removable), then a field that asks the server as you type (bounded, debounced, stale answers
 * dropped). While the field is empty, `loadInitial` offers a few ready picks (popular tags).
 */
function TokenFinder({
  kind,
  selected,
  onToggle,
  placeholder,
  hint,
  find,
  loadInitial,
}: {
  kind: "user" | "tag";
  selected: SearchToken[];
  onToggle: (token: SearchToken) => void;
  placeholder: string;
  hint: string;
  find: (text: string) => Promise<SearchToken[]>;
  loadInitial?: () => Promise<SearchToken[]>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [found, setFound] = useState<SearchToken[]>([]);
  const [initial, setInitial] = useState<SearchToken[]>([]);
  const word = text.trim();
  const selectedKeys = new Set(selected.map(tokenKey));

  useEffect(() => {
    if (!loadInitial) return;
    let cancelled = false;
    void loadInitial().then((items) => {
      if (!cancelled) setInitial(items);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaded once per open sheet
  }, []);

  useEffect(() => {
    if (!word) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the previous answers when the field is emptied
      setFound([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const items = await find(word.replace(/^[@#]/, ""));
      if (!cancelled) setFound(items);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `find` is a stable closure per group
  }, [word]);

  const options = (word ? found : initial).filter((token) => !selectedKeys.has(tokenKey(token)));

  return (
    <div className="space-y-2.5">
      <p className="text-caption text-text-muted">{hint}</p>
      {selected.length > 0 && (
        <SheetChips>
          {selected.map((token) => {
            const { icon: Icon, label } = tokenChip(token, t);
            return (
              <span key={tokenKey(token)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary-soft pl-3 pr-1 text-label font-medium text-text">
                <Icon size={14} className="text-primary" aria-hidden />
                {label}
                <button
                  type="button"
                  aria-label={`${t("search.removeFilter")}: ${label}`}
                  onClick={() => onToggle(token)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
        </SheetChips>
      )}
      <FinderInput value={text} onChange={setText} placeholder={placeholder} label={placeholder} />
      {kind === "user" && options.length > 0 && (
        <ul className="overflow-hidden rounded-md border border-border-soft bg-surface">
          {options.map((token) =>
            token.kind === "user" ? (
              <li key={tokenKey(token)} className="border-b border-border-soft last:border-0">
                <button type="button" onClick={() => onToggle(token)} className="flex min-h-12 w-full items-center gap-2.5 px-3 text-left text-label text-text hover:bg-surface-soft">
                  <Avatar src={token.user.avatarUrl} alt={token.user.displayName} size={28} />
                  <span className="truncate">@{token.user.username}</span>
                  <span className="truncate text-caption text-text-muted">{token.user.displayName}</span>
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {kind === "tag" && options.length > 0 && (
        <SheetChips>
          {options.map((token) => (
            <Chip key={tokenKey(token)} selected={false} onClick={() => onToggle(token)} className="h-10">
              #{tokenChip(token, t).label}
            </Chip>
          ))}
        </SheetChips>
      )}
      {word && options.length === 0 && found.length === 0 && <p className="text-caption text-text-muted">{t("search.noMatch")}</p>}
    </div>
  );
}

/** AI tools: the first few as toggles, "Tümünü gör" opens the whole catalog with a filter field. */
function ToolSection({ selected, onToggle, has }: { selected: SearchToken[]; onToggle: (token: SearchToken) => void; has: (token: SearchToken) => boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const tools = AI_TOOLS.filter((tool) => tool.isActive);
  const filtered = searchTools(tools, text);
  const selectedIds = new Set(selected.map((token) => (token.kind === "tool" ? token.toolId : "")));
  const shown = expanded ? filtered : tools.filter((tool, index) => index < TOOL_PREVIEW || selectedIds.has(tool.id));
  return (
    <SheetSection title={t("search.groupTools")}>
      <div className="space-y-2.5">
        <p className="text-caption text-text-muted">{t("search.hintAny")}</p>
        {expanded && <FinderInput value={text} onChange={setText} placeholder={t("search.findTool")} label={t("search.findTool")} />}
        <SheetChips>
          {shown.map((tool) => {
            const token: SearchToken = { kind: "tool", toolId: tool.id };
            return (
              <Chip key={tool.id} selected={has(token)} onClick={() => onToggle(token)} className="h-10">
                {tool.name}
              </Chip>
            );
          })}
        </SheetChips>
        {expanded && filtered.length === 0 && <p className="text-caption text-text-muted">{t("search.noMatch")}</p>}
        {tools.length > TOOL_PREVIEW && (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="h-9 text-label font-semibold text-primary hover:text-primary-hover">
            {expanded ? t("search.showLess") : t("search.showAll", { count: tools.length })}
          </button>
        )}
      </div>
    </SheetSection>
  );
}
