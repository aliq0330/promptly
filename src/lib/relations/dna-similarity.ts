/**
 * DNA similarity — a SIMPLE, EXPLAINABLE "looks similar" signal between two
 * prompts, built only from what Prompt DNA really stores: a typed section
 * (lighting, style, camera …) whose `content` is free text written in the
 * user's own words. The free text is normalized (Turkish-safe folding,
 * comma/semicolon pieces, light stemming) before it is compared.
 *
 * It is NOT a quality score, NOT an accuracy claim and uses no AI, no
 * embeddings, no network: the same input always gives the same answer, and
 * every part of the result (which pieces matched, in which section) is
 * returned so the UI can show the REAL reason instead of a made-up one.
 *
 * Pure TypeScript — no React, no DOM, no `@/` aliases.
 */

import { foldText } from "../prompt-dna/text.ts";
import type { DnaSectionType } from "../prompt-dna/types.ts";
import type { DnaSimilarityLevel } from "./types.ts";

export interface DnaFeatureSection {
  type: DnaSectionType;
  content: string;
}

export interface DnaFeatureSet {
  sections: DnaFeatureSection[];
  /** Tag slugs. */
  tags: string[];
  category: string | null;
  subcategory: string | null;
}

export interface SharedSectionResult {
  type: DnaSectionType;
  /** The wording of the FIRST prompt's matched pieces (the user's own words, not our labels). */
  pieces: string[];
}

export interface DnaSimilarityResult {
  /** 0..1, rounded to 3 decimals. A "looks similar" signal only. */
  score: number;
  level: DnaSimilarityLevel;
  shared: SharedSectionResult[];
  sharedTags: string[];
  sameCategory: boolean;
  sameSubcategory: boolean;
}

/** Sections that describe the picture/idea itself weigh fully; format-like ones count for much less. */
const WEAK_TYPES: ReadonlySet<DnaSectionType> = new Set<DnaSectionType>(["output", "format", "language", "negative", "platform", "constraints", "custom"]);
const WEAK_WEIGHT = 0.4;

/** Below this the pair is not worth showing at all. */
export const MIN_SCORE = 0.15;
const HIGH = 0.6;
const MEDIUM = 0.35;

/** Cap on the metadata bonus (tags / category) so metadata can never create similarity by itself. */
const META_BONUS_CAP = 0.12;

const STOPWORDS = new Set(["and", "the", "bir", "ile", "for", "with", "from", "this", "that", "icin", "ama", "veya", "olan", "gibi", "daha", "cok"]);

interface Piece {
  raw: string;
  folded: string;
  tokens: string[];
}

/** Folded tokens (>= 3 chars, no stopwords) — the same recipe the database uses for `prompt_dna_sections.tokens`. */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const part of foldText(text).split(/[^\p{L}\p{N}]+/u)) {
    if (part.length >= 3 && !STOPWORDS.has(part)) out.add(part);
  }
  return [...out];
}

function splitPieces(content: string): Piece[] {
  const pieces: Piece[] = [];
  for (const raw of content.split(/[,;\n]/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const folded = foldText(trimmed).replace(/\s+/g, " ").trim();
    const tokens = tokenize(trimmed);
    if (folded) pieces.push({ raw: trimmed, folded, tokens });
  }
  return pieces;
}

/** "isik" ~ "isiklar": same stem when one is a prefix of the other, >= 4 shared letters, at most 3 extra. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3;
}

function piecesMatch(a: Piece, b: Piece): boolean {
  if (a.folded === b.folded) return true;
  if (a.tokens.length === 0 || b.tokens.length === 0) return false;
  const [small, large] = a.tokens.length <= b.tokens.length ? [a.tokens, b.tokens] : [b.tokens, a.tokens];
  const matched = small.filter((token) => large.some((other) => tokensMatch(token, other))).length;
  return matched / small.length >= 0.5;
}

interface TypeComparison {
  dice: number;
  matchedPieces: string[];
}

/** Greedy one-to-one pairing of the pieces of the same section type; Dice coefficient over piece counts. */
function compareType(a: Piece[], b: Piece[]): TypeComparison {
  const used = new Set<number>();
  const matchedPieces: string[] = [];
  for (const left of a) {
    const index = b.findIndex((right, i) => !used.has(i) && piecesMatch(left, right));
    if (index !== -1) {
      used.add(index);
      matchedPieces.push(left.raw);
    }
  }
  const total = a.length + b.length;
  return { dice: total === 0 ? 0 : (2 * matchedPieces.length) / total, matchedPieces };
}

function groupByType(sections: DnaFeatureSection[]): Map<DnaSectionType, Piece[]> {
  const map = new Map<DnaSectionType, Piece[]>();
  for (const section of sections) {
    const pieces = splitPieces(section.content);
    if (pieces.length === 0) continue;
    map.set(section.type, [...(map.get(section.type) ?? []), ...pieces]);
  }
  return map;
}

function levelFor(score: number): DnaSimilarityLevel {
  return score >= HIGH ? "high" : score >= MEDIUM ? "medium" : "low";
}

/**
 * Compares two prompts' DNA. Returns `null` when there is no real overlap in a
 * descriptive section (metadata alone never creates a suggestion) or when the
 * score is below `MIN_SCORE`.
 */
export function compareDna(a: DnaFeatureSet, b: DnaFeatureSet): DnaSimilarityResult | null {
  const left = groupByType(a.sections);
  const right = groupByType(b.sections);
  if (left.size === 0 || right.size === 0) return null;

  const types = new Set<DnaSectionType>([...left.keys(), ...right.keys()]);
  let weightedDice = 0;
  let totalWeight = 0;
  let strongShared = false;
  const shared: SharedSectionResult[] = [];

  for (const type of types) {
    const weight = WEAK_TYPES.has(type) ? WEAK_WEIGHT : 1;
    totalWeight += weight;
    const l = left.get(type);
    const r = right.get(type);
    if (!l || !r) continue;
    const { dice, matchedPieces } = compareType(l, r);
    if (matchedPieces.length === 0) continue;
    weightedDice += weight * dice;
    shared.push({ type, pieces: matchedPieces });
    if (!WEAK_TYPES.has(type)) strongShared = true;
  }
  if (!strongShared || totalWeight === 0) return null;

  const rightTags = new Set(b.tags);
  const sharedTags = a.tags.filter((tag) => rightTags.has(tag));
  const sameCategory = a.category !== null && a.category === b.category;
  const sameSubcategory = sameCategory && a.subcategory !== null && a.subcategory === b.subcategory;
  const bonus = Math.min(META_BONUS_CAP, sharedTags.length * 0.04 + (sameSubcategory ? 0.06 : sameCategory ? 0.03 : 0));

  const dnaScore = weightedDice / totalWeight;
  const score = Math.round(Math.min(1, dnaScore * (1 - META_BONUS_CAP) + bonus) * 1000) / 1000;
  if (score < MIN_SCORE) return null;

  // Most telling sections first: more matched pieces, descriptive before format-like.
  shared.sort((x, y) => Number(WEAK_TYPES.has(x.type)) - Number(WEAK_TYPES.has(y.type)) || y.pieces.length - x.pieces.length);
  return { score, level: levelFor(score), shared, sharedTags, sameCategory, sameSubcategory };
}

/** `{ type, tokens }` per section — the payload of `dna_similar_candidates()` (indexed, precomputed candidate lookup). */
export function sectionTokens(sections: DnaFeatureSection[]): { type: DnaSectionType; tokens: string[] }[] {
  const byType = new Map<DnaSectionType, Set<string>>();
  for (const section of sections) {
    const set = byType.get(section.type) ?? new Set<string>();
    for (const token of tokenize(section.content)) set.add(token);
    byType.set(section.type, set);
  }
  return [...byType.entries()]
    .filter(([, tokens]) => tokens.size > 0)
    .map(([type, tokens]) => ({ type, tokens: [...tokens].slice(0, 40) }));
}
