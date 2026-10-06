import type { DnaSectionType } from "./types.ts";
import { DNA_SECTION_TYPES } from "./types.ts";

export type DnaContentKind = "image" | "text" | "audio" | "video";

/**
 * Which sections make a "complete" DNA for each content type — drives the
 * "N / M bölüm" indicator and the order of the "+ DNA Bölümü Ekle" menu.
 * It is NOT a quality score and never limits what can be detected or added.
 */
export const DNA_RELEVANT_SECTIONS: Record<DnaContentKind, DnaSectionType[]> = {
  image: ["subject", "character", "location", "time", "weather", "atmosphere", "lighting", "camera", "composition", "style", "color", "output", "negative"],
  video: ["subject", "character", "location", "time", "atmosphere", "lighting", "camera", "motion", "style", "audio", "output", "negative"],
  audio: ["audio", "atmosphere", "style", "technology", "format", "language", "output", "negative"],
  text: ["task", "role", "audience", "tone", "platform", "format", "language", "constraints", "technology", "negative"],
};

export function relevantSections(contentType: string): DnaSectionType[] {
  return DNA_RELEVANT_SECTIONS[contentType as DnaContentKind] ?? DNA_RELEVANT_SECTIONS.image;
}

/** Fixed display order: the canonical type order from `types.ts`. */
export function sectionOrderIndex(type: DnaSectionType): number {
  return DNA_SECTION_TYPES.indexOf(type);
}

/** Types in the order the "add section" menu should show them: the content type's own first, then the rest, custom last. */
export function addMenuOrder(contentType: string): DnaSectionType[] {
  const relevant = relevantSections(contentType);
  const rest = DNA_SECTION_TYPES.filter((type) => type !== "custom" && !relevant.includes(type));
  return [...relevant, ...rest, "custom"];
}
