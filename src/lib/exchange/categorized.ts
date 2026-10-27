import { promptsChatBlocks } from "./prompts-chat.ts";
import { CONTENT_TYPE_IDS, TAXONOMY_SEED, type ContentTypeId } from "../taxonomy-seed.ts";

/**
 * Kategorili prompts.chat dosyası → mevcut promptlara tür/kategori/alt kategori (docs/history/260-*). Ağ bilmez; ayrıştırma, etiket→slug
 * çözümü ve eşleştirme planı saf işlevlerdir, birim testle doğrulanır.
 *
 * Dosya biçimi: `PROMPTS.md` ile aynı kayıtlar, her kaydın üst bilgisine üç satır eklenir:
 *   **Tür:** Metin | Görsel | Ses | Video
 *   **Kategori:** Metin – Kodlama           (tür adı – kategorinin Türkçe adı; "–" en tire)
 *   **Alt kategori:** Kod                    (isteğe bağlı; kategorinin Türkçe alt kategori adı)
 * Etiketler taksonomi tohumundaki (`taxonomy-seed.ts`) Türkçe adlarla eşlenir; veritabanına yazılan değer o adın SLUG'ıdır (İngilizce addan
 * türer, hiç değişmez). Sunucu değerleri yine de canlı taksonomi tablolarına karşı doğrular — istemci tek koruma değildir.
 */

const TYPE_BY_LABEL: Record<string, ContentTypeId> = { metin: "text", görsel: "image", ses: "audio", video: "video" };
const LABEL_LOCALE = "tr";

function key(label: string): string {
  return label.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase(LABEL_LOCALE);
}

function slugify(en: string): string {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

interface CategoryLookup {
  slug: string;
  subs: Map<string, string>;
}

const LOOKUP: Record<ContentTypeId, Map<string, CategoryLookup>> = (() => {
  const result = {} as Record<ContentTypeId, Map<string, CategoryLookup>>;
  for (const type of CONTENT_TYPE_IDS) {
    const categories = new Map<string, CategoryLookup>();
    for (const [[nameEn, nameTr], subcategories] of TAXONOMY_SEED[type]) {
      const subs = new Map<string, string>();
      for (const [subEn, subTr] of subcategories) {
        // Aynı Türkçe ad bir kategoride iki kez geçerse ilki kazanır (tohumda böyle bir şey yok; yine de belirsizlik yazılmaz).
        if (!subs.has(key(subTr))) subs.set(key(subTr), slugify(subEn));
      }
      categories.set(key(nameTr), { slug: slugify(nameEn), subs });
    }
    result[type] = categories;
  }
  return result;
})();

export type CategorizedProblem = "bad_type" | "bad_category" | "category_type_mismatch" | "missing_category";

export interface CategorizedEntry {
  /** İçe aktarmadaki başlıkla aynı kuralla normalleştirilmiş başlık (eşleştirme anahtarı). */
  title: string;
  type: ContentTypeId;
  category: string;
  /** Tohumda bulunamayan alt kategori `null` olur ve `subcategoryUnknown` sayılır (kategori yine yazılır). */
  subcategory: string | null;
}

export interface CategorizedProblemItem {
  /** Dosyadaki 1 tabanlı kayıt sırası. */
  index: number;
  title: string;
  code: CategorizedProblem;
  value: string;
}

export interface CategorizedParseResult {
  entries: CategorizedEntry[];
  /** Tür/kategori çözülemeyen kayıtlar (hiçbir şey yazılmaz). */
  problems: CategorizedProblemItem[];
  /** Alt kategorisi tohumda olmayan kayıtlar (yalnız alt kategori boş kalır). */
  subcategoryUnknown: { index: number; title: string; value: string }[];
  /** Dosyada kayıt var ama hiçbirinde **Tür:** satırı yok → bu dosya kategorili değildir. */
  uncategorizedFile: boolean;
  total: number;
}

function headerField(header: string, name: string): string | null {
  const match = new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, "m").exec(header);
  return match ? match[1].trim() : null;
}

/** "Metin – Kodlama" → ["Metin", "Kodlama"] (en tire, kısa tire ya da çizgi). */
function splitCategoryLabel(value: string): [string, string] | null {
  const match = /^(.+?)\s+[–—-]\s+(.+)$/.exec(value);
  return match ? [match[1], match[2]] : null;
}

export function parseCategorizedPromptsChat(text: string): CategorizedParseResult {
  const result: CategorizedParseResult = { entries: [], problems: [], subcategoryUnknown: [], uncategorizedFile: false, total: 0 };
  const blocks = promptsChatBlocks(text);
  result.total = blocks.length;
  let withType = 0;
  blocks.forEach((block, position) => {
    const index = position + 1;
    const typeLabel = headerField(block.header, "Tür");
    if (typeLabel === null) return;
    withType += 1;
    const type = TYPE_BY_LABEL[key(typeLabel)];
    if (!type) {
      result.problems.push({ index, title: block.title, code: "bad_type", value: typeLabel });
      return;
    }
    const categoryLabel = headerField(block.header, "Kategori");
    if (!categoryLabel) {
      result.problems.push({ index, title: block.title, code: "missing_category", value: typeLabel });
      return;
    }
    // "Metin – Kodlama": başındaki tür adı ayrıca doğrulanır (Tür satırıyla çelişen kayıt yazılmaz).
    const parts = splitCategoryLabel(categoryLabel);
    const categoryName = parts ? parts[1] : categoryLabel;
    if (parts && TYPE_BY_LABEL[key(parts[0])] !== type) {
      result.problems.push({ index, title: block.title, code: "category_type_mismatch", value: categoryLabel });
      return;
    }
    const category = LOOKUP[type].get(key(categoryName));
    if (!category) {
      result.problems.push({ index, title: block.title, code: "bad_category", value: categoryLabel });
      return;
    }
    const subLabel = headerField(block.header, "Alt kategori");
    let subcategory: string | null = null;
    if (subLabel) {
      subcategory = category.subs.get(key(subLabel)) ?? null;
      if (!subcategory) result.subcategoryUnknown.push({ index, title: block.title, value: subLabel });
    }
    result.entries.push({ title: block.title, type, category: category.slug, subcategory });
  });
  result.uncategorizedFile = blocks.length > 0 && withType === 0;
  return result;
}

export function detectCategorizedPromptsChat(text: string): boolean {
  return /^\*\*Tür:\*\*/m.test(text) && /^\*\*Kategori:\*\*/m.test(text) && text.includes("<details>");
}

// --- Eşleştirme -------------------------------------------------------------------------------------------------------------------

/** Moderatörün kendi promptundan okunan, eşleştirmeye yetecek en az alan. */
export interface TaxonomyRow {
  id: string;
  title: string;
  contentType: string;
  category: string | null;
  subcategory: string | null;
}

export interface TaxonomyChange {
  id: string;
  title: string;
  type: ContentTypeId;
  category: string;
  subcategory: string | null;
  /** Yazılmadan önceki değerler (yedek/geri alma için). */
  previous: { contentType: string; category: string | null; subcategory: string | null };
}

export interface TaxonomyPlan {
  /** Yazılacaklar. */
  changes: TaxonomyChange[];
  /** Zaten dosyadaki değerde olanlar (dokunulmaz). */
  unchanged: number;
  /** Kategorisi dolu olduğu için (üzerine yaz kapalıyken) atlananlar. */
  alreadyCategorized: number;
  /** Dosyada olup kendi promptların arasında bulunmayanlar. */
  notFound: { title: string }[];
  /** Aynı başlık birden çok kayıtta ve dosya/veritabanı tarafı aynı değeri vermiyor → hiçbiri yazılmaz. */
  ambiguous: { title: string; rows: number; entries: number }[];
  byType: Record<ContentTypeId, number>;
  byCategory: { type: ContentTypeId; category: string; count: number }[];
}

function sameAssignment(a: CategorizedEntry, b: CategorizedEntry): boolean {
  return a.type === b.type && a.category === b.category && a.subcategory === b.subcategory;
}

/**
 * Başlığa göre eşler (içe aktarılan promptların başlığı dosyayla aynı kuralla normalleştirilmiştir; metin sonradan değişebildiği için —
 * ör. `${Ad}` dönüşümü — metne bakılmaz). Bir başlık her iki tarafta da tekse eşleşir; birden çoksa YALNIZ iki taraf da aynı sayıda ve
 * dosyadaki değerler aynıysa hepsine uygulanır, aksi hâlde belirsizdir ve atlanır (yanlış prompta kategori yazmak yerine).
 */
export function planCategorization(entries: CategorizedEntry[], rows: TaxonomyRow[], options: { overwrite?: boolean } = {}): TaxonomyPlan {
  const overwrite = options.overwrite === true;
  const rowsByTitle = new Map<string, TaxonomyRow[]>();
  for (const row of rows) {
    const list = rowsByTitle.get(row.title);
    if (list) list.push(row);
    else rowsByTitle.set(row.title, [row]);
  }
  const entriesByTitle = new Map<string, CategorizedEntry[]>();
  for (const entry of entries) {
    const list = entriesByTitle.get(entry.title);
    if (list) list.push(entry);
    else entriesByTitle.set(entry.title, [entry]);
  }

  const plan: TaxonomyPlan = {
    changes: [], unchanged: 0, alreadyCategorized: 0, notFound: [], ambiguous: [],
    byType: { image: 0, text: 0, audio: 0, video: 0 }, byCategory: [],
  };
  const perCategory = new Map<string, { type: ContentTypeId; category: string; count: number }>();

  for (const [title, group] of entriesByTitle) {
    const candidates = rowsByTitle.get(title) ?? [];
    if (candidates.length === 0) {
      plan.notFound.push({ title });
      continue;
    }
    const first = group[0];
    // Sayılar tutmuyor ya da dosyadaki kayıtlar aynı başlıkta farklı değer veriyorsa hangisinin hangisi olduğu bilinemez → hiçbiri yazılmaz.
    if (group.length !== candidates.length || !group.every((entry) => sameAssignment(entry, first))) {
      plan.ambiguous.push({ title, rows: candidates.length, entries: group.length });
      continue;
    }
    for (const row of candidates) {
      if (row.category !== null && !overwrite) {
        plan.alreadyCategorized += 1;
        continue;
      }
      if (row.contentType === first.type && row.category === first.category && row.subcategory === first.subcategory) {
        plan.unchanged += 1;
        continue;
      }
      plan.changes.push({
        id: row.id, title: row.title, type: first.type, category: first.category, subcategory: first.subcategory,
        previous: { contentType: row.contentType, category: row.category, subcategory: row.subcategory },
      });
      plan.byType[first.type] += 1;
      const bucket = `${first.type}:${first.category}`;
      const slot = perCategory.get(bucket);
      if (slot) slot.count += 1;
      else perCategory.set(bucket, { type: first.type, category: first.category, count: 1 });
    }
  }
  plan.byCategory = [...perCategory.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return plan;
}

/** Yedek dosyasından geri alma: yazılan her kaydın ÖNCEKİ değerlerini (kategori boş olabilir) sunucuya dönecek biçime çevirir. */
export function undoItems(changes: Pick<TaxonomyChange, "id" | "previous">[]): { id: string; content_type: string; category: string | null; subcategory: string | null }[] {
  return changes.map((change) => ({
    id: change.id,
    content_type: change.previous.contentType,
    category: change.previous.category,
    subcategory: change.previous.subcategory,
  }));
}
