/**
 * Prompt DNA analyzer — the single entry point is `analyzePromptDna(prompt)`.
 *
 * Fully local and deterministic (no AI, no network): it folds the prompt,
 * pulls out negative phrases first (and masks them so they can't leak into
 * positive sections), then runs the data-driven rule table from `rules.ts`.
 * The raw prompt is never modified; matches are mapped back to the user's
 * own words by index.
 */

import {
  CLAUSE_BREAKERS,
  LANGUAGE_WORD_SET,
  DNA_RULES,
  LIST_JOINERS,
  NEGATIVE_BLOCK_MARKERS,
  NEGATIVE_PREFIX_MARKERS,
  NEGATIVE_SUFFIX_MARKERS,
  TASK_TRAILERS,
  TASK_VERBS_EN,
  TASK_VERBS_TR,
} from "./rules.ts";
import { cleanValue, findTerm, foldText, isWordChar } from "./text.ts";
import {
  DNA_SECTION_TYPES,
  type DnaAnalysis,
  type DnaConfidence,
  type DnaDetectedItem,
  type DnaDetectedSection,
  type DnaSectionType,
} from "./types.ts";

/** Anything beyond this is ignored (keeps analysis instant on pasted novels). */
export const MAX_ANALYZED_LENGTH = 20000;
const MAX_ITEMS_PER_SECTION = 8;
const MAX_VALUE_LENGTH = 140;

const RANK: Record<DnaConfidence, number> = { low: 0, medium: 1, high: 2 };

interface Candidate {
  section: DnaSectionType;
  key: string;
  start: number;
  end: number;
  confidence: DnaConfidence;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

function tokenize(folded: string, from: number, to: number): Token[] {
  const tokens: Token[] = [];
  const re = /[^\s,;]+|,|;/g;
  const slice = folded.slice(from, to);
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    tokens.push({ text: m[0], start: from + m.index, end: from + m.index + m[0].length });
  }
  return tokens;
}

const isSeparator = (token: Token) => token.text === "," || token.text === ";";

/** Last index of a sentence boundary (`. ! ? ; \n`) before `pos`, or -1. */
function sentenceStart(folded: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    const ch = folded[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      // "3.5" / "next.js" style dots are not sentence ends.
      if (ch === "." && isWordChar(folded[i - 1]) && isWordChar(folded[i + 1])) continue;
      return i + 1;
    }
  }
  return 0;
}

function sentenceEnd(folded: string, pos: number): number {
  for (let i = pos; i < folded.length; i++) {
    const ch = folded[i];
    if (ch === "!" || ch === "?" || ch === "\n") return i;
    if (ch === "." && !(isWordChar(folded[i - 1]) && isWordChar(folded[i + 1]))) return i;
  }
  return folded.length;
}

// --- negative extraction ------------------------------------------------------

interface NegativeHit {
  start: number;
  end: number;
  maskStart: number;
  maskEnd: number;
}

/** Every lexicon term, flattened once — used to tell a positive descriptor ("sinematik") from a negated item. */
const DESCRIPTOR_SECTIONS = new Set<DnaSectionType>(["style", "color", "lighting", "camera", "composition", "atmosphere", "time", "weather", "location", "character"]);
const LEXICON_TERMS: string[] = DNA_RULES.flatMap((rule) =>
  rule.kind === "lexicon" && DESCRIPTOR_SECTIONS.has(rule.section) ? rule.entries.flatMap((entry) => entry.terms) : [],
);

/** A candidate negated item that is really a positive descriptor, a number or a technical token — stop walking back. */
function looksPositive(phrase: string): boolean {
  if (/[\d/:]/.test(phrase)) return true;
  return LEXICON_TERMS.some((term) => findTerm(phrase, term).length > 0);
}

/** Walks backwards from a "… olmasın" style marker and collects the phrases it negates. */
function extractSuffixNegatives(folded: string, markerStart: number, markerEnd: number): NegativeHit[] {
  const boundary = sentenceStart(folded, markerStart);
  const tokens = tokenize(folded, boundary, markerStart);
  const found: Array<{ start: number; end: number }> = [];
  let i = tokens.length - 1;
  // The separator between the item being read and the one to its right (null for the nearest item).
  let rightSep: Token | null = null;
  while (i >= 0) {
    let j = i;
    const words: Token[] = [];
    while (j >= 0 && !isSeparator(tokens[j]) && !LIST_JOINERS.has(tokens[j].text)) {
      words.unshift(tokens[j]);
      j--;
    }
    const sep = j >= 0 ? tokens[j] : null; // the separator to the LEFT of this group
    while (words.length > 0 && (CLAUSE_BREAKERS.has(words[0].text) || words[0].text === "bir")) words.shift();
    if (words.length > 0) {
      const nearest = found.length === 0;
      // The nearest item may be a short phrase; further items must be tight list members:
      // one word when attached by a comma, up to three when attached by "ve"/"and".
      const limit = nearest ? 5 : rightSep && isSeparator(rightSep) ? 1 : 3;
      if (words.length > limit) {
        if (nearest) words.splice(0, words.length - 4);
        else break;
      }
      if (!nearest && looksPositive(words.map((word) => word.text).join(" "))) break;
      found.push({ start: words[0].start, end: words[words.length - 1].end });
    } else if (found.length === 0) {
      // Nothing but a separator directly before the marker — there is nothing to negate.
      break;
    }
    if (!sep) break;
    rightSep = sep;
    i = j - 1;
  }
  if (found.length === 0) return [];
  const earliest = found.reduce((min, hit) => Math.min(min, hit.start), markerStart);
  return found.map((hit) => ({ start: hit.start, end: hit.end, maskStart: earliest, maskEnd: markerEnd }));
}

function extractPrefixNegatives(folded: string, markerEnd: number, allListIsNegative: boolean): NegativeHit[] {
  const end = sentenceEnd(folded, markerEnd);
  const tokens = tokenize(folded, markerEnd, end);
  const hits: NegativeHit[] = [];
  let group: Token[] = [];
  const flush = (): boolean => {
    while (group.length > 0 && NEGATIVE_PREFIX_MARKERS.includes(group[0].text)) group.shift();
    const words = group;
    group = [];
    if (words.length === 0) return true;
    const isFirst = hits.length === 0;
    if (words.length > (isFirst ? 5 : allListIsNegative ? 6 : 2)) return false;
    hits.push({ start: words[0].start, end: words[words.length - 1].end, maskStart: markerEnd, maskEnd: words[words.length - 1].end });
    return hits.length < 8;
  };
  for (const token of tokens) {
    if (isSeparator(token)) {
      if (!flush()) break;
      continue;
    }
    if (CLAUSE_BREAKERS.has(token.text) && token.text !== "ve" && token.text !== "and") {
      flush();
      break;
    }
    group.push(token);
  }
  flush();
  return hits;
}

function extractNegatives(folded: string): { hits: NegativeHit[]; maskSpans: Array<[number, number]> } {
  const hits: NegativeHit[] = [];
  const maskSpans: Array<[number, number]> = [];

  // 1) "negative prompt: a, b, c" blocks — everything to the end of the paragraph.
  for (const marker of NEGATIVE_BLOCK_MARKERS) {
    for (const m of findTerm(folded, marker)) {
      let from = m.end;
      while (folded[from] === " " || folded[from] === ":" || folded[from] === "-") from++;
      let to = folded.indexOf("\n\n", from);
      if (to === -1) to = folded.length;
      for (const piece of tokenizeList(folded, from, to)) hits.push({ ...piece, maskStart: m.start, maskEnd: to });
      maskSpans.push([m.start, to]);
    }
  }

  // 2) Suffix markers: "yazı ve logo olmasın".
  for (const marker of NEGATIVE_SUFFIX_MARKERS) {
    for (const m of findTerm(folded, foldText(marker))) {
      const found = extractSuffixNegatives(folded, m.start, m.end);
      for (const hit of found) hits.push(hit);
      maskSpans.push([found.length > 0 ? found[0].maskStart : m.start, m.end]);
    }
  }

  // 3) Prefix markers: "no text, no logo", "without watermark".
  for (const marker of NEGATIVE_PREFIX_MARKERS) {
    for (const m of findTerm(folded, marker)) {
      const next = folded.slice(m.end).trimStart()[0];
      if (!next || !/[a-z]/.test(next)) continue; // "no 5", "no."
      const found = extractPrefixNegatives(folded, m.end, false);
      for (const hit of found) hits.push(hit);
      if (found.length > 0) maskSpans.push([m.start, found[found.length - 1].end]);
    }
  }
  return { hits, maskSpans };
}

/** Splits a "a, b; c" list region into trimmed pieces (each ≤ 6 words). */
function tokenizeList(folded: string, from: number, to: number): Array<{ start: number; end: number }> {
  const pieces: Array<{ start: number; end: number }> = [];
  let start = from;
  const push = (end: number) => {
    const seg = folded.slice(start, end);
    const lead = seg.length - seg.trimStart().length;
    const trimmed = seg.trim();
    if (trimmed && trimmed.split(/\s+/).length <= 6) pieces.push({ start: start + lead, end: start + lead + trimmed.length });
  };
  for (let i = from; i < to; i++) {
    const ch = folded[i];
    if (ch === "," || ch === ";" || ch === "\n") {
      push(i);
      start = i + 1;
    }
  }
  push(to);
  return pieces.slice(0, 12);
}

// --- task extraction ----------------------------------------------------------

function extractTasks(folded: string): Array<{ start: number; end: number }> {
  const tasks: Array<{ start: number; end: number }> = [];

  for (const verb of TASK_VERBS_TR) {
    for (const m of findTerm(folded, verb)) {
      // A Turkish imperative closes its clause: optional "lütfen", then punctuation/end.
      let after = m.end;
      while (folded[after] === " ") after++;
      for (const trailer of TASK_TRAILERS) {
        if (folded.startsWith(trailer, after) && !isWordChar(folded[after + trailer.length])) {
          after += trailer.length;
          while (folded[after] === " ") after++;
        }
      }
      const closesClause = after >= folded.length || /[.!?;,\n:]/.test(folded[after]);
      if (!closesClause) continue;
      const start = sentenceStart(folded, m.start);
      const lead = folded.slice(start, m.start).length - folded.slice(start, m.start).trimStart().length;
      const before = folded.slice(start + lead, m.start).trim();
      if (before.length < 3) continue; // a bare verb has no object — not a task description
      if (LANGUAGE_WORD_SET.has(before)) continue; // "Türkçe yaz" is a language instruction, not a task
      tasks.push({ start: start + lead, end: m.end });
    }
  }

  for (const verb of TASK_VERBS_EN) {
    for (const m of findTerm(folded, verb)) {
      const start = sentenceStart(folded, m.start);
      if (folded.slice(start, m.start).trim() !== "") continue; // English imperative opens its sentence
      const end = sentenceEnd(folded, m.end);
      if (end - m.start < verb.length + 4) continue;
      tasks.push({ start: m.start, end });
    }
  }
  return tasks.sort((a, b) => a.start - b.start).slice(0, 3);
}

// --- value helpers ------------------------------------------------------------

function valueOf(original: string, start: number, end: number): string {
  let value = cleanValue(original.slice(start, end));
  if (value.length > MAX_VALUE_LENGTH) {
    value = value.slice(0, MAX_VALUE_LENGTH);
    const lastSpace = value.lastIndexOf(" ");
    if (lastSpace > 40) value = value.slice(0, lastSpace);
    value = `${value}…`;
  }
  return value;
}

const maskOut = (text: string, spans: Array<[number, number]>) => {
  if (spans.length === 0) return text;
  const chars = text.split("");
  for (const [from, to] of spans) for (let i = Math.max(0, from); i < Math.min(chars.length, to); i++) chars[i] = " ";
  return chars.join("");
};

const overlaps = (a: [number, number], start: number, end: number) => start < a[1] && end > a[0];

// --- public API ---------------------------------------------------------------

export function analyzePromptDna(prompt: string): DnaAnalysis {
  const original = prompt.slice(0, MAX_ANALYZED_LENGTH);
  if (original.trim().length === 0) return { sections: [] };
  const folded = foldText(original);

  const candidates: Candidate[] = [];
  const add = (c: Candidate) => {
    if (c.end > c.start) candidates.push(c);
  };

  // 1) Negatives first; their spans are masked for every positive rule.
  const { hits, maskSpans } = extractNegatives(folded);
  for (const hit of hits) {
    const key = foldText(cleanValue(original.slice(hit.start, hit.end)));
    if (key.length >= 2) add({ section: "negative", key, start: hit.start, end: hit.end, confidence: "high" });
  }
  const masked = maskOut(folded, maskSpans);

  // 2) The data-driven table (constraints run first and claim their spans).
  const claimed: Array<[number, number]> = [];
  for (const rule of DNA_RULES) {
    if (rule.kind === "lexicon") {
      for (const entry of rule.entries) {
        for (const term of entry.terms) {
          for (const m of findTerm(masked, term)) {
            add({ section: rule.section, key: entry.key, start: m.start, end: m.end, confidence: rule.confidence });
          }
        }
      }
      continue;
    }
    const re = new RegExp(rule.source, `${rule.flags ?? ""}gd`);
    for (const m of masked.matchAll(re)) {
      if (rule.reject?.(masked, m)) continue;
      let start = m.index ?? 0;
      let end = start + m[0].length;
      if (rule.group !== undefined && m.indices?.[rule.group]) {
        [start, end] = m.indices[rule.group];
      }
      if (rule.skipIfClaimed && claimed.some((span) => overlaps(span, start, end))) continue;
      const key = foldText(cleanValue(original.slice(start, end)));
      if (key.length < 2) continue;
      if (rule.claims) claimed.push([start, end]);
      add({ section: rule.section, key, start, end, confidence: rule.confidence });
    }
  }

  // 3) Tasks (sentence-level, so they get their own pass).
  for (const span of extractTasks(masked)) {
    const key = foldText(cleanValue(original.slice(span.start, span.end))).slice(0, 80);
    if (key.length >= 6) add({ section: "task", key, start: span.start, end: span.end, confidence: "medium" });
  }

  return { sections: buildSections(original, candidates) };
}

function buildSections(original: string, candidates: Candidate[]): DnaDetectedSection[] {
  const bySection = new Map<DnaSectionType, Candidate[]>();
  for (const c of candidates) {
    const list = bySection.get(c.section) ?? [];
    list.push(c);
    bySection.set(c.section, list);
  }

  const sections: DnaDetectedSection[] = [];
  for (const type of DNA_SECTION_TYPES) {
    const list = bySection.get(type);
    if (!list || list.length === 0) continue;

    // Dedupe by key (keep the earliest, with the best confidence seen).
    const byKey = new Map<string, Candidate>();
    for (const c of list) {
      const prev = byKey.get(c.key);
      if (!prev) byKey.set(c.key, c);
      else if (RANK[c.confidence] > RANK[prev.confidence]) byKey.set(c.key, { ...c, start: prev.start, end: prev.end });
    }
    let unique = [...byKey.values()];

    // Drop spans fully covered by a longer span of the same section ("neon" inside "neon ışıklar").
    // Two entries that cover exactly the same words ("svelte*" and "sveltekit") keep one: the higher
    // confidence, then the earlier one — never both dropped.
    unique = unique.filter(
      (a, ai) =>
        !unique.some(
          (b, bi) =>
            b !== a &&
            b.start <= a.start &&
            b.end >= a.end &&
            (b.start < a.start ||
              b.end > a.end ||
              RANK[b.confidence] > RANK[a.confidence] ||
              (RANK[b.confidence] === RANK[a.confidence] && bi < ai)),
        ),
    );
    unique.sort((a, b) => a.start - b.start);

    const items: DnaDetectedItem[] = [];
    const seenValues = new Set<string>();
    for (const c of unique) {
      const value = valueOf(original, c.start, c.end);
      const norm = foldText(value);
      if (!value || seenValues.has(norm)) continue;
      seenValues.add(norm);
      items.push({ value, confidence: c.confidence, start: c.start, end: c.end });
      if (items.length >= MAX_ITEMS_PER_SECTION) break;
    }
    if (items.length === 0) continue;
    const confidence = items.reduce<DnaConfidence>((best, item) => (RANK[item.confidence] > RANK[best] ? item.confidence : best), "low");
    sections.push({ type, items, confidence });
  }
  return sections;
}
