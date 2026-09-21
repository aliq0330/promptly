import { normalizeTagLabel } from "./tag-normalize";
import { CANDIDATE_TAG_LABELS } from "./tag-candidates";
import type { Tag } from "@/types";

/**
 * Live, deterministic tag analyzer — NOT an AI integration. This project has
 * no AI/LLM SDK dependency at all (confirmed by inspecting package.json
 * before writing this file, per CLAUDE.md §19's explicit instruction: "if no
 * AI service exists, build a first version using catalog matching, keyword/
 * synonym matching, and a reasonable simple algorithm... do not pretend an
 * AI integration exists when it doesn't"). This module is that honest,
 * non-AI first version: it matches the current title+content against (a) a
 * hand-authored Turkish/English synonym map for the platform's curated seed
 * tags, and (b) every OTHER catalog tag's own label as a direct substring —
 * so a tag any user has already created (via `get_or_create_tag`) becomes
 * matchable for future analyses too, without needing hand-curation for
 * every new tag. It deliberately never invents a brand-new tag name out of
 * free text — only tags that already exist in the catalog can ever be
 * auto-suggested; creating a genuinely new tag stays an explicit user
 * action (the manual tag field's "+ … etiketini oluştur"), matching §13's
 * "yeni etiket önerisi yalnızca uygun bir katalog etiketi yoksa" rule
 * without risking junk auto-generated tag names.
 */

export interface TagAnalysisResult {
  /** High-confidence matches — safe to auto-add without asking first. */
  automatic: Tag[];
  /** Lower-confidence matches — shown for the user to pick, never force-added. */
  suggested: Tag[];
}

interface SynonymRule {
  /** Must match an existing catalog tag's slug for this rule to ever apply. */
  slug: string;
  /** Turkish/English keywords or short phrases that imply this tag. */
  keywords: string[];
}

/**
 * Curated only for the 20 seed tags (supabase/migrations/
 * 20260919120600_seed_tags.sql) — a hand-authored starting point, not
 * exhaustive. Any OTHER tag (seed or user-created) is still matchable via
 * its own label as a plain substring (see `matchByOwnLabel` below), so the
 * system stays useful as the catalog grows without needing this list
 * maintained forever.
 */
const SYNONYM_RULES: SynonymRule[] = [
  { slug: "ai-sanat", keywords: ["ai sanat", "yapay zeka sanat", "ai art", "ai generated", "yapay zeka"] },
  { slug: "portre", keywords: ["portre", "portrait", "yüz", "face", "insan yuzu"] },
  { slug: "fantastik", keywords: ["fantastik", "fantasy", "ejderha", "buyu", "epic fantasy"] },
  { slug: "siberpunk", keywords: ["siberpunk", "cyberpunk", "neon sehir", "distopya"] },
  { slug: "anime", keywords: ["anime", "manga", "chibi"] },
  { slug: "mimari", keywords: ["mimari", "architecture", "bina", "ic mekan", "dis mekan"] },
  { slug: "manzara", keywords: ["manzara", "landscape", "dag", "orman", "gun batimi", "doga manzarasi"] },
  { slug: "karakter-tasarimi", keywords: ["karakter tasarimi", "character design"] },
  { slug: "minimalist", keywords: ["minimalist", "minimalism", "sade tasarim", "az ogeli"] },
  { slug: "soyut", keywords: ["soyut", "abstract"] },
  { slug: "3d-render", keywords: ["3d render", "3d", "blender", "cinema 4d", "octane render", "c4d"] },
  { slug: "neon", keywords: ["neon isik", "neon light", "neon"] },
  { slug: "surreal", keywords: ["surreal", "surrealist", "ruya gibi"] },
  { slug: "uzay", keywords: ["uzay", "space", "galaksi", "nebula", "yildizlar"] },
  { slug: "retro", keywords: ["retro", "vintage", "eski moda"] },
  { slug: "yazarlik", keywords: ["yazarlik", "makale", "hikaye", "roman", "senaryo yazimi"] },
  { slug: "siir", keywords: ["siir", "poem", "poetry"] },
  { slug: "video-uretim", keywords: ["video", "sinematik", "cinematic", "reklam filmi", "kisa film"] },
  { slug: "kodlama", keywords: ["kod", "kodlama", "code", "yazilim", "programlama", "fonksiyon", "script"] },
  { slug: "muzik-uretim", keywords: ["muzik", "music", "beste", "melodi", "sarki sozu"] },
  { slug: "urun-fotografciligi", keywords: ["urun fotografciligi", "product photography", "urun cekimi", "studyo cekimi"] },
  { slug: "reklam", keywords: ["reklam", "advertising", "advertisement", "pazarlama"] },
  { slug: "logo-tasarimi", keywords: ["logo tasarimi", "logo design", "marka logosu"] },
  { slug: "marka", keywords: ["marka", "branding", "brand"] },
  { slug: "gercekci", keywords: ["gercekci", "realistic", "fotogerceci", "photorealistic"] },
  { slug: "illustrasyon", keywords: ["illustrasyon", "illustration", "cizim"] },
  { slug: "cizgi-film", keywords: ["cizgi film", "cartoon"] },
  { slug: "moda", keywords: ["moda", "fashion", "kiyafet tasarimi"] },
  { slug: "egitim", keywords: ["egitim", "education", "ders anlatimi", "ogretici"] },
  { slug: "chatgpt", keywords: ["chatgpt", "gpt-4", "openai"] },
  { slug: "midjourney", keywords: ["midjourney", "mj"] },
  { slug: "stable-diffusion", keywords: ["stable diffusion", "sdxl"] },
  { slug: "dalle", keywords: ["dall-e", "dalle"] },
];

const STOPWORD_NORMALIZED = new Set([
  "ve", "ile", "bir", "bu", "su", "the", "a", "an", "for", "and", "of", "in", "on", "icin", "gibi",
]);

/** Turkish-aware lowercasing/transliteration that KEEPS word boundaries (spaces) — for phrase matching, unlike `normalizeTagLabel`'s slug output. */
function normalizeTextForMatching(text: string): string {
  return normalizeTagLabel(text).replace(/-+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeWordMatch(haystack: string, phrase: string): boolean {
  if (!phrase || STOPWORD_NORMALIZED.has(phrase)) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`);
  return pattern.test(haystack);
}

/**
 * Turkish is agglutinative — a tag's own label rarely appears in text
 * unmodified ("reklam" vs. a sentence's "reklamı"/"reklamların"). A cheap,
 * honest stand-in for real stemming: treat a long-enough label as a match
 * when it's the literal PREFIX of some word in the text, not just an exact
 * whole word. Deliberately weaker evidence than an exact whole-word match
 * (see the score difference in `analyzeContent`) — a coincidental short
 * prefix match (e.g. "ai" prefixing "aile") would be noise, so this only
 * applies to labels of 5+ normalized characters.
 */
function hasPrefixWordMatch(haystack: string, word: string): boolean {
  if (!word || word.length < 5 || STOPWORD_NORMALIZED.has(word)) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(word)}[a-z0-9]*(\\s|$)`);
  return pattern.test(haystack);
}

interface ScoredTag {
  tag: Tag;
  score: number;
}

/**
 * Analyzes a title+content pair against the real, currently-loaded tag
 * catalog and returns two confidence tiers. Pure and synchronous — no
 * network call, so there's no server round trip to debounce/cancel; the
 * caller (`useTagPicker`) still debounces re-*invocation* of this function
 * so it doesn't run on literally every keystroke (CLAUDE.md §3/§20).
 */
export function analyzeContent(title: string, content: string, catalog: Tag[]): TagAnalysisResult {
  const combinedText = `${title} ${content}`.trim();
  if (!combinedText || catalog.length === 0) return { automatic: [], suggested: [] };

  const normalizedText = normalizeTextForMatching(combinedText);
  if (!normalizedText) return { automatic: [], suggested: [] };

  const scores = new Map<string, ScoredTag>();
  const bump = (tag: Tag, amount: number) => {
    const existing = scores.get(tag.slug);
    if (existing) {
      existing.score += amount;
    } else {
      scores.set(tag.slug, { tag, score: amount });
    }
  };

  const catalogBySlug = new Map(catalog.map((tag) => [tag.slug, tag]));

  // (a) hand-authored synonym rules — strongest signal.
  for (const rule of SYNONYM_RULES) {
    const tag = catalogBySlug.get(rule.slug);
    if (!tag) continue;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeTextForMatching(keyword);
      if (hasWholeWordMatch(normalizedText, normalizedKeyword)) {
        bump(tag, 3);
        break;
      }
    }
  }

  // (b) any catalog tag's own label as a direct, whole-word match — makes
  // future user-created tags matchable without needing a synonym rule.
  for (const tag of catalog) {
    const normalizedLabel = normalizeTextForMatching(tag.label);
    if (!normalizedLabel || normalizedLabel.length < 3) continue;
    if (hasWholeWordMatch(normalizedText, normalizedLabel)) {
      bump(tag, 2);
    } else if (!normalizedLabel.includes(" ") && hasPrefixWordMatch(normalizedText, normalizedLabel)) {
      // Weaker evidence (agglutinative-suffix match, e.g. "reklam" inside
      // "reklamı") — only for single-word labels, into the suggested tier.
      bump(tag, 1);
    }
  }

  const ranked = Array.from(scores.values()).sort((a, b) => b.score - a.score || a.tag.label.localeCompare(b.tag.label));

  const automatic = ranked.filter((entry) => entry.score >= 3).slice(0, 6).map((entry) => entry.tag);
  const automaticSlugs = new Set(automatic.map((tag) => tag.slug));
  const suggested = ranked
    .filter((entry) => entry.score > 0 && entry.score < 3 && !automaticSlugs.has(entry.tag.slug))
    .slice(0, 8)
    .map((entry) => entry.tag);

  return { automatic, suggested };
}

export interface CandidateTagSuggestion extends Tag {
  /** True for every entry from this function — never a real DB row until the user explicitly accepts it (CLAUDE.md §9.24). Lets the UI/picker tell a candidate apart from an already-real low-confidence catalog suggestion. */
  isCandidate: true;
}

/**
 * Matches the current title+content against the large, client-side-only
 * `CANDIDATE_TAG_LABELS` dictionary (tag-candidates.ts, CLAUDE.md §9.24) —
 * deliberately separate from `analyzeContent`'s real-catalog matching above.
 * A match here is NEVER promoted to a real database row on its own and NEVER
 * lands in the `automatic` tier — it only ever surfaces as a `suggested`
 * chip (see `useTagPicker`), and only becomes a real, queryable tag the
 * instant a user explicitly accepts it (which calls `get_or_create_tag`,
 * same as the manual "+ … etiketini oluştur" flow). Whole-word/phrase
 * matches only — no agglutinative-suffix prefix matching here, unlike
 * `analyzeContent`'s real-catalog pass: with ~3,000 candidate entries, prefix
 * matching would flood this tier with noise it's meant to stay free of.
 */
export function matchCandidateSuggestions(
  title: string,
  content: string,
  realCatalogSlugs: ReadonlySet<string>,
  excludeSlugs: ReadonlySet<string>,
  limit = 6,
): CandidateTagSuggestion[] {
  const combinedText = `${title} ${content}`.trim();
  if (!combinedText) return [];
  const normalizedText = normalizeTextForMatching(combinedText);
  if (!normalizedText) return [];

  const matches: CandidateTagSuggestion[] = [];
  const seenSlugs = new Set<string>();
  for (const label of CANDIDATE_TAG_LABELS) {
    const slug = normalizeTagLabel(label);
    if (!slug || seenSlugs.has(slug)) continue;
    if (realCatalogSlugs.has(slug) || excludeSlugs.has(slug)) continue;
    const normalizedLabel = normalizeTextForMatching(label);
    if (!normalizedLabel || normalizedLabel.length < 3) continue;
    if (hasWholeWordMatch(normalizedText, normalizedLabel)) {
      seenSlugs.add(slug);
      matches.push({ slug, label, isCandidate: true });
    }
  }

  // Prefer longer, more specific phrase matches first (fewer coincidental short-word hits).
  matches.sort((a, b) => b.label.length - a.label.length || a.label.localeCompare(b.label));
  return matches.slice(0, limit);
}
