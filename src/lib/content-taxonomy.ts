/**
 * Central content taxonomy — the ONE source for content types, categories
 * and subcategories across prompts, prompt requests, generators, search,
 * explore and every filter. Nothing else in the app hard-codes a category.
 *
 * Shape: content type -> category -> subcategory. Every level has a stable,
 * English, snake_case slug (what is stored in the database and used in
 * URLs/filters); the visible label comes from `taxonomyLabel(labelKey,
 * language)` with the same `Language` the rest of the app uses. Label keys
 * follow `taxonomy.<type>.<category>[.<subcategory>]`.
 *
 * Only the requested level is ever materialised by the UI: pickers/filters
 * call `getCategories(type)` / `getSubcategories(...)`, so a type's
 * subcategories are never rendered until it (and its category) is chosen.
 */
import type { Language } from "@/lib/i18n/translations";
import { normalizeTagLabel } from "@/lib/tag-normalize";

export type ContentTypeId = "image" | "text" | "audio" | "video";
export const CONTENT_TYPE_IDS: readonly ContentTypeId[] = ["image", "text", "audio", "video"];

/** [English, Türkçe] */
type Pair = readonly [string, string];
type RawCategory = readonly [Pair, readonly Pair[]];

const P = (en: string, tr: string): Pair => [en, tr];

const RAW: Record<ContentTypeId, readonly RawCategory[]> = {
  image: [
    [P("Human & Character", "İnsan & Karakter"), [P("Portrait", "Portre"), P("Character", "Karakter"), P("Character Design", "Karakter Tasarımı"), P("Human", "İnsan"), P("Child", "Çocuk"), P("Elderly", "Yaşlı"), P("Group", "Grup"), P("Couple", "Çift"), P("Fashion", "Moda"), P("Beauty", "Güzellik"), P("Makeup", "Makyaj"), P("Hair", "Saç"), P("Body & Pose", "Vücut / Poz")]],
    [P("Photography", "Fotoğrafçılık"), [P("Portrait Photography", "Portre Fotoğrafçılığı"), P("Street Photography", "Sokak Fotoğrafçılığı"), P("Landscape", "Manzara"), P("Nature", "Doğa"), P("Night Photography", "Gece Fotoğrafçılığı"), P("Studio", "Stüdyo"), P("Wedding", "Düğün"), P("Travel", "Seyahat"), P("Architectural Photography", "Mimari Fotoğraf"), P("Product Photography", "Ürün Fotoğrafı"), P("Food Photography", "Yemek Fotoğrafı"), P("Fashion Photography", "Moda Fotoğrafı"), P("Macro", "Makro"), P("Wildlife", "Vahşi Yaşam")]],
    [P("Art & Illustration", "Sanat & İllüstrasyon"), [P("Digital Art", "Dijital Sanat"), P("Concept Art", "Konsept Sanat"), P("Illustration", "İllüstrasyon"), P("Cartoon", "Karikatür"), P("Drawing", "Çizim"), P("Oil Painting", "Yağlı Boya"), P("Watercolor", "Suluboya"), P("Sketch", "Eskiz"), P("Pixel Art", "Pixel Art"), P("Poster", "Poster"), P("Collage", "Kolaj")]],
    [P("Style", "Stil"), [P("Realistic", "Gerçekçi"), P("Cinematic", "Sinematik"), P("Anime", "Anime"), P("Manga", "Manga"), P("3D", "3D"), P("Pixar-style", "Pixar Benzeri"), P("Cyberpunk", "Cyberpunk"), P("Fantasy", "Fantastik"), P("Retro", "Retro"), P("Vintage", "Vintage"), P("Minimalist", "Minimalist"), P("Noir", "Noir"), P("Steampunk", "Steampunk"), P("Dark Fantasy", "Dark Fantasy"), P("Low Poly", "Low Poly")]],
    [P("Product & Commercial", "Ürün & Ticari"), [P("Product", "Ürün"), P("Advertising", "Reklam"), P("E-commerce", "E-ticaret"), P("Packaging", "Ambalaj"), P("Brand", "Marka"), P("Logo", "Logo"), P("Product Mockup", "Ürün Mockup"), P("Cosmetics", "Kozmetik"), P("Clothing", "Giyim"), P("Technology", "Teknoloji")]],
    [P("Spaces", "Mekân"), [P("Architecture", "Mimari"), P("Interior", "İç Mekân"), P("Exterior", "Dış Mekân"), P("Home", "Ev"), P("Office", "Ofis"), P("Restaurant", "Restoran"), P("Store", "Mağaza"), P("City", "Şehir"), P("Village", "Köy"), P("Futuristic City", "Fütüristik Şehir")]],
    [P("Nature & Environment", "Doğa & Çevre"), [P("Landscape", "Manzara"), P("Mountain", "Dağ"), P("Sea", "Deniz"), P("Forest", "Orman"), P("Desert", "Çöl"), P("Animal", "Hayvan"), P("Plant", "Bitki"), P("Space", "Uzay"), P("Planet", "Gezegen"), P("Weather", "Hava Durumu")]],
    [P("Design", "Tasarım"), [P("UI", "UI"), P("UX", "UX"), P("Web Design", "Web Tasarım"), P("Mobile App", "Mobil Uygulama"), P("Dashboard", "Dashboard"), P("Poster", "Poster"), P("Banner", "Banner"), P("Social Media", "Sosyal Medya"), P("Presentation", "Sunum"), P("Infographic", "Infografik")]],
  ],
  text: [
    [P("Writing", "Yazarlık"), [P("Story", "Hikâye"), P("Novel", "Roman"), P("Screenplay", "Senaryo"), P("Poetry", "Şiir"), P("Dialogue", "Diyalog"), P("Character Writing", "Karakter Yazımı"), P("World Building", "Dünya Kurma"), P("Fiction", "Kurgu"), P("Creative Writing", "Yaratıcı Yazarlık")]],
    [P("Social Media", "Sosyal Medya"), [P("Instagram", "Instagram"), P("TikTok", "TikTok"), P("YouTube", "YouTube"), P("X / Twitter", "X / Twitter"), P("LinkedIn", "LinkedIn"), P("Facebook", "Facebook"), P("Social Media Caption", "Sosyal Medya Açıklaması"), P("Social Media Post", "Sosyal Medya Gönderisi"), P("Viral Content", "Viral İçerik")]],
    [P("Marketing", "Pazarlama"), [P("Ad Copy", "Reklam Metni"), P("Sales Copy", "Satış Metni"), P("Product Description", "Ürün Açıklaması"), P("Landing Page", "Landing Page"), P("Email Marketing", "E-posta Pazarlama"), P("Campaign", "Kampanya"), P("Brand Copy", "Marka Metni"), P("Slogan", "Slogan"), P("CTA", "CTA")]],
    [P("SEO", "SEO"), [P("SEO Article", "SEO Makalesi"), P("Blog", "Blog"), P("Keyword", "Anahtar Kelime"), P("Meta Description", "Meta Description"), P("Headline", "Başlık"), P("Product SEO", "Ürün SEO"), P("Content Optimization", "İçerik Optimizasyonu")]],
    [P("Business & Professional", "İş & Profesyonel"), [P("Email", "E-posta"), P("Resume", "CV"), P("Cover Letter", "Ön Yazı"), P("Report", "Rapor"), P("Presentation", "Sunum"), P("Meeting Summary", "Toplantı Özeti"), P("Business Plan", "İş Planı"), P("Proposal", "Teklif"), P("Documentation", "Dokümantasyon")]],
    [P("Education", "Eğitim"), [P("Lesson", "Ders"), P("Homework", "Ödev"), P("Exam", "Sınav"), P("Quiz", "Quiz"), P("Lesson Plan", "Ders Planı"), P("Summary", "Özet"), P("Flashcard", "Flashcard"), P("Teacher", "Öğretmen"), P("Student", "Öğrenci")]],
    [P("Research", "Araştırma"), [P("Research", "Araştırma"), P("Summarization", "Özetleme"), P("Analysis", "Analiz"), P("Comparison", "Karşılaştırma"), P("Data Analysis", "Veri Analizi"), P("Literature", "Literatür"), P("Reporting", "Raporlama")]],
    [P("Coding", "Kodlama"), [P("Code", "Kod"), P("Web", "Web"), P("Mobile", "Mobil"), P("Frontend", "Frontend"), P("Backend", "Backend"), P("JavaScript", "JavaScript"), P("TypeScript", "TypeScript"), P("Python", "Python"), P("SQL", "SQL"), P("API", "API"), P("Debugging", "Debugging"), P("Automation", "Otomasyon")]],
  ],
  audio: [
    [P("Music", "Müzik"), [P("Song", "Şarkı"), P("Instrumental", "Enstrümantal"), P("Beat", "Beat"), P("Electronic", "Elektronik"), P("Rock", "Rock"), P("Pop", "Pop"), P("Hip Hop", "Hip Hop"), P("Rap", "Rap"), P("Jazz", "Jazz"), P("Classical", "Klasik"), P("Ambient", "Ambient"), P("Lo-fi", "Lo-fi"), P("Synthwave", "Synthwave"), P("Metal", "Metal"), P("Folk", "Folk"), P("Film Score", "Film Müziği"), P("Game Music", "Oyun Müziği")]],
    [P("Vocals", "Vokal"), [P("Female Vocal", "Kadın Vokal"), P("Male Vocal", "Erkek Vokal"), P("Choir", "Koro"), P("Backing Vocal", "Arka Vokal"), P("Rap Vocal", "Rap Vokal"), P("Spoken Word", "Spoken Word")]],
    [P("Voiceover", "Seslendirme"), [P("Advertisement", "Reklam"), P("Dubbing", "Dublaj"), P("Story", "Hikâye"), P("Podcast", "Podcast"), P("Education", "Eğitim"), P("Narrator", "Anlatıcı"), P("Character Voice", "Karakter Sesi")]],
    [P("Sound Effects", "Ses Efektleri"), [P("SFX", "SFX"), P("Cinematic Effect", "Sinematik Efekt"), P("Game Effect", "Oyun Efekti"), P("Nature Sounds", "Doğa Sesleri"), P("Ambience", "Ortam"), P("Foley", "Foley"), P("UI Sounds", "UI Sesleri"), P("Transition Sounds", "Geçiş Sesleri")]],
    [P("Podcast", "Podcast"), [P("Podcast Intro", "Podcast Giriş"), P("Podcast Outro", "Podcast Çıkış"), P("Podcast Conversation", "Podcast Konuşması"), P("Interview", "Röportaj"), P("Storytelling", "Hikâye Anlatımı")]],
    [P("Ambience", "Ortam"), [P("Rain", "Yağmur"), P("Forest", "Orman"), P("City", "Şehir"), P("Cafe", "Kafe"), P("Sea", "Deniz"), P("Storm", "Fırtına"), P("Space", "Uzay"), P("Horror", "Korku"), P("Ambient", "Ambient")]],
  ],
  video: [
    [P("Cinematic", "Sinematik"), [P("Film", "Film"), P("Cinematic Scene", "Sinematik Sahne"), P("Trailer", "Trailer"), P("Teaser", "Teaser"), P("Film Intro", "Film Intro"), P("Film Outro", "Film Outro")]],
    [P("Social Media", "Sosyal Medya"), [P("TikTok", "TikTok"), P("Reels", "Reels"), P("Shorts", "Shorts"), P("YouTube", "YouTube"), P("Story", "Story"), P("Viral Video", "Viral Video")]],
    [P("Advertising", "Reklam"), [P("Product Ad", "Ürün Reklamı"), P("Brand Ad", "Marka Reklamı"), P("Social Media Ad", "Sosyal Medya Reklamı"), P("UGC", "UGC"), P("Product Presentation", "Ürün Tanıtımı"), P("Campaign", "Kampanya")]],
    [P("Animation", "Animasyon"), [P("2D", "2D"), P("3D", "3D"), P("Anime", "Anime"), P("Motion Graphics", "Motion Graphics"), P("Character Animation", "Character Animation"), P("Explainer", "Explainer"), P("Cartoon", "Cartoon")]],
    [P("Music Video", "Müzik Videosu"), [P("Music Video", "Klip"), P("Lyric Video", "Lyric Video"), P("Visualizer", "Visualizer"), P("Concert", "Konser"), P("Performance", "Performans")]],
    [P("Education", "Eğitim"), [P("Tutorial", "Tutorial"), P("Lesson", "Ders"), P("Explainer", "Explainer"), P("Presentation", "Sunum"), P("Screen Recording", "Ekran Kaydı"), P("Educational Animation", "Eğitim Animasyonu")]],
    [P("Story & Entertainment", "Hikâye & Eğlence"), [P("Short Film", "Kısa Film"), P("Story", "Hikâye"), P("Comedy", "Komedi"), P("Horror", "Korku"), P("Action", "Aksiyon"), P("Drama", "Dram"), P("Fantasy", "Fantastik"), P("Sci-Fi", "Bilim Kurgu")]],
    [P("Visual Effects", "Görsel Efekt"), [P("VFX", "VFX"), P("CGI", "CGI"), P("Green Screen", "Green Screen"), P("Transition", "Transition"), P("Slow Motion", "Slow Motion"), P("Time Lapse", "Time Lapse"), P("Camera Effects", "Camera Effects")]],
    [P("Product & Commercial", "Ürün & Ticari"), [P("Product Video", "Ürün Videosu"), P("E-commerce", "E-ticaret"), P("Product Presentation", "Ürün Tanıtımı"), P("Fashion", "Moda"), P("Automotive", "Otomobil"), P("Technology", "Teknoloji"), P("Restaurant", "Restoran")]],
    [P("Documentary", "Belgesel"), [P("Nature", "Doğa"), P("History", "Tarih"), P("Science", "Bilim"), P("Travel", "Seyahat"), P("Interview", "Röportaj"), P("News", "Haber")]],
  ],
};

const TYPE_LABELS: Record<ContentTypeId, Pair> = {
  image: ["Image", "Görsel"],
  text: ["Text", "Metin"],
  audio: ["Audio", "Ses"],
  video: ["Video", "Video"],
};

function slugify(en: string): string {
  return en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface TaxonomySubcategory {
  id: string;
  type: ContentTypeId;
  categoryId: string;
  labelKey: string;
}
export interface TaxonomyCategory {
  id: string;
  type: ContentTypeId;
  labelKey: string;
  subcategories: TaxonomySubcategory[];
}

// `labelKey -> [tr, en]`, filled while the tree is built.
const LABELS = new Map<string, Pair>();

export function contentTypeLabelKey(type: ContentTypeId): string {
  return `taxonomy.${type}`;
}

const TREE: Record<ContentTypeId, TaxonomyCategory[]> = { image: [], text: [], audio: [], video: [] };

for (const type of CONTENT_TYPE_IDS) {
  LABELS.set(contentTypeLabelKey(type), TYPE_LABELS[type]);
  for (const [[catEn, catTr], subs] of RAW[type]) {
    const catId = slugify(catEn);
    const catKey = `taxonomy.${type}.${catId}`;
    LABELS.set(catKey, [catEn, catTr]);
    TREE[type].push({
      id: catId,
      type,
      labelKey: catKey,
      subcategories: subs.map(([subEn, subTr]) => {
        const subId = slugify(subEn);
        const labelKey = `${catKey}.${subId}`;
        LABELS.set(labelKey, [subEn, subTr]);
        return { id: subId, type, categoryId: catId, labelKey };
      }),
    });
  }
}

/** Visible label for any taxonomy node (`labelKey`), in the active language. */
export function taxonomyLabel(labelKey: string, language: Language): string {
  const pair = LABELS.get(labelKey);
  if (!pair) return labelKey;
  return language === "en" ? pair[0] : pair[1];
}

export function isContentTypeId(value: unknown): value is ContentTypeId {
  return typeof value === "string" && (CONTENT_TYPE_IDS as readonly string[]).includes(value);
}

export function getCategories(type: ContentTypeId): TaxonomyCategory[] {
  return TREE[type];
}
export function findCategory(type: ContentTypeId, categoryId: string | null | undefined): TaxonomyCategory | null {
  if (!categoryId) return null;
  return TREE[type].find((c) => c.id === categoryId) ?? null;
}
export function getSubcategories(type: ContentTypeId, categoryId: string | null | undefined): TaxonomySubcategory[] {
  return findCategory(type, categoryId)?.subcategories ?? [];
}
export function findSubcategory(
  type: ContentTypeId,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): TaxonomySubcategory | null {
  if (!subcategoryId) return null;
  return getSubcategories(type, categoryId).find((s) => s.id === subcategoryId) ?? null;
}

export interface TaxonomySelection {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
}

/** Drops a category/subcategory that doesn't exist for the type (bad/legacy data) instead of trusting it. */
export function sanitizeTaxonomy(
  type: ContentTypeId,
  category: string | null | undefined,
  subcategory: string | null | undefined,
): { category: string | null; subcategory: string | null } {
  const cat = findCategory(type, category);
  if (!cat) return { category: null, subcategory: null };
  const sub = findSubcategory(type, cat.id, subcategory);
  return { category: cat.id, subcategory: sub?.id ?? null };
}

/**
 * Maps a value stored before the 4-type taxonomy (`code`, `music`) — or
 * anything unknown — onto a current type (+ category where the old value
 * implied one). Used defensively when reading rows.
 */
export function normalizeLegacyContentType(raw: string | null | undefined): { contentType: ContentTypeId; category: string | null } {
  if (isContentTypeId(raw)) return { contentType: raw, category: null };
  if (raw === "code") return { contentType: "text", category: "coding" };
  if (raw === "music") return { contentType: "audio", category: "music" };
  return { contentType: "image", category: null };
}

/** Active filter: `null` at a level means "any". */
export interface TaxonomyFilterValue {
  contentType: ContentTypeId | null;
  category: string | null;
  subcategory: string | null;
}
export const EMPTY_TAXONOMY_FILTER: TaxonomyFilterValue = { contentType: null, category: null, subcategory: null };

export function matchesTaxonomy(
  item: { contentType?: string | null; category?: string | null; subcategory?: string | null },
  filter: TaxonomyFilterValue,
): boolean {
  if (filter.contentType && item.contentType !== filter.contentType) return false;
  if (filter.category && item.category !== filter.category) return false;
  if (filter.subcategory && item.subcategory !== filter.subcategory) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Search: interpreting typed text ("görsel anime") and autocomplete.
// ---------------------------------------------------------------------------

export type TaxonomyEntry =
  | { kind: "type"; type: ContentTypeId; keys: string[]; labelKey: string }
  | { kind: "category"; type: ContentTypeId; categoryId: string; keys: string[]; labelKey: string }
  | { kind: "subcategory"; type: ContentTypeId; categoryId: string; subcategoryId: string; keys: string[]; labelKey: string };

let entryIndex: TaxonomyEntry[] | null = null;

/** Comparison key: case/accent-insensitive (also folds â/î/û, e.g. "Hikâye" ~ "hikaye"). */
function norm(text: string): string {
  return normalizeTagLabel(text.replace(/[âÂ]/g, "a").replace(/[îÎ]/g, "i").replace(/[ûÛ]/g, "u"));
}

function keyFor(labelKey: string): string[] {
  const pair = LABELS.get(labelKey)!;
  return Array.from(new Set([norm(pair[0]), norm(pair[1])]));
}

/** Built once, lazily — a few hundred small records, never rendered directly. */
function getEntryIndex(): TaxonomyEntry[] {
  if (entryIndex) return entryIndex;
  const out: TaxonomyEntry[] = [];
  for (const type of CONTENT_TYPE_IDS) {
    const labelKey = contentTypeLabelKey(type);
    out.push({ kind: "type", type, labelKey, keys: keyFor(labelKey) });
    for (const cat of TREE[type]) {
      out.push({ kind: "category", type, categoryId: cat.id, labelKey: cat.labelKey, keys: keyFor(cat.labelKey) });
      for (const sub of cat.subcategories) {
        out.push({ kind: "subcategory", type, categoryId: cat.id, subcategoryId: sub.id, labelKey: sub.labelKey, keys: keyFor(sub.labelKey) });
      }
    }
  }
  entryIndex = out;
  return out;
}

export interface ParsedTaxonomyQuery {
  contentType: ContentTypeId | null;
  category: string | null;
  subcategory: string | null;
  /** The query with every recognised taxonomy word removed. */
  rest: string;
}

/**
 * Reads "aliq03 görsel anime" as {type: image, sub: anime, rest: "aliq03"}.
 * Words are matched (1–3 word phrases, accent/case-insensitive) against
 * type / category / subcategory labels in both languages. A word that could
 * mean several things is only applied when the type is already known (from
 * an earlier "görsel"/"video"…) or when it is unambiguous; otherwise it
 * stays part of `rest` so ordinary searches keep working.
 */
export function parseTaxonomyQuery(query: string): ParsedTaxonomyQuery {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const index = getEntryIndex();
  const normWords = words.map((w) => norm(w));

  // Pass 1: find the content type, if one is named.
  let contentType: ContentTypeId | null = null;
  const used = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const hit = index.find((e) => e.kind === "type" && e.keys.includes(normWords[i]));
    if (hit && hit.kind === "type") {
      contentType = hit.type;
      used.add(i);
      break;
    }
  }

  // Pass 2: category / subcategory, longest phrase first.
  let category: string | null = null;
  let subcategory: string | null = null;
  for (let i = 0; i < words.length; i++) {
    if (used.has(i)) continue;
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const span = Array.from({ length: len }, (_, k) => i + k);
      if (span.some((k) => used.has(k))) continue;
      const phrase = norm(words.slice(i, i + len).join(" "));
      if (!phrase) continue;
      const matches = index.filter((e) => e.kind !== "type" && e.keys.includes(phrase) && (!contentType || e.type === contentType));
      if (matches.length === 0) continue;
      const types = new Set(matches.map((m) => m.type));
      if (!contentType && types.size > 1) continue; // ambiguous across types — leave as text
      // Prefer a subcategory match (more specific) inside the chosen type.
      const pick = matches.find((m) => m.kind === "subcategory") ?? matches[0];
      if (!contentType) contentType = pick.type;
      if (pick.kind === "subcategory") {
        if (!category) category = pick.categoryId;
        if (!subcategory) subcategory = pick.subcategoryId;
      } else if (pick.kind === "category" && !category) {
        category = pick.categoryId;
      } else {
        continue;
      }
      span.forEach((k) => used.add(k));
      i += len - 1;
      break;
    }
  }

  const rest = words.filter((_, i) => !used.has(i)).join(" ");
  return { contentType, category, subcategory, rest };
}

export interface TaxonomySuggestion {
  entry: TaxonomyEntry;
  /** Text to put in the search box for this suggestion (its label in the active language). */
  insertText: string;
}

/**
 * Autocomplete for the word currently being typed. `prefix` is matched at
 * the start of any label word; results are limited and ordered type →
 * category → subcategory. When a content type is already in the query only
 * that type's categories/subcategories are offered.
 */
export function suggestTaxonomy(prefix: string, language: Language, contentType: ContentTypeId | null, limit = 6): TaxonomySuggestion[] {
  const p = norm(prefix);
  if (p.length < 1) return [];
  const rank = { type: 0, category: 1, subcategory: 2 } as const;
  const found = getEntryIndex()
    .filter((e) => (!contentType || e.type === contentType || e.kind === "type" ? true : false))
    .filter((e) => !(contentType && e.kind === "type"))
    .filter((e) => e.keys.some((k) => k.startsWith(p) || k.split("-").some((word) => word.startsWith(p))))
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
  const seen = new Set<string>();
  const out: TaxonomySuggestion[] = [];
  for (const entry of found) {
    const label = taxonomyLabel(entry.labelKey, language);
    const dedupe = `${entry.kind}:${entry.type}:${label}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ entry, insertText: label });
    if (out.length >= limit) break;
  }
  return out;
}

/** "Fotoğrafçılık · Moda Fotoğrafı" (optionally prefixed by the type) — the readable path of whatever levels are set. */
export function taxonomyPathLabel(
  item: { contentType: ContentTypeId; category?: string | null; subcategory?: string | null },
  language: Language,
  includeType = true,
): string {
  const parts: string[] = [];
  if (includeType) parts.push(taxonomyLabel(contentTypeLabelKey(item.contentType), language));
  const cat = findCategory(item.contentType, item.category);
  if (cat) {
    parts.push(taxonomyLabel(cat.labelKey, language));
    const sub = findSubcategory(item.contentType, cat.id, item.subcategory);
    if (sub) parts.push(taxonomyLabel(sub.labelKey, language));
  }
  return parts.join(" · ");
}
