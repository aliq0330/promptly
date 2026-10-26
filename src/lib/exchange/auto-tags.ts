import { analyzeContent, matchCandidateSuggestions } from "../tag-catalog-matcher.ts";
import { normalizeTagLabel } from "../tag-normalize.ts";
import type { Tag } from "@/types";

/**
 * Moderatör toplu araçları için otomatik etiket seçimi (docs/history/252-*): oluşturma formundaki canlı analizle (`analyzeContent`,
 * `matchCandidateSuggestions`) AYNI motoru, formsuz içeriğe uygular. Saf ve eşzamanlı; ağ çağrısı yok.
 *   • "Otomatik" = yüksek güvenli katalog eşleşmeleri (formda kendiliğinden eklenenler).
 *   • "Önerilen" = formda yalnızca öneri çipi olan düşük güvenli katalog eşleşmeleri + aday sözlüğünden gelenler (`isNew`: henüz gerçek
 *     etiket değil, eklenince `get_or_create_tag` ile oluşur).
 * Sınır: bir promptta en çok `EXCHANGE_TAG_LIMIT` etiket; içerikte hâlihazırda olan etiketler sayılır ve asla yinelenmez.
 */

/** Sunucunun (`import_prompts`) kabul ettiği etiket sayısıyla aynı. */
export const EXCHANGE_TAG_LIMIT = 20;

export interface AutoTagOptions {
  /** Yüksek güvenli katalog eşleşmeleri. */
  automatic: boolean;
  /** Düşük güvenli katalog eşleşmeleri + aday sözlüğü (yeni etiket oluşturabilir). */
  suggested: boolean;
}

export interface AutoTagPick {
  slug: string;
  label: string;
  kind: "automatic" | "suggested";
  /** Katalogda yok; kabul edilince oluşturulur. */
  isNew: boolean;
}

export const NO_AUTO_TAGS: AutoTagOptions = { automatic: false, suggested: false };

export function autoTagsEnabled(options: AutoTagOptions): boolean {
  return options.automatic || options.suggested;
}

/**
 * `existing`: içeriğin şu an taşıdığı etiketler (etiket ya da slug; ikisi de normalize edilir). `catalogSlugs`: `catalog`'un slug kümesi
 * (çok sayıda içerik için önceden hesaplanıp verilebilir).
 */
export function pickAutoTags(
  title: string,
  text: string,
  catalog: Tag[],
  existing: Iterable<string>,
  options: AutoTagOptions,
  catalogSlugs: ReadonlySet<string> = new Set(catalog.map((tag) => tag.slug)),
): AutoTagPick[] {
  if (!autoTagsEnabled(options)) return [];
  const have = new Set<string>();
  for (const value of existing) {
    const slug = normalizeTagLabel(value);
    if (slug) have.add(slug);
  }
  const room = EXCHANGE_TAG_LIMIT - have.size;
  if (room <= 0) return [];

  const picks: AutoTagPick[] = [];
  const push = (tag: Tag, kind: AutoTagPick["kind"], isNew: boolean) => {
    if (picks.length >= room || have.has(tag.slug)) return;
    have.add(tag.slug);
    picks.push({ slug: tag.slug, label: tag.label, kind, isNew });
  };

  const analysis = analyzeContent(title, text, catalog);
  if (options.automatic) for (const tag of analysis.automatic) push(tag, "automatic", false);
  if (options.suggested) {
    for (const tag of analysis.suggested) push(tag, "suggested", false);
    for (const candidate of matchCandidateSuggestions(title, text, catalogSlugs, have)) push(candidate, "suggested", true);
  }
  return picks;
}

/** `labels` (dosyadaki etiketler) + seçilen otomatik etiketler; yinelenen yok, sıra korunur. */
export function mergeTagLabels(labels: string[], picks: AutoTagPick[]): string[] {
  return [...labels, ...picks.map((pick) => pick.label)];
}

export interface AutoTagSubject {
  title: string;
  text: string;
  existing: string[];
}

/**
 * Binlerce içerik için seçim: her `yieldEvery` içerikte tarayıcıya nefes aldırır (aday sözlüğü içerik başına ~14 ms sürer; 3000 içerik arayüzü
 * kilitlemesin). `shouldStop` true olunca o ana kadarki sonuçlar atılır (null döner) — yarım etiketleme yazılmaz.
 */
export async function pickAutoTagsBatch(
  subjects: AutoTagSubject[],
  catalog: Tag[],
  options: AutoTagOptions,
  control: { onProgress?: (done: number, total: number) => void; shouldStop?: () => boolean; yieldEvery?: number } = {},
): Promise<AutoTagPick[][] | null> {
  const catalogSlugs = new Set(catalog.map((tag) => tag.slug));
  const every = control.yieldEvery ?? 20;
  const out: AutoTagPick[][] = [];
  for (let i = 0; i < subjects.length; i++) {
    if (control.shouldStop?.()) return null;
    const subject = subjects[i];
    out.push(pickAutoTags(subject.title, subject.text, catalog, subject.existing, options, catalogSlugs));
    if ((i + 1) % every === 0) {
      control.onProgress?.(i + 1, subjects.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  control.onProgress?.(subjects.length, subjects.length);
  return out;
}
