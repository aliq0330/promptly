/**
 * Prompt DNA — reconciling what the analyzer detects with what the user
 * already accepted. The raw prompt is always the source of truth; accepted
 * sections are separate metadata. Pure functions, no React.
 */

import { foldText } from "./text.ts";
import { relevantSections, sectionOrderIndex } from "./sections.ts";
import type { DnaAnalysis, DnaConfidence, DnaDetectedSection, DnaSection, DnaSectionType } from "./types.ts";

const RANK: Record<DnaConfidence, number> = { low: 0, medium: 1, high: 2 };

export const CONTENT_SEPARATOR = ", ";

export function itemsToContent(section: DnaDetectedSection): string {
  return section.items.map((item) => item.value).join(CONTENT_SEPARATOR);
}

/** Splits a section's saved content back into comparable, folded pieces. */
export function contentPieces(content: string): string[] {
  return content
    .split(/[,;\n]/)
    .map((piece) => foldText(piece).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Key used to remember a dismissed suggestion ("Yoksay"). */
export function suggestionKey(type: DnaSectionType, content: string): string {
  return `${type}:${contentPieces(content).join("|")}`;
}

let counter = 0;
export function newSectionId(): string {
  counter += 1;
  return `dna-${Date.now().toString(36)}-${counter}`;
}

export function sectionFromDetected(detected: DnaDetectedSection, orderIndex: number): DnaSection {
  return {
    id: newSectionId(),
    type: detected.type,
    label: null,
    content: itemsToContent(detected),
    source: "auto",
    confidence: detected.confidence,
    orderIndex,
  };
}

/** Sections sorted into the fixed canonical order (custom ones keep insertion order at the end). */
export function sortSections(sections: DnaSection[]): DnaSection[] {
  return [...sections]
    .sort((a, b) => sectionOrderIndex(a.type) - sectionOrderIndex(b.type) || a.orderIndex - b.orderIndex)
    .map((section, index) => ({ ...section, orderIndex: index }));
}

export interface DnaDiff {
  /** Detected types the user has no section for yet (full section). */
  newSections: DnaDetectedSection[];
  /** Detected items missing from a section the user already has (only the missing items). */
  additions: DnaDetectedSection[];
  /** Auto sections that no longer match the prompt: type no longer detected, or detected content changed. */
  staleAuto: Array<{ id: string; type: DnaSectionType; nextContent: string | null }>;
}

/**
 * Compares the current analysis with the accepted sections. Suggestions the
 * user dismissed are left out. Manual sections are never touched.
 */
export function diffAnalysis(analysis: DnaAnalysis, accepted: DnaSection[], dismissed: ReadonlySet<string>): DnaDiff {
  const newSections: DnaDetectedSection[] = [];
  const additions: DnaDetectedSection[] = [];
  const staleAuto: DnaDiff["staleAuto"] = [];

  for (const detected of analysis.sections) {
    const mine = accepted.filter((section) => section.type === detected.type);
    if (mine.length === 0) {
      if (!dismissed.has(suggestionKey(detected.type, itemsToContent(detected)))) newSections.push(detected);
      continue;
    }
    const have = new Set(mine.flatMap((section) => contentPieces(section.content)));
    const missing = detected.items.filter((item) => !have.has(foldText(item.value).replace(/\s+/g, " ").trim()));
    const fresh = missing.filter((item) => !dismissed.has(suggestionKey(detected.type, item.value)));
    if (fresh.length > 0) {
      additions.push({ ...detected, items: fresh, confidence: fresh.reduce<DnaConfidence>((best, item) => (RANK[item.confidence] > RANK[best] ? item.confidence : best), "low") });
    }
  }

  for (const section of accepted) {
    if (section.source !== "auto" || section.type === "custom") continue;
    const detected = analysis.sections.find((candidate) => candidate.type === section.type);
    if (!detected) {
      staleAuto.push({ id: section.id, type: section.type, nextContent: null });
      continue;
    }
    const next = itemsToContent(detected);
    if (contentPieces(next).join("|") !== contentPieces(section.content).join("|")) {
      staleAuto.push({ id: section.id, type: section.type, nextContent: next });
    }
  }
  return { newSections, additions, staleAuto };
}

export function diffIsEmpty(diff: DnaDiff): boolean {
  return diff.newSections.length === 0 && diff.additions.length === 0 && diff.staleAuto.length === 0;
}

/** A stable fingerprint of a diff — lets "Mevcut DNA'yı koru" hide the banner until something new appears. */
export function diffSignature(diff: DnaDiff): string {
  return [
    ...diff.newSections.map((section) => `n:${section.type}:${itemsToContent(section)}`),
    ...diff.additions.map((section) => `a:${section.type}:${itemsToContent(section)}`),
    ...diff.staleAuto.map((stale) => `s:${stale.id}:${stale.nextContent ?? "-"}`),
  ].join("\n");
}

/**
 * Applies a diff: adds new sections, appends missing items to existing ones
 * (they stay as they were — auto stays auto, manual stays manual), refreshes
 * stale auto sections and drops auto sections the prompt no longer supports.
 * Manual sections are never rewritten.
 */
export function applyDiff(sections: DnaSection[], diff: DnaDiff): DnaSection[] {
  let next = sections
    .filter((section) => !diff.staleAuto.some((stale) => stale.id === section.id && stale.nextContent === null))
    .map((section) => {
      const stale = diff.staleAuto.find((candidate) => candidate.id === section.id && candidate.nextContent !== null);
      return stale ? { ...section, content: stale.nextContent as string } : section;
    });
  for (const addition of diff.additions) {
    const target = next.find((section) => section.type === addition.type);
    if (target) {
      next = next.map((section) =>
        section.id === target.id ? { ...section, content: `${section.content}${CONTENT_SEPARATOR}${itemsToContent(addition)}` } : section,
      );
    }
  }
  for (const created of diff.newSections) next.push(sectionFromDetected(created, next.length));
  return sortSections(next);
}

/** "8 / 10 bölüm": how many of the content type's relevant sections have content. Not a quality score. */
export function completeness(sections: DnaSection[], contentType: string): { filled: number; total: number } {
  const relevant = relevantSections(contentType);
  const filled = relevant.filter((type) => sections.some((section) => section.type === type && section.content.trim() !== "")).length;
  return { filled, total: relevant.length };
}
