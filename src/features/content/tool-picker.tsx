"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_IDS, type ContentTypeId } from "@/lib/content-taxonomy";
import {
  MAX_TOOLS,
  findTool,
  getToolsForContentType,
  makeToolRef,
  parseToolRef,
  resolveToolRefs,
  searchTools,
} from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Optional, multi-select (max 3) "recommended tool/model" field shared by the
 * prompt, prompt request and generator forms. Selected tools show as chips;
 * "Ekle" opens a searchable list (dialog on desktop, bottom sheet on mobile
 * via `Modal`) filtered by content type. Metadata only — never enforced.
 */
export function ToolPicker({
  label,
  value,
  onChange,
  contentType,
  contentTypes,
  category,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** One content type (forms) — or several (workflows, via `contentTypes`, which wins). */
  contentType?: ContentTypeId;
  contentTypes?: ContentTypeId[];
  category?: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolved = resolveToolRefs(value);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text">
        {label} <span className="text-text-muted">({t("common.optional")})</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {resolved.map((item) => (
          <span
            key={item.ref}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-primary-soft pl-3 pr-1.5 text-label font-medium text-text"
          >
            {item.label}
            <button
              type="button"
              aria-label={t("common.remove")}
              onClick={() => onChange(value.filter((ref) => ref !== item.ref))}
              className="rounded-full p-1 text-text-muted hover:bg-surface hover:text-text"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {resolved.length < MAX_TOOLS && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 text-label font-medium text-text-secondary hover:border-text hover:text-text"
          >
            <Plus size={14} />
            {t("tool.add")}
          </button>
        )}
      </div>
      {open && (
        <ToolPickerModal
          initial={value}
          contentTypes={contentTypes?.length ? contentTypes : contentType ? [contentType] : []}
          category={category}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ToolPickerModal({
  initial,
  contentTypes,
  category,
  onClose,
  onApply,
}: {
  initial: string[];
  contentTypes: ContentTypeId[];
  category?: string | null;
  onClose: () => void;
  onApply: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  // No type chosen yet (a new workflow) → every type's tools, so the field is usable immediately.
  const tools = useMemo(() => {
    const types = contentTypes.length ? contentTypes : CONTENT_TYPE_IDS;
    const seen = new Set<string>();
    const all = types
      .flatMap((type) => getToolsForContentType(type, category))
      .filter((tool) => (seen.has(tool.id) ? false : (seen.add(tool.id), true)));
    return searchTools(all, query);
  }, [contentTypes, category, query]);
  // Keep already-selected tools that don't match the current type visible so they can be removed.
  const orphan = draft.filter((ref) => !tools.some((tool) => tool.id === parseToolRef(ref).toolId));
  const atMax = draft.length >= MAX_TOOLS;

  function toggle(toolId: string) {
    const existing = draft.find((ref) => parseToolRef(ref).toolId === toolId);
    if (existing) setDraft(draft.filter((ref) => ref !== existing));
    else if (!atMax) setDraft([...draft, makeToolRef(toolId)]);
  }
  function setModel(toolId: string, modelId: string | null) {
    setDraft(draft.map((ref) => (parseToolRef(ref).toolId === toolId ? makeToolRef(toolId, modelId) : ref)));
  }

  return (
    <Modal onClose={onClose} labelledBy="tool-picker-title">
      <div
        className="flex h-[80dvh] max-h-[85dvh] w-full max-w-lg flex-col sm:h-[600px] rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="tool-picker-title" className="text-base font-semibold text-text">
              {t("tool.pickerTitle")}
            </h2>
            <p className="text-xs text-text-muted">{t("tool.maxHint", { max: String(MAX_TOOLS) })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tool.search")}
            aria-label={t("tool.search")}
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
        <ul className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {tools.length === 0 && orphan.length === 0 && (
            <li className="py-6 text-center text-sm text-text-muted">{t("tool.noResults")}</li>
          )}
          {[...tools.map((tool) => tool.id), ...orphan.map((ref) => parseToolRef(ref).toolId)].map((toolId) => {
            const tool = findTool(toolId);
            if (!tool) return null;
            const selectedRef = draft.find((ref) => parseToolRef(ref).toolId === toolId);
            const selected = Boolean(selectedRef);
            const disabled = !selected && atMax;
            const modelId = selectedRef ? parseToolRef(selectedRef).modelId : null;
            return (
              <li key={toolId} className="rounded-md border border-border-soft">
                <button
                  type="button"
                  onClick={() => toggle(toolId)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                    selected ? "bg-primary-soft" : "hover:bg-surface-soft",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                    )}
                  >
                    {selected && <Check size={12} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-text">{tool.name}</span>
                    <span className="ml-2 text-xs text-text-muted">{tool.provider}</span>
                  </span>
                </button>
                {selected && tool.models.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2 pl-11">
                    {tool.models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        aria-pressed={modelId === model.id}
                        onClick={() => setModel(toolId, modelId === model.id ? null : model.id)}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-xs font-medium",
                          modelId === model.id
                            ? "border-text bg-text text-background"
                            : "border-border text-text-secondary hover:border-border-strong",
                        )}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => onApply(draft)}>
            {t("common.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
