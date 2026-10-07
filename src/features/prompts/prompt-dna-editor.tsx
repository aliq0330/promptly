"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Dna, Pencil, Plus, Trash2, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/language-provider";
import { analyzePromptDna } from "@/lib/prompt-dna/analyzer";
import {
  applyDiff,
  completeness,
  diffAnalysis,
  diffIsEmpty,
  diffSignature,
  itemsToContent,
  newSectionId,
  sectionFromDetected,
  sortSections,
  suggestionKey,
} from "@/lib/prompt-dna/merge";
import { addMenuOrder } from "@/lib/prompt-dna/sections";
import type { DnaAnalysis, DnaDetectedSection, DnaSection, DnaSectionType } from "@/lib/prompt-dna/types";
import { cn } from "@/lib/utils";
import { DNA_ICONS, dnaLabelKey, dnaSectionLabel } from "./dna-section-meta";

const ANALYZE_DEBOUNCE_MS = 400;
const MIN_PROMPT_LENGTH = 8;
const EMPTY_ANALYSIS: DnaAnalysis = { sections: [] };

interface EditState {
  id: string;
  label: string;
  content: string;
  /** A section created through "+ DNA Bölümü Ekle" that hasn't got content yet — cancelling removes it. */
  isNew: boolean;
}

/**
 * Prompt DNA in the create form. The raw prompt is always the source of
 * truth; this panel only holds metadata derived from it. Detected sections
 * are SUGGESTIONS kept in local state until the user accepts them — nothing
 * is written to the database while typing (the form saves accepted sections
 * together with the prompt). Detection is the local rule engine in
 * `src/lib/prompt-dna` — no AI, no network.
 */
export function PromptDnaEditor({
  promptText,
  contentType,
  sections,
  onChange,
  selectedId = null,
  onSelectSection,
}: {
  promptText: string;
  contentType: string;
  sections: DnaSection[];
  onChange: (sections: DnaSection[]) => void;
  /** Studio only: lets a section card be selected (e.g. to highlight its words in the prompt). */
  selectedId?: string | null;
  onSelectSection?: (section: DnaSection | null) => void;
}) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<DnaAnalysis>(EMPTY_ANALYSIS);
  const [manualRun, setManualRun] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [keptSignature, setKeptSignature] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Debounced local analysis (the raw prompt is never touched).
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnalysis(promptText.trim().length >= MIN_PROMPT_LENGTH ? analyzePromptDna(promptText) : EMPTY_ANALYSIS);
    }, ANALYZE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [promptText]);

  const diff = useMemo(() => diffAnalysis(analysis, sections, dismissed), [analysis, sections, dismissed]);
  const signature = useMemo(() => diffSignature(diff), [diff]);
  const hasSections = sections.length > 0;
  const showChangedBanner = hasSections && !diffIsEmpty(diff) && signature !== keptSignature;
  const progress = completeness(sections, contentType);
  const usedTypes = new Set(sections.map((section) => section.type));

  const label = (type: DnaSectionType) => t(dnaLabelKey(type));

  function generate() {
    setAnalysis(promptText.trim() ? analyzePromptDna(promptText) : EMPTY_ANALYSIS);
    setManualRun(true);
    setKeptSignature(null);
  }

  function acceptOne(detected: DnaDetectedSection, thenEdit = false) {
    const section = sectionFromDetected(detected, sections.length);
    onChange(sortSections([...sections, section]));
    if (thenEdit) setEditing({ id: section.id, label: "", content: section.content, isNew: false });
  }

  function dismiss(detected: DnaDetectedSection) {
    setDismissed(new Set([...dismissed, suggestionKey(detected.type, itemsToContent(detected))]));
  }

  function startAdd(type: DnaSectionType) {
    const id = newSectionId();
    onChange(sortSections([...sections, { id, type, label: null, content: "", source: "manual", confidence: null, orderIndex: sections.length }]));
    setEditing({ id, label: "", content: "", isNew: true });
    setMenuOpen(false);
  }

  function saveEdit() {
    if (!editing) return;
    const content = editing.content.trim();
    if (!content) {
      onChange(sections.filter((section) => section.id !== editing.id));
    } else {
      onChange(
        sortSections(
          sections.map((section) =>
            section.id === editing.id
              ? {
                  ...section,
                  content,
                  label: section.type === "custom" ? editing.label.trim() || null : null,
                  // Any hand edit makes the section the user's own: "Güncelle" will never overwrite it.
                  source: content !== section.content || section.type === "custom" ? "manual" : section.source,
                }
              : section,
          ),
        ),
      );
    }
    setEditing(null);
  }

  function cancelEdit() {
    if (editing?.isNew) onChange(sections.filter((section) => section.id !== editing.id));
    setEditing(null);
  }

  const showEmptyAfterRun = manualRun && !hasSections && diff.newSections.length === 0;

  return (
    <div className="space-y-3" data-dna-editor>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {hasSections ? (
            <div className="flex items-center gap-2.5">
              <span className="text-label font-medium text-text-secondary">{t("dna.completeness", { filled: progress.filled, total: progress.total })}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border-soft" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-soft" style={{ width: `${(progress.filled / Math.max(1, progress.total)) * 100}%` }} />
              </span>
            </div>
          ) : (
            <p className="text-caption text-text-muted">{t("dna.note")}</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={generate} disabled={!promptText.trim()}>
          <WandSparkles size={14} />
          {t("dna.generate")}
        </Button>
      </div>

      {/* Suggestions (nothing accepted yet) */}
      {!hasSections && diff.newSections.length > 0 && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary-soft/40 p-3" role="region" aria-label={t("dna.detectedHeading")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-label font-semibold text-text">
              <Dna size={14} className="text-primary" />
              {t("dna.detectedHeading")} ({diff.newSections.length})
            </p>
            <Button type="button" size="sm" onClick={() => onChange(applyDiff(sections, diff))}>
              <Check size={14} />
              {t("dna.addAll")}
            </Button>
          </div>
          <ul className="space-y-2">
            {diff.newSections.map((detected) => {
              const Icon = DNA_ICONS[detected.type];
              return (
                <li key={detected.type} className="rounded-md border border-border-soft bg-surface p-2.5">
                  <div className="flex items-start gap-2.5">
                    <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-label font-semibold text-text">
                        {label(detected.type)}
                        {detected.confidence === "low" && <Badge variant="neutral">{t("dna.suggestedBadge")}</Badge>}
                      </p>
                      <p className="mt-0.5 break-words text-small text-text-secondary">{itemsToContent(detected)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => dismiss(detected)}>
                      {t("dna.ignore")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => acceptOne(detected, true)}>
                      {t("common.edit")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => acceptOne(detected)}>
                      {t("dna.add")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!hasSections && diff.newSections.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-surface-soft/50 p-3 text-small text-text-muted">
          {showEmptyAfterRun ? t("dna.nothingDetected") : t("dna.emptyHint")}
        </p>
      )}

      {/* The prompt changed after sections were accepted */}
      {showChangedBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary-soft/40 p-3" role="status">
          <p className="min-w-0 text-small text-text">{t("dna.changedBanner")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setKeptSignature(signature)}>
              {t("dna.keepCurrent")}
            </Button>
            <Button type="button" size="sm" onClick={() => onChange(applyDiff(sections, diff))}>
              {t("dna.update")}
            </Button>
          </div>
        </div>
      )}

      {/* Accepted sections */}
      {hasSections && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sections.map((section) => {
            const Icon = DNA_ICONS[section.type];
            const heading = dnaSectionLabel(section, t);
            const isEditing = editing?.id === section.id;
            return (
              <li
                key={section.id}
                data-dna-section={section.id}
                className={cn("min-w-0 rounded-md border bg-surface p-3", isEditing ? "border-primary/50 sm:col-span-2" : selectedId === section.id ? "border-primary bg-primary-soft/40" : "border-border-soft")}
              >
                {isEditing && editing ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-label font-semibold text-text">
                      <Icon size={14} className="text-text-muted" aria-hidden="true" />
                      {section.type === "custom" ? t("dna.section.custom") : heading}
                    </p>
                    {section.type === "custom" && (
                      <input
                        value={editing.label}
                        onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                        maxLength={60}
                        placeholder={t("dna.customLabelPlaceholder")}
                        aria-label={t("dna.customLabel")}
                        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text"
                      />
                    )}
                    <textarea
                      value={editing.content}
                      onChange={(event) => setEditing({ ...editing, content: event.target.value })}
                      rows={2}
                      maxLength={2000}
                      autoFocus
                      placeholder={t("dna.contentPlaceholder")}
                      aria-label={t("dna.contentLabel")}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                        {t("common.cancel")}
                      </Button>
                      <Button type="button" size="sm" onClick={saveEdit}>
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                    {(() => {
                      const body = (
                        <>
                          <p className="flex flex-wrap items-center gap-1.5 text-label font-semibold text-text">
                            {heading}
                            {section.source === "auto" && section.confidence === "low" && <Badge variant="neutral">{t("dna.suggestedBadge")}</Badge>}
                            {section.source === "manual" && section.type !== "custom" && <Badge variant="neutral">{t("dna.editedBadge")}</Badge>}
                          </p>
                          <p className="mt-0.5 break-words text-small text-text-secondary">{section.content}</p>
                        </>
                      );
                      return onSelectSection ? (
                        <button
                          type="button"
                          onClick={() => onSelectSection(selectedId === section.id ? null : section)}
                          aria-pressed={selectedId === section.id}
                          className="min-h-9 min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="min-w-0 flex-1">{body}</div>
                      );
                    })()}
                    <div className="-my-1 -mr-1 flex shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing({ id: section.id, label: section.label ?? "", content: section.content, isNew: false })}
                        aria-label={t("dna.editAria", { label: heading })}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(sections.filter((candidate) => candidate.id !== section.id))}
                        aria-label={t("dna.removeAria", { label: heading })}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* + DNA Bölümü Ekle */}
      <div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="dna-add-menu"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-label font-medium text-primary hover:bg-primary-soft"
        >
          <Plus size={14} />
          {t("dna.addSection")}
          <ChevronDown size={14} className={cn("transition-transform duration-200", menuOpen && "rotate-180")} />
        </button>
        <Collapsible open={menuOpen} id="dna-add-menu">
          <div className="flex flex-wrap gap-1.5 pt-2">
            {addMenuOrder(contentType).map((type) => {
              const Icon = DNA_ICONS[type];
              const taken = type !== "custom" && usedTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={taken}
                  onClick={() => startAdd(type)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon size={13} aria-hidden="true" />
                  {label(type)}
                </button>
              );
            })}
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
