/**
 * Prompt DNA — shared types. Pure TypeScript, no React/DOM, so the rule
 * engine can be unit-tested with plain `node --test`.
 */

export const DNA_SECTION_TYPES = [
  "subject",
  "character",
  "location",
  "time",
  "weather",
  "atmosphere",
  "lighting",
  "camera",
  "composition",
  "style",
  "color",
  "motion",
  "audio",
  "output",
  "negative",
  "technology",
  "task",
  "role",
  "constraints",
  "audience",
  "tone",
  "platform",
  "format",
  "language",
  "custom",
] as const;

export type DnaSectionType = (typeof DNA_SECTION_TYPES)[number];

export type DnaConfidence = "high" | "medium" | "low";

/** One detected phrase inside the raw prompt (offsets are into the analyzed text). */
export interface DnaDetectedItem {
  value: string;
  confidence: DnaConfidence;
  start: number;
  end: number;
}

export interface DnaDetectedSection {
  type: DnaSectionType;
  items: DnaDetectedItem[];
  /** Highest confidence among the items. */
  confidence: DnaConfidence;
}

export interface DnaAnalysis {
  sections: DnaDetectedSection[];
}

/** A section the user accepted (or added by hand) — the metadata that is saved with a prompt. */
export interface DnaSection {
  id: string;
  type: DnaSectionType;
  /** Only meaningful for `custom`; standard types render their translated label. */
  label: string | null;
  content: string;
  source: "auto" | "manual";
  confidence: DnaConfidence | null;
  orderIndex: number;
}
