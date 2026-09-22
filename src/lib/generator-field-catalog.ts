/**
 * The Generator Builder's "hazır alan kütüphanesi" — a static, curated
 * catalog of category → alt kategori → alan → seçenek data a creator can
 * browse/search and insert into their own generator's schema instead of
 * typing every field by hand (the user's own "PROMPTLY GENERATOR — HAZIR
 * KATEGORİ / ALT KATEGORİ / ALAN ŞABLON KÜTÜPHANESİ" request).
 *
 * SCOPE DECISION (made explicit, not hidden): the user's own spec listed
 * many hundreds of individual option values across 24 categories. This
 * catalog covers all 24 categories with real, usable field/option sets —
 * not a literal line-by-line transcription of every option in the spec
 * (that would be several thousand data rows of marginal value). It is a
 * genuinely useful, immediately-usable starting library, structured so it
 * can be extended later by appending more `CatalogField` entries — no
 * architecture change needed to grow it.
 *
 * ARCHITECTURE DECISION (also explicit): the user's spec assumed a
 * `promptVariable`/`{{token}}` + `promptValue` template-substitution
 * system — exactly the `{{variable}}` Prompt Template Engine that was
 * deliberately removed from the Generator Builder one task ago (CLAUDE.md
 * Bölüm 9.29, at the user's own explicit request: "generatoru YAPAN değil
 * KULLANAN kişi" writes the prompt). Reintroducing it here would silently
 * reverse that decision. The user was asked directly and chose "yalnızca
 * JSON katalog" — so every catalog field carries ONLY a real `jsonPath`
 * (feeding the current JSON Output Engine, `generator-output.ts`) and a
 * real, canonical option `value` (never a separate "promptValue"). The
 * runtime "Prompt"/"Negative Prompt" boxes stay exactly as free-typed as
 * Bölüm 9.29 left them.
 *
 * `GeneratorFieldOption` in this app's shared schema is `{label, value}` —
 * no third `promptValue` property exists, and none is added here.
 */

import { slugifyGeneratorTitle } from "./generator-template";
import type { GeneratorFieldType } from "@/types";

export interface CatalogOption {
  label: string;
  value: string;
}

export interface CatalogField {
  /** Stable id within the catalog — used for search/dedupe, never sent to the DB as-is (a real `GeneratorField.key` is derived from the label at insert time, collision-safe). */
  id: string;
  label: string;
  type: GeneratorFieldType;
  categoryId: string;
  subgroupId: string;
  /** Where this field's value lands in the generator's structured JSON output — see the JSON Output Engine (`generator-output.ts`). */
  jsonPath: string;
  options: CatalogOption[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface CatalogSubgroup {
  id: string;
  label: string;
}

export interface CatalogCategory {
  id: string;
  label: string;
  subgroups: CatalogSubgroup[];
}

export interface CatalogPackage {
  id: string;
  label: string;
  fieldIds: string[];
}

/** Turkish-transliterating slug, underscored — same rule this app already uses for field keys/jsonPath segments (`field-editor-modal.tsx`'s `sanitizeSegment`), duplicated here (3 lines) rather than importing a UI component's internal helper from a data/lib file. */
function slugValue(label: string): string {
  return slugifyGeneratorTitle(label).replace(/-/g, "_");
}

function opts(labels: string[]): CatalogOption[] {
  return labels.map((label) => ({ label, value: slugValue(label) }));
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    id: "character",
    label: "Karakter Oluşturma",
    subgroups: [
      { id: "identity", label: "Kimlik" },
      { id: "skin", label: "Ten / Cilt" },
      { id: "eyes", label: "Gözler" },
      { id: "eyebrows", label: "Kaşlar" },
      { id: "nose", label: "Burun" },
      { id: "mouth", label: "Ağız / Dudak" },
      { id: "hair", label: "Saç" },
      { id: "facial_hair", label: "Sakal / Bıyık" },
      { id: "body", label: "Vücut" },
    ],
  },
  {
    id: "clothing",
    label: "Kıyafet & Moda",
    subgroups: [
      { id: "style", label: "Genel Stil" },
      { id: "top", label: "Üst Giyim" },
      { id: "bottom", label: "Alt Giyim" },
      { id: "shoes", label: "Ayakkabı" },
      { id: "fabric", label: "Kumaş" },
      { id: "color_pattern", label: "Renk / Desen" },
    ],
  },
  {
    id: "accessory",
    label: "Aksesuar",
    subgroups: [
      { id: "jewelry", label: "Takı" },
      { id: "head", label: "Baş" },
      { id: "face", label: "Yüz" },
      { id: "other", label: "Diğer" },
    ],
  },
  {
    id: "pose",
    label: "Poz & Hareket",
    subgroups: [
      { id: "base", label: "Temel Poz" },
      { id: "direction", label: "Vücut Yönü" },
      { id: "hands", label: "El Pozisyonu" },
      { id: "head", label: "Baş" },
      { id: "movement", label: "Hareket Karakteri" },
    ],
  },
  {
    id: "expression",
    label: "Yüz İfadesi",
    subgroups: [
      { id: "emotion", label: "Duygu" },
      { id: "eyes", label: "Göz İfadesi" },
      { id: "mouth", label: "Ağız" },
      { id: "intensity", label: "Yoğunluk" },
    ],
  },
  {
    id: "environment",
    label: "Ortam & Mekân",
    subgroups: [
      { id: "nature", label: "Doğa" },
      { id: "city", label: "Şehir" },
      { id: "interior", label: "İç Mekân" },
      { id: "fantasy", label: "Fantastik" },
      { id: "scifi", label: "Sci-Fi" },
    ],
  },
  {
    id: "weather",
    label: "Hava & Atmosfer",
    subgroups: [
      { id: "weather", label: "Hava" },
      { id: "atmosphere", label: "Atmosfer" },
      { id: "particle", label: "Partikül" },
      { id: "time", label: "Zaman" },
    ],
  },
  {
    id: "lighting",
    label: "Işıklandırma",
    subgroups: [
      { id: "source", label: "Işık Kaynağı" },
      { id: "direction", label: "Işık Yönü" },
      { id: "technique", label: "Teknik" },
      { id: "character", label: "Karakter" },
      { id: "color", label: "Renk" },
    ],
  },
  {
    id: "camera",
    label: "Kamera & Lens",
    subgroups: [
      { id: "shot", label: "Çekim Türü" },
      { id: "angle", label: "Kamera Açısı" },
      { id: "lens", label: "Lens" },
      { id: "aperture", label: "Diyafram" },
      { id: "focus", label: "Odak" },
      { id: "movement", label: "Kamera Hareketi" },
    ],
  },
  {
    id: "visual_style",
    label: "Görsel Stil",
    subgroups: [
      { id: "realism", label: "Gerçekçilik" },
      { id: "three_d", label: "3D" },
      { id: "anime", label: "Anime" },
      { id: "art", label: "Sanat" },
      { id: "cinematic", label: "Sinematik" },
      { id: "design", label: "Tasarım Dili" },
    ],
  },
  {
    id: "color",
    label: "Renk & Palet",
    subgroups: [
      { id: "colors", label: "Renkler" },
      { id: "palette", label: "Renk Paleti" },
      { id: "adjustments", label: "Ayarlar" },
    ],
  },
  {
    id: "composition",
    label: "Kompozisyon",
    subgroups: [
      { id: "position", label: "Konu Konumu" },
      { id: "framing", label: "Kadraj" },
      { id: "depth", label: "Derinlik" },
      { id: "perspective", label: "Perspektif" },
      { id: "technique", label: "Teknikler" },
    ],
  },
  {
    id: "effects",
    label: "Görsel Efektler",
    subgroups: [
      { id: "light", label: "Işık Efektleri" },
      { id: "atmospheric", label: "Atmosferik" },
      { id: "nature", label: "Doğa" },
      { id: "energy", label: "Enerji" },
      { id: "camera", label: "Kamera Efektleri" },
      { id: "material", label: "Malzeme" },
    ],
  },
  {
    id: "fantasy",
    label: "Fantastik",
    subgroups: [
      { id: "character", label: "Karakter" },
      { id: "creature", label: "Yaratık" },
      { id: "world", label: "Dünya" },
      { id: "magic", label: "Büyü" },
    ],
  },
  {
    id: "scifi",
    label: "Sci-Fi & Cyberpunk",
    subgroups: [
      { id: "character", label: "Karakter" },
      { id: "technology", label: "Teknoloji" },
      { id: "location", label: "Mekân" },
      { id: "style", label: "Stil" },
    ],
  },
  {
    id: "weapon",
    label: "Silah & Ekipman",
    subgroups: [
      { id: "melee", label: "Yakın Dövüş" },
      { id: "ranged", label: "Uzak Dövüş" },
      { id: "defense", label: "Savunma" },
      { id: "detail", label: "Detay" },
    ],
  },
  {
    id: "product",
    label: "Ürün & Reklam",
    subgroups: [
      { id: "product", label: "Ürün" },
      { id: "shot", label: "Ürün Çekimi" },
      { id: "background", label: "Arka Plan" },
      { id: "ad", label: "Reklam" },
    ],
  },
  {
    id: "video",
    label: "Video",
    subgroups: [
      { id: "type", label: "Video Türü" },
      { id: "format", label: "Format" },
      { id: "movement", label: "Hareket" },
      { id: "transition", label: "Geçiş" },
    ],
  },
  {
    id: "text",
    label: "Metin & İçerik",
    subgroups: [
      { id: "content_type", label: "İçerik Türü" },
      { id: "audience", label: "Hedef Kitle" },
      { id: "language", label: "Dil" },
      { id: "tone", label: "Ton" },
      { id: "length", label: "Uzunluk" },
      { id: "structure", label: "Yapı" },
      { id: "output", label: "Output" },
    ],
  },
  {
    id: "code",
    label: "Kod & Yazılım",
    subgroups: [
      { id: "language", label: "Dil" },
      { id: "framework", label: "Framework" },
      { id: "database", label: "Database" },
      { id: "architecture", label: "Mimari" },
      { id: "output", label: "Output" },
    ],
  },
  {
    id: "ai",
    label: "AI / Prompt Ayarları",
    subgroups: [
      { id: "model", label: "Model" },
      { id: "settings", label: "Model Ayarları" },
      { id: "instruction", label: "Talimat" },
    ],
  },
  {
    id: "uiux",
    label: "UI / UX Tasarım",
    subgroups: [
      { id: "platform", label: "Platform" },
      { id: "layout", label: "Layout" },
      { id: "component", label: "Component" },
      { id: "style", label: "Design Style" },
    ],
  },
  {
    id: "photo",
    label: "Fotoğraf",
    subgroups: [
      { id: "type", label: "Fotoğraf Türü" },
      { id: "technique", label: "Çekim Tekniği" },
      { id: "character", label: "Fotoğraf Karakteri" },
    ],
  },
  {
    id: "quality",
    label: "Negative & Quality",
    subgroups: [
      { id: "quality", label: "Kalite" },
      { id: "anatomy", label: "Anatomik Hatalar" },
      { id: "visual", label: "Görsel Hatalar" },
      { id: "unwanted", label: "İstenmeyen Stil" },
    ],
  },
];

export const CATALOG_FIELDS: CatalogField[] = [
  // ===== 1. Karakter Oluşturma =====
  { id: "char_gender", label: "Cinsiyet", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "character.gender", options: opts(["Kadın", "Erkek", "Androjen", "Belirsiz"]) },
  { id: "char_age_group", label: "Yaş Grubu", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "character.age_group", options: opts(["Çocuk", "Genç", "Yetişkin", "Orta Yaşlı", "Yaşlı"]) },
  { id: "char_type", label: "Karakter Türü", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "character.type", options: opts(["İnsan", "Android", "Robot", "Cyborg", "Elf", "Ork", "Vampir", "Zombi", "Uzaylı", "Peri", "Melez", "Mitolojik Varlık"]) },
  { id: "char_role", label: "Rol", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "character.role", options: opts(["Savaşçı", "Büyücü", "Suikastçı", "Şövalye", "Kaşif", "Bilim İnsanı", "Öğrenci", "Doktor", "Asker", "Kraliçe", "Kral", "Hırsız", "Tüccar"]) },
  { id: "char_personality", label: "Kişilik", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "character.personality", options: opts(["Sakin", "Gizemli", "Neşeli", "Sert", "Cesur", "Zarif", "Asi", "Soğukkanlı", "Dost Canlısı", "Ciddi"]) },
  { id: "char_face_shape", label: "Yüz Şekli", type: "select", categoryId: "character", subgroupId: "identity", jsonPath: "face.shape", options: opts(["Oval", "Yuvarlak", "Kare", "Kalp", "Elmas", "Uzun"]) },
  { id: "char_skin_tone", label: "Ten Rengi", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.tone", options: opts(["Çok Açık", "Açık", "Buğday", "Esmer", "Koyu", "Çok Koyu"]) },
  { id: "char_skin_texture", label: "Cilt Dokusu", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.texture", options: opts(["Pürüzsüz", "Doğal", "Gözenekli", "Yaşlı", "Hasarlı"]) },
  { id: "char_freckles", label: "Çil", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.freckles", options: opts(["Yok", "Hafif", "Orta", "Yoğun"]) },
  { id: "char_tattoo", label: "Dövme", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.tattoo", options: opts(["Yok", "Küçük", "Büyük", "Full Body"]) },
  { id: "char_scar", label: "Yara İzi", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.scar", options: opts(["Yok", "İnce", "Belirgin"]) },
  { id: "char_eye_color", label: "Göz Rengi", type: "select", categoryId: "character", subgroupId: "eyes", jsonPath: "face.eyes.color", options: opts(["Mavi", "Yeşil", "Kahverengi", "Gri", "Ela", "Amber", "Mor", "Kırmızı", "Siyah"]) },
  { id: "char_eye_shape", label: "Göz Şekli", type: "select", categoryId: "character", subgroupId: "eyes", jsonPath: "face.eyes.shape", options: opts(["Badem", "Yuvarlak", "Çekik", "Büyük", "Küçük", "Derin Set"]) },
  { id: "char_eye_size", label: "Göz Boyutu", type: "select", categoryId: "character", subgroupId: "eyes", jsonPath: "face.eyes.size", options: opts(["Küçük", "Orta", "Büyük"]) },
  { id: "char_eye_effect", label: "Göz Efekti", type: "select", categoryId: "character", subgroupId: "eyes", jsonPath: "face.eyes.effect", options: opts(["Yok", "Glow", "Enerji", "Büyülü", "Neon"]) },
  { id: "char_eyebrow_shape", label: "Kaş Şekli", type: "select", categoryId: "character", subgroupId: "eyebrows", jsonPath: "face.eyebrows.shape", options: opts(["Düz", "Kavisli", "Keskin", "Doğal"]) },
  { id: "char_eyebrow_color", label: "Kaş Rengi", type: "select", categoryId: "character", subgroupId: "eyebrows", jsonPath: "face.eyebrows.color", options: opts(["Siyah", "Kahverengi", "Sarı", "Kızıl", "Gri", "Beyaz"]) },
  { id: "char_nose_shape", label: "Burun Şekli", type: "select", categoryId: "character", subgroupId: "nose", jsonPath: "face.nose.shape", options: opts(["Düz", "İnce", "Geniş", "Kalkık", "Roma", "Keskin"]) },
  { id: "char_lip_shape", label: "Dudak Şekli", type: "select", categoryId: "character", subgroupId: "mouth", jsonPath: "face.mouth.lip_shape", options: opts(["İnce", "Orta", "Dolgun", "Çok Dolgun"]) },
  { id: "char_lip_color", label: "Dudak Rengi", type: "select", categoryId: "character", subgroupId: "mouth", jsonPath: "face.mouth.lip_color", options: opts(["Doğal", "Pembe", "Kırmızı", "Bordo", "Mor", "Koyu"]) },
  { id: "char_teeth", label: "Diş", type: "select", categoryId: "character", subgroupId: "mouth", jsonPath: "face.mouth.teeth", options: opts(["Görünmüyor", "Doğal", "Beyaz", "Vampir Dişleri"]) },
  { id: "char_hair_length", label: "Saç Uzunluğu", type: "select", categoryId: "character", subgroupId: "hair", jsonPath: "hair.length", options: opts(["Kel", "Çok Kısa", "Kısa", "Orta", "Uzun", "Çok Uzun"]) },
  { id: "char_hair_style", label: "Saç Şekli", type: "select", categoryId: "character", subgroupId: "hair", jsonPath: "hair.style", options: opts(["Düz", "Dalgalı", "Kıvırcık", "Afro", "Örgülü", "At Kuyruğu", "Topuz", "Bob", "Pixie", "Dağınık"]) },
  { id: "char_hair_color", label: "Saç Rengi", type: "select", categoryId: "character", subgroupId: "hair", jsonPath: "hair.color", options: opts(["Siyah", "Kahverengi", "Sarı", "Platin", "Beyaz", "Gri", "Gümüş", "Kızıl", "Mor", "Mavi", "Yeşil", "Pembe"]) },
  { id: "char_hair_texture", label: "Saç Dokusu", type: "select", categoryId: "character", subgroupId: "hair", jsonPath: "hair.texture", options: opts(["İnce", "Normal", "Kalın", "İpeksi", "Kabarık"]) },
  { id: "char_bangs", label: "Perçem", type: "select", categoryId: "character", subgroupId: "hair", jsonPath: "hair.bangs", options: opts(["Yok", "Düz", "Yan", "Perde", "Kısa"]) },
  { id: "char_beard", label: "Sakal", type: "select", categoryId: "character", subgroupId: "facial_hair", jsonPath: "facial_hair.beard", options: opts(["Yok", "Kirli Sakal", "Kısa", "Orta", "Uzun", "Tam Sakal"]) },
  { id: "char_mustache", label: "Bıyık", type: "select", categoryId: "character", subgroupId: "facial_hair", jsonPath: "facial_hair.mustache", options: opts(["Yok", "İnce", "Kalın", "Klasik", "Dönük"]) },
  { id: "char_body_type", label: "Vücut Tipi", type: "select", categoryId: "character", subgroupId: "body", jsonPath: "body.type", options: opts(["Zayıf", "İnce", "Atletik", "Fit", "Kaslı", "Güçlü", "Kilolu"]) },
  { id: "char_height", label: "Boy", type: "select", categoryId: "character", subgroupId: "body", jsonPath: "body.height", options: opts(["Çok Kısa", "Kısa", "Orta", "Uzun", "Çok Uzun"]) },
  { id: "char_muscle_level", label: "Kas Seviyesi", type: "select", categoryId: "character", subgroupId: "body", jsonPath: "body.muscle_level", options: opts(["Düşük", "Orta", "Yüksek", "Çok Yüksek"]) },
  { id: "char_body_proportion", label: "Vücut Oranı", type: "select", categoryId: "character", subgroupId: "body", jsonPath: "body.proportion", options: opts(["Gerçekçi", "Stilize", "Anime", "Karikatürize"]) },

  // ===== 2. Kıyafet & Moda =====
  { id: "cloth_style", label: "Stil", type: "select", categoryId: "clothing", subgroupId: "style", jsonPath: "clothing.style", options: opts(["Casual", "Formal", "Streetwear", "Luxury", "Vintage", "Minimal", "Sportif", "Goth", "Punk", "Cyberpunk", "Fantasy", "Traditional"]) },
  { id: "cloth_era", label: "Moda Dönemi", type: "select", categoryId: "clothing", subgroupId: "style", jsonPath: "clothing.era", options: opts(["Modern", "1920s", "1950s", "1970s", "1980s", "1990s", "Futuristic"]) },
  { id: "cloth_top", label: "Üst Türü", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.type", options: opts(["Tişört", "Gömlek", "Bluz", "Kazak", "Sweatshirt", "Hoodie", "Ceket", "Deri Ceket", "Mont", "Kaban", "Zırh"]) },
  { id: "cloth_top_sleeve", label: "Kol Tipi", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.sleeve", options: opts(["Kısa", "Uzun", "Kolsuz", "Bol", "Dar"]) },
  { id: "cloth_top_collar", label: "Yaka", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.collar", options: opts(["Yuvarlak", "V Yaka", "Gömlek Yaka", "Balıkçı", "Açık Yaka"]) },
  { id: "cloth_bottom", label: "Alt Türü", type: "select", categoryId: "clothing", subgroupId: "bottom", jsonPath: "clothing.bottom.type", options: opts(["Jean", "Pantolon", "Şort", "Etek", "Tayt", "Kargo Pantolon", "Eşofman"]) },
  { id: "cloth_bottom_fit", label: "Kesim", type: "select", categoryId: "clothing", subgroupId: "bottom", jsonPath: "clothing.bottom.fit", options: opts(["Skinny", "Slim", "Regular", "Relaxed", "Oversize", "Wide Leg"]) },
  { id: "cloth_shoes", label: "Ayakkabı Türü", type: "select", categoryId: "clothing", subgroupId: "shoes", jsonPath: "clothing.shoes.type", options: opts(["Sneaker", "Bot", "Çizme", "Topuklu", "Sandalet", "Loafer", "Spor Ayakkabı"]) },
  { id: "cloth_shoes_color", label: "Ayakkabı Rengi", type: "select", categoryId: "clothing", subgroupId: "shoes", jsonPath: "clothing.shoes.color", options: opts(["Siyah", "Beyaz", "Kahverengi", "Kırmızı", "Gümüş", "Altın"]) },
  { id: "cloth_fabric", label: "Kumaş", type: "select", categoryId: "clothing", subgroupId: "fabric", jsonPath: "clothing.fabric.material", options: opts(["Pamuk", "Keten", "İpek", "Kadife", "Deri", "Denim", "Yün", "Saten", "Naylon"]) },
  { id: "cloth_fabric_texture", label: "Doku", type: "select", categoryId: "clothing", subgroupId: "fabric", jsonPath: "clothing.fabric.texture", options: opts(["Mat", "Parlak", "Yumuşak", "Kalın", "İnce", "Metalik"]) },
  { id: "cloth_main_color", label: "Ana Renk", type: "color", categoryId: "clothing", subgroupId: "color_pattern", jsonPath: "clothing.color.primary", options: [] },
  { id: "cloth_pattern", label: "Desen", type: "select", categoryId: "clothing", subgroupId: "color_pattern", jsonPath: "clothing.color.pattern", options: opts(["Düz", "Çizgili", "Kareli", "Çiçekli", "Geometrik", "Kamuflaj", "Gradient"]) },
  { id: "cloth_pattern_intensity", label: "Desen Yoğunluğu", type: "slider", categoryId: "clothing", subgroupId: "color_pattern", jsonPath: "clothing.color.pattern_intensity", options: [], min: 0, max: 100, step: 5 },

  // ===== 3. Aksesuar =====
  { id: "acc_necklace", label: "Kolye", type: "select", categoryId: "accessory", subgroupId: "jewelry", jsonPath: "accessories.jewelry.necklace", options: opts(["Yok", "İnce Zincir", "Kalın Zincir", "Taşlı Kolye", "Madalyon"]) },
  { id: "acc_earrings", label: "Küpe", type: "select", categoryId: "accessory", subgroupId: "jewelry", jsonPath: "accessories.jewelry.earrings", options: opts(["Yok", "Halka", "Taşlı", "Sade", "Piercing"]) },
  { id: "acc_ring", label: "Yüzük", type: "select", categoryId: "accessory", subgroupId: "jewelry", jsonPath: "accessories.jewelry.ring", options: opts(["Yok", "Sade Yüzük", "Taşlı Yüzük", "Büyülü Yüzük"]) },
  { id: "acc_head", label: "Baş Aksesuarı", type: "select", categoryId: "accessory", subgroupId: "head", jsonPath: "accessories.head", options: opts(["Yok", "Şapka", "Bere", "Taç", "Bandana", "Saç Aksesuarı"]) },
  { id: "acc_glasses", label: "Gözlük", type: "select", categoryId: "accessory", subgroupId: "face", jsonPath: "accessories.face.glasses", options: opts(["Yok", "Şeffaf Gözlük", "Güneş Gözlüğü", "Maske", "Yüz Piercingi"]) },
  { id: "acc_bag", label: "Çanta", type: "select", categoryId: "accessory", subgroupId: "other", jsonPath: "accessories.bag", options: opts(["Yok", "Çanta", "Sırt Çantası", "Bel Çantası"]) },
  { id: "acc_extras", label: "Diğer Aksesuarlar", type: "multi_select", categoryId: "accessory", subgroupId: "other", jsonPath: "accessories.extras", options: opts(["Eldiven", "Saat", "Bileklik", "Kulaklık", "Telefon", "Anahtarlık", "Broş"]) },

  // ===== 4. Poz & Hareket =====
  { id: "pose_base", label: "Temel Poz", type: "select", categoryId: "pose", subgroupId: "base", jsonPath: "pose.base", options: opts(["Ayakta", "Oturuyor", "Yatıyor", "Diz Çöküyor", "Yürüyor", "Koşuyor", "Zıplıyor", "Dans Ediyor"]) },
  { id: "pose_direction", label: "Vücut Yönü", type: "select", categoryId: "pose", subgroupId: "direction", jsonPath: "pose.direction", options: opts(["Önden", "Arkadan", "Yandan", "3/4", "Kameraya Dönük", "Kameradan Uzak"]) },
  { id: "pose_hands", label: "El Pozisyonu", type: "select", categoryId: "pose", subgroupId: "hands", jsonPath: "pose.hands", options: opts(["Eller Aşağıda", "Ceplerde", "Göğüste", "Yüzde", "Saçta", "Bir Şey Tutuyor", "Silah Tutuyor", "Telefon Tutuyor"]) },
  { id: "pose_head", label: "Baş Pozisyonu", type: "select", categoryId: "pose", subgroupId: "head", jsonPath: "pose.head", options: opts(["Düz", "Sola Eğik", "Sağa Eğik", "Yukarı Bakıyor", "Aşağı Bakıyor", "Kameraya Bakıyor", "Kameradan Uzak Bakıyor"]) },
  { id: "pose_movement", label: "Hareket Karakteri", type: "select", categoryId: "pose", subgroupId: "movement", jsonPath: "pose.movement", options: opts(["Statik", "Doğal", "Dinamik", "Aksiyon", "Hızlı", "Yavaş", "Zarif"]) },

  // ===== 5. Yüz İfadesi =====
  { id: "expr_emotion", label: "Duygu", type: "select", categoryId: "expression", subgroupId: "emotion", jsonPath: "expression.emotion", options: opts(["Mutlu", "Üzgün", "Öfkeli", "Korkmuş", "Şaşkın", "Sakin", "Gizemli", "Ciddi", "Romantik", "Kararlı", "Neşeli"]) },
  { id: "expr_eyes", label: "Göz İfadesi", type: "select", categoryId: "expression", subgroupId: "eyes", jsonPath: "expression.eyes", options: opts(["Yumuşak Bakış", "Yoğun Bakış", "Keskin Bakış", "Uykulu", "Şaşkın", "Kameraya Bakış", "Uzaklara Bakış"]) },
  { id: "expr_mouth", label: "Ağız", type: "select", categoryId: "expression", subgroupId: "mouth", jsonPath: "expression.mouth", options: opts(["Kapalı", "Hafif Gülümseme", "Gülümseme", "Kahkaha", "Ciddi", "Hafif Açık"]) },
  { id: "expr_intensity", label: "Yoğunluk", type: "slider", categoryId: "expression", subgroupId: "intensity", jsonPath: "expression.intensity", options: [], min: 0, max: 100, step: 5 },

  // ===== 6. Ortam & Mekân =====
  { id: "env_nature", label: "Doğa Mekânı", type: "select", categoryId: "environment", subgroupId: "nature", jsonPath: "environment.location", options: opts(["Orman", "Dağ", "Çöl", "Plaj", "Okyanus", "Göl", "Şelale", "Mağara", "Çayır", "Kar Manzarası"]) },
  { id: "env_city", label: "Şehir Mekânı", type: "select", categoryId: "environment", subgroupId: "city", jsonPath: "environment.location", options: opts(["Modern Şehir", "Eski Şehir", "Tokyo Tarzı", "New York Tarzı", "Avrupa Şehri", "Gece Şehri", "Neon Şehir", "Endüstriyel Bölge"]) },
  { id: "env_interior", label: "İç Mekân", type: "select", categoryId: "environment", subgroupId: "interior", jsonPath: "environment.location", options: opts(["Ev", "Ofis", "Kafe", "Restoran", "Otel", "Kütüphane", "Stüdyo", "Hastane", "Mağaza", "Spor Salonu"]) },
  { id: "env_fantasy", label: "Fantastik Mekân", type: "select", categoryId: "environment", subgroupId: "fantasy", jsonPath: "environment.location", options: opts(["Büyülü Orman", "Kale", "Antik Tapınak", "Ejderha Mağarası", "Büyü Akademisi", "Mitolojik Şehir"]) },
  { id: "env_scifi", label: "Sci-Fi Mekân", type: "select", categoryId: "environment", subgroupId: "scifi", jsonPath: "environment.location", options: opts(["Uzay İstasyonu", "Laboratuvar", "Cyberpunk Sokak", "Gelecek Şehri", "Robot Fabrikası", "Uzay Gemisi"]) },

  // ===== 7. Hava & Atmosfer =====
  { id: "weather_condition", label: "Hava Durumu", type: "select", categoryId: "weather", subgroupId: "weather", jsonPath: "weather.condition", options: opts(["Güneşli", "Bulutlu", "Yağmurlu", "Karlı", "Sisli", "Fırtınalı", "Açık Gökyüzü"]) },
  { id: "weather_atmosphere", label: "Atmosfer", type: "select", categoryId: "weather", subgroupId: "atmosphere", jsonPath: "weather.atmosphere", options: opts(["Sakin", "Gizemli", "Karanlık", "Romantik", "Epik", "Gerilimli", "Huzurlu", "Rüya Gibi"]) },
  { id: "weather_particle", label: "Partikül", type: "multi_select", categoryId: "weather", subgroupId: "particle", jsonPath: "weather.particles", options: opts(["Toz", "Kar", "Yağmur", "Kül", "Yaprak", "Kıvılcım", "Sis", "Duman"]) },
  { id: "weather_time", label: "Zaman", type: "select", categoryId: "weather", subgroupId: "time", jsonPath: "weather.time_of_day", options: opts(["Şafak", "Sabah", "Öğlen", "Gün Batımı", "Alacakaranlık", "Gece", "Gece Yarısı"]) },

  // ===== 8. Işıklandırma =====
  { id: "light_source", label: "Işık Kaynağı", type: "select", categoryId: "lighting", subgroupId: "source", jsonPath: "lighting.source", options: opts(["Güneş", "Ay", "Neon", "Mum", "Sokak Lambası", "Stüdyo Işığı", "Ateş", "Büyülü Işık", "LED"]) },
  { id: "light_direction", label: "Işık Yönü", type: "select", categoryId: "lighting", subgroupId: "direction", jsonPath: "lighting.direction", options: opts(["Önden", "Arkadan", "Yandan", "Üstten", "Alttan", "Rim Light"]) },
  { id: "light_technique", label: "Teknik", type: "select", categoryId: "lighting", subgroupId: "technique", jsonPath: "lighting.technique", options: opts(["Soft Light", "Hard Light", "Diffused", "Volumetric", "Global Illumination", "Cinematic Lighting", "Studio Lighting"]) },
  { id: "light_character", label: "Işık Karakteri", type: "select", categoryId: "lighting", subgroupId: "character", jsonPath: "lighting.character", options: opts(["High Key", "Low Key", "Dramatic", "Moody", "Natural", "Soft"]) },
  { id: "light_color", label: "Işık Rengi", type: "select", categoryId: "lighting", subgroupId: "color", jsonPath: "lighting.color", options: opts(["Sıcak", "Soğuk", "Nötr", "Turuncu/Mavi", "Mor/Mavi", "Kırmızı", "Yeşil"]) },

  // ===== 9. Kamera & Lens =====
  { id: "cam_shot", label: "Çekim Türü", type: "select", categoryId: "camera", subgroupId: "shot", jsonPath: "camera.shot_type", options: opts(["Portre", "Tam Boy", "Yarım Boy", "Yakın Plan", "Extreme Close-Up", "Ürün Çekimi", "Manzara"]) },
  { id: "cam_angle", label: "Kamera Açısı", type: "select", categoryId: "camera", subgroupId: "angle", jsonPath: "camera.angle", options: opts(["Göz Hizası", "Low Angle", "High Angle", "Bird's Eye", "Worm's Eye", "Dutch Angle", "Over-the-Shoulder"]) },
  { id: "cam_lens", label: "Lens (mm)", type: "select", categoryId: "camera", subgroupId: "lens", jsonPath: "camera.lens_mm", options: opts(["14mm", "24mm", "35mm", "50mm", "85mm", "105mm", "135mm", "Telephoto", "Macro", "Fisheye"]) },
  { id: "cam_aperture", label: "Diyafram", type: "select", categoryId: "camera", subgroupId: "aperture", jsonPath: "camera.aperture", options: opts(["f/1.2", "f/1.4", "f/1.8", "f/2.8", "f/4", "f/5.6", "f/8", "f/11"]) },
  { id: "cam_focus", label: "Odak", type: "select", categoryId: "camera", subgroupId: "focus", jsonPath: "camera.focus", options: opts(["Konu Odakta", "Arka Plan Odakta", "Her Şey Odakta", "Shallow Depth of Field", "Deep Depth of Field"]) },
  { id: "cam_movement", label: "Kamera Hareketi", type: "select", categoryId: "camera", subgroupId: "movement", jsonPath: "camera.movement", options: opts(["Sabit", "Pan", "Tilt", "Dolly", "Tracking", "Handheld", "Orbit"]) },

  // ===== 10. Görsel Stil =====
  { id: "style_realism", label: "Gerçekçilik", type: "select", categoryId: "visual_style", subgroupId: "realism", jsonPath: "style.realism", options: opts(["Photorealistic", "Hyperrealistic", "Realistic", "Stylized Realism", "Semi-Realistic"]) },
  { id: "style_3d", label: "3D Stili", type: "select", categoryId: "visual_style", subgroupId: "three_d", jsonPath: "style.three_d", options: opts(["3D Character", "3D Animation", "Stylized 3D", "Realistic 3D", "Game Character", "CGI"]) },
  { id: "style_anime", label: "Anime Stili", type: "select", categoryId: "visual_style", subgroupId: "anime", jsonPath: "style.anime", options: opts(["Anime", "Manga", "Japanese Animation", "Cel Shading", "Semi-Realistic Anime"]) },
  { id: "style_art", label: "Sanat Stili", type: "select", categoryId: "visual_style", subgroupId: "art", jsonPath: "style.art", options: opts(["Oil Painting", "Watercolor", "Acrylic", "Pencil", "Ink", "Concept Art", "Digital Painting", "Matte Painting"]) },
  { id: "style_cinematic", label: "Sinematik Stil", type: "select", categoryId: "visual_style", subgroupId: "cinematic", jsonPath: "style.cinematic", options: opts(["Cinematic", "Film Still", "Epic", "Documentary", "Dark Cinematic"]) },
  { id: "style_design", label: "Tasarım Dili", type: "select", categoryId: "visual_style", subgroupId: "design", jsonPath: "style.design_language", options: opts(["Minimal", "Luxury", "Editorial", "Fashion", "Retro", "Futuristic", "Experimental"]) },

  // ===== 11. Renk & Palet =====
  { id: "color_primary", label: "Ana Renk", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.primary", options: [] },
  { id: "color_secondary", label: "İkincil Renk", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.secondary", options: [] },
  { id: "color_accent", label: "Vurgu Rengi", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.accent", options: [] },
  { id: "color_background", label: "Arka Plan Rengi", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.background", options: [] },
  { id: "color_palette", label: "Renk Paleti", type: "select", categoryId: "color", subgroupId: "palette", jsonPath: "color.palette", options: opts(["Monochrome", "Complementary", "Analogous", "Triadic", "Pastel", "Neon", "Earth Tones", "Black & White"]) },
  { id: "color_saturation", label: "Saturation", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.saturation", options: [], min: -100, max: 100, step: 5 },
  { id: "color_contrast", label: "Contrast", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.contrast", options: [], min: -100, max: 100, step: 5 },
  { id: "color_brightness", label: "Brightness", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.brightness", options: [], min: -100, max: 100, step: 5 },
  { id: "color_temperature", label: "Temperature", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.temperature", options: [], min: -100, max: 100, step: 5 },

  // ===== 12. Kompozisyon =====
  { id: "comp_position", label: "Konu Konumu", type: "select", categoryId: "composition", subgroupId: "position", jsonPath: "composition.subject_position", options: opts(["Merkez", "Sol", "Sağ", "Üst", "Alt", "Köşe"]) },
  { id: "comp_framing", label: "Kadraj", type: "select", categoryId: "composition", subgroupId: "framing", jsonPath: "composition.framing", options: opts(["Full Frame", "Medium Shot", "Close-Up", "Wide Shot", "Extreme Wide"]) },
  { id: "comp_depth", label: "Derinlik", type: "select", categoryId: "composition", subgroupId: "depth", jsonPath: "composition.depth", options: opts(["Ön Plan", "Orta Plan", "Arka Plan", "Katmanlı"]) },
  { id: "comp_perspective", label: "Perspektif", type: "select", categoryId: "composition", subgroupId: "perspective", jsonPath: "composition.perspective", options: opts(["Normal", "Geniş", "Derin", "Distorted", "Forced Perspective"]) },
  { id: "comp_technique", label: "Kompozisyon Tekniği", type: "select", categoryId: "composition", subgroupId: "technique", jsonPath: "composition.technique", options: opts(["Rule of Thirds", "Centered Composition", "Symmetry", "Leading Lines", "Framing", "Negative Space", "Diagonal Composition", "Layering", "Golden Ratio"]) },

  // ===== 13. Görsel Efektler =====
  { id: "fx_light", label: "Işık Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "light", jsonPath: "effects.light", options: opts(["Glow", "Bloom", "Lens Flare", "Light Rays", "God Rays", "Volumetric Light"]) },
  { id: "fx_atmospheric", label: "Atmosferik Efektler", type: "multi_select", categoryId: "effects", subgroupId: "atmospheric", jsonPath: "effects.atmospheric", options: opts(["Fog", "Smoke", "Dust", "Haze", "Mist"]) },
  { id: "fx_nature", label: "Doğa Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "nature", jsonPath: "effects.nature", options: opts(["Rain", "Snow", "Leaves", "Petals", "Ash", "Sand"]) },
  { id: "fx_energy", label: "Enerji Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "energy", jsonPath: "effects.energy", options: opts(["Magic Particles", "Energy", "Lightning", "Fire", "Ice", "Electricity", "Aura"]) },
  { id: "fx_camera", label: "Kamera Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "camera", jsonPath: "effects.camera", options: opts(["Motion Blur", "Depth of Field", "Chromatic Aberration", "Film Grain", "Vignette", "Bokeh"]) },
  { id: "fx_material", label: "Malzeme Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "material", jsonPath: "effects.material", options: opts(["Reflection", "Refraction", "Glass", "Wet Surface", "Metallic Shine"]) },

  // ===== 14. Fantastik =====
  { id: "fantasy_character", label: "Fantastik Karakter", type: "select", categoryId: "fantasy", subgroupId: "character", jsonPath: "fantasy.character", options: opts(["Elf", "Dark Elf", "Dwarf", "Orc", "Fairy", "Vampire", "Demon", "Angel", "Dragon Rider", "Wizard", "Witch", "Knight"]) },
  { id: "fantasy_creature", label: "Yaratık", type: "select", categoryId: "fantasy", subgroupId: "creature", jsonPath: "fantasy.creature", options: opts(["Dragon", "Phoenix", "Griffin", "Wolf", "Giant", "Elemental", "Monster", "Mythical Beast"]) },
  { id: "fantasy_world", label: "Dünya", type: "select", categoryId: "fantasy", subgroupId: "world", jsonPath: "fantasy.world", options: opts(["Fantasy Kingdom", "Ancient Ruins", "Magical Forest", "Floating Islands", "Underworld", "Celestial Realm"]) },
  { id: "fantasy_magic", label: "Büyü Türü", type: "select", categoryId: "fantasy", subgroupId: "magic", jsonPath: "fantasy.magic", options: opts(["Fire Magic", "Ice Magic", "Lightning Magic", "Dark Magic", "Light Magic", "Nature Magic", "Arcane Magic", "Healing Magic"]) },

  // ===== 15. Sci-Fi & Cyberpunk =====
  { id: "scifi_character", label: "Sci-Fi Karakter", type: "select", categoryId: "scifi", subgroupId: "character", jsonPath: "scifi.character", options: opts(["Android", "Cyborg", "Robot", "Space Soldier", "Hacker", "Pilot", "Engineer"]) },
  { id: "scifi_technology", label: "Teknoloji", type: "select", categoryId: "scifi", subgroupId: "technology", jsonPath: "scifi.technology", options: opts(["Hologram", "Neural Interface", "Cybernetic Arm", "Mechanical Eye", "Energy Core", "AI Assistant", "Nanotechnology"]) },
  { id: "scifi_location", label: "Mekân", type: "select", categoryId: "scifi", subgroupId: "location", jsonPath: "scifi.location", options: opts(["Cyberpunk Street", "Megacity", "Space Station", "Laboratory", "Factory", "Spacecraft", "Neon Alley"]) },
  { id: "scifi_style", label: "Stil", type: "select", categoryId: "scifi", subgroupId: "style", jsonPath: "scifi.style", options: opts(["Cyberpunk", "Synthwave", "Futuristic", "Industrial Sci-Fi", "Retro-Futurism", "Space Opera"]) },

  // ===== 16. Silah & Ekipman =====
  { id: "weapon_melee", label: "Yakın Dövüş Silahı", type: "select", categoryId: "weapon", subgroupId: "melee", jsonPath: "equipment.melee_weapon", options: opts(["Kılıç", "Katana", "Balta", "Mızrak", "Hançer", "Çekiç", "Asa"]) },
  { id: "weapon_ranged", label: "Uzak Dövüş Silahı", type: "select", categoryId: "weapon", subgroupId: "ranged", jsonPath: "equipment.ranged_weapon", options: opts(["Yay", "Arbalet", "Enerji Silahı", "Bilim Kurgu Silahı", "Fantastik Menzilli Silah"]) },
  { id: "weapon_defense", label: "Savunma Ekipmanı", type: "multi_select", categoryId: "weapon", subgroupId: "defense", jsonPath: "equipment.defense", options: opts(["Kalkan", "Zırh", "Kask", "Eldiven", "Omuzluk"]) },
  { id: "weapon_detail", label: "Ekipman Detayı", type: "select", categoryId: "weapon", subgroupId: "detail", jsonPath: "equipment.material_detail", options: opts(["Metal", "Deri", "Ahşap", "Kristal", "Enerji", "Rün", "Gravür"]) },

  // ===== 17. Ürün & Reklam =====
  { id: "product_category", label: "Ürün Kategorisi", type: "select", categoryId: "product", subgroupId: "product", jsonPath: "product.category", options: opts(["Telefon", "Tablet", "Laptop", "Saat", "Ayakkabı", "Çanta", "Kozmetik", "Mobilya", "Elektronik", "Otomotiv"]) },
  { id: "product_shot", label: "Çekim Türü", type: "select", categoryId: "product", subgroupId: "shot", jsonPath: "product.shot_type", options: opts(["Studio Product", "Hero Shot", "Close-Up", "Lifestyle", "Flat Lay", "360 Product"]) },
  { id: "product_background", label: "Arka Plan", type: "select", categoryId: "product", subgroupId: "background", jsonPath: "product.background", options: opts(["Beyaz", "Siyah", "Gradient", "Minimal", "Stüdyo", "Lifestyle", "Doğal"]) },
  { id: "product_ad_style", label: "Reklam Stili", type: "select", categoryId: "product", subgroupId: "ad", jsonPath: "product.ad_style", options: opts(["Luxury", "Minimal", "Premium", "Commercial", "Editorial", "Social Media Ad"]) },
  { id: "product_reference_url", label: "Referans Görsel URL", type: "url", categoryId: "product", subgroupId: "product", jsonPath: "product.reference_url", options: [], placeholder: "https://…" },

  // ===== 18. Video =====
  { id: "video_type", label: "Video Türü", type: "select", categoryId: "video", subgroupId: "type", jsonPath: "video.type", options: opts(["Cinematic", "Commercial", "Short Film", "Music Video", "Social Media", "Product Video", "Animation"]) },
  { id: "video_duration", label: "Süre (sn)", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.duration_seconds", options: opts(["3", "5", "10", "15", "30", "60"]) },
  { id: "video_aspect_ratio", label: "Aspect Ratio", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.aspect_ratio", options: opts(["1:1", "4:5", "16:9", "9:16", "21:9"]) },
  { id: "video_fps", label: "FPS", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.fps", options: opts(["24", "25", "30", "60", "120"]) },
  { id: "video_camera_movement", label: "Kamera Hareketi", type: "select", categoryId: "video", subgroupId: "movement", jsonPath: "video.camera_movement", options: opts(["Static", "Pan", "Tilt", "Dolly", "Tracking", "Orbit", "Handheld", "Crane"]) },
  { id: "video_character_movement", label: "Karakter Hareketi", type: "multi_select", categoryId: "video", subgroupId: "movement", jsonPath: "video.character_movement", options: opts(["Walk", "Run", "Turn", "Look", "Gesture", "Fight", "Dance", "Sit", "Stand"]) },
  { id: "video_transition", label: "Geçiş", type: "select", categoryId: "video", subgroupId: "transition", jsonPath: "video.transition", options: opts(["Cut", "Fade", "Dissolve", "Zoom", "Match Cut", "Whip Pan"]) },

  // ===== 19. Metin & İçerik =====
  { id: "text_content_type", label: "İçerik Türü", type: "select", categoryId: "text", subgroupId: "content_type", jsonPath: "content.type", options: opts(["Blog", "Makale", "Sosyal Medya", "Reklam", "E-posta", "Ürün Açıklaması", "Haber", "Senaryo", "Hikâye", "Şiir"]) },
  { id: "text_audience", label: "Hedef Kitle", type: "select", categoryId: "text", subgroupId: "audience", jsonPath: "content.audience", options: opts(["Genel", "Çocuk", "Genç", "Profesyonel", "Teknik", "Akademik", "Pazarlama"]) },
  { id: "text_language", label: "Dil", type: "select", categoryId: "text", subgroupId: "language", jsonPath: "content.language", options: opts(["Türkçe", "İngilizce", "Almanca", "Fransızca", "İspanyolca", "İtalyanca", "Arapça", "Çok Dilli"]) },
  { id: "text_tone", label: "Ton", type: "select", categoryId: "text", subgroupId: "tone", jsonPath: "content.tone", options: opts(["Profesyonel", "Samimi", "Eğlenceli", "Resmi", "Akademik", "İkna Edici", "İlham Verici", "Minimal"]) },
  { id: "text_length", label: "Uzunluk", type: "select", categoryId: "text", subgroupId: "length", jsonPath: "content.length", options: opts(["Çok Kısa", "Kısa", "Orta", "Uzun", "Çok Uzun"]) },
  { id: "text_word_count", label: "Kelime Sayısı", type: "number", categoryId: "text", subgroupId: "length", jsonPath: "content.word_count", options: [], min: 0, step: 50 },
  { id: "text_structure", label: "Yapı", type: "multi_select", categoryId: "text", subgroupId: "structure", jsonPath: "content.structure", options: opts(["Başlık", "Giriş", "Bölümler", "Maddeler", "Sonuç", "CTA"]) },
  { id: "text_output", label: "Output Formatı", type: "select", categoryId: "text", subgroupId: "output", jsonPath: "content.output_format", options: opts(["Plain Text", "Markdown", "JSON", "HTML", "Table", "Bullets"]) },

  // ===== 20. Kod & Yazılım =====
  { id: "code_language", label: "Programlama Dili", type: "select", categoryId: "code", subgroupId: "language", jsonPath: "code.language", options: opts(["TypeScript", "JavaScript", "Python", "Java", "C#", "C++", "Go", "Rust", "PHP", "SQL", "Swift", "Kotlin"]) },
  { id: "code_framework", label: "Framework", type: "select", categoryId: "code", subgroupId: "framework", jsonPath: "code.framework", options: opts(["Next.js", "React", "Vue", "Angular", "Svelte", "Flutter", "React Native", "Node.js", "Django", "Laravel"]) },
  { id: "code_database", label: "Database", type: "select", categoryId: "code", subgroupId: "database", jsonPath: "code.database", options: opts(["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Supabase", "Firebase", "Redis"]) },
  { id: "code_architecture", label: "Mimari", type: "select", categoryId: "code", subgroupId: "architecture", jsonPath: "code.architecture", options: opts(["Monolith", "REST API", "GraphQL", "Microservices", "Serverless", "Event Driven"]) },
  { id: "code_output", label: "Output", type: "multi_select", categoryId: "code", subgroupId: "output", jsonPath: "code.output", options: opts(["Code", "Explanation", "Tests", "Documentation", "JSON", "Diff", "File Structure"]) },

  // ===== 21. AI / Prompt Ayarları =====
  { id: "ai_model", label: "Model", type: "select", categoryId: "ai", subgroupId: "model", jsonPath: "ai.model", options: opts(["GPT", "Claude", "Gemini", "Llama", "Mistral", "Image Model", "Video Model", "Custom Model"]) },
  { id: "ai_temperature", label: "Temperature", type: "slider", categoryId: "ai", subgroupId: "settings", jsonPath: "ai.settings.temperature", options: [], min: 0, max: 100, step: 5 },
  { id: "ai_max_tokens", label: "Max Tokens", type: "number", categoryId: "ai", subgroupId: "settings", jsonPath: "ai.settings.max_tokens", options: [], min: 0, step: 100 },
  { id: "ai_role", label: "Role", type: "text", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.role", options: [], placeholder: "Örn. Kıdemli backend mühendisi" },
  { id: "ai_objective", label: "Objective", type: "textarea", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.objective", options: [] },
  { id: "ai_constraints", label: "Constraints", type: "textarea", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.constraints", options: [] },

  // ===== 22. UI / UX Tasarım =====
  { id: "uiux_platform", label: "Platform", type: "select", categoryId: "uiux", subgroupId: "platform", jsonPath: "ui.platform", options: opts(["Web", "Mobile Web", "iOS", "Android", "Desktop", "Tablet"]) },
  { id: "uiux_layout", label: "Layout", type: "select", categoryId: "uiux", subgroupId: "layout", jsonPath: "ui.layout", options: opts(["Dashboard", "Landing Page", "Feed", "Profile", "Settings", "Admin", "E-commerce", "SaaS"]) },
  { id: "uiux_component", label: "Component", type: "multi_select", categoryId: "uiux", subgroupId: "component", jsonPath: "ui.components", options: opts(["Navbar", "Sidebar", "Card", "Modal", "Form", "Table", "Tabs", "Accordion", "Dropdown", "Toast", "Search", "Pagination"]) },
  { id: "uiux_style", label: "Design Style", type: "select", categoryId: "uiux", subgroupId: "style", jsonPath: "ui.design_style", options: opts(["Minimal", "Glassmorphism", "Neumorphism", "Editorial", "Luxury", "Brutalist", "Soft UI", "Material", "Apple-like", "Futuristic"]) },

  // ===== 23. Fotoğraf =====
  { id: "photo_type", label: "Fotoğraf Türü", type: "select", categoryId: "photo", subgroupId: "type", jsonPath: "photo.type", options: opts(["Portrait", "Fashion", "Street", "Landscape", "Product", "Architecture", "Food", "Automotive", "Wedding", "Documentary"]) },
  { id: "photo_technique", label: "Çekim Tekniği", type: "select", categoryId: "photo", subgroupId: "technique", jsonPath: "photo.technique", options: opts(["Long Exposure", "HDR", "Macro", "Shallow DOF", "Deep DOF", "Motion Blur", "Freeze Motion"]) },
  { id: "photo_character", label: "Fotoğraf Karakteri", type: "select", categoryId: "photo", subgroupId: "character", jsonPath: "photo.character", options: opts(["Editorial", "Cinematic", "Natural", "Raw", "Film", "Polaroid", "Vintage", "High Fashion"]) },

  // ===== 24. Negative & Quality =====
  { id: "quality_level", label: "Kalite", type: "multi_select", categoryId: "quality", subgroupId: "quality", jsonPath: "quality.wanted", options: opts(["High Quality", "Ultra Detailed", "Sharp", "Clean", "High Resolution", "Professional"]) },
  { id: "quality_anatomy_errors", label: "Anatomik Hatalar (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "anatomy", jsonPath: "quality.avoid_anatomy", options: opts(["Extra Fingers", "Extra Limbs", "Deformed Hands", "Bad Anatomy", "Distorted Face", "Asymmetrical Eyes"]) },
  { id: "quality_visual_errors", label: "Görsel Hatalar (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "visual", jsonPath: "quality.avoid_visual", options: opts(["Blur", "Noise", "Pixelated", "Low Resolution", "Overexposed", "Underexposed", "Artifacts", "Compression"]) },
  { id: "quality_unwanted_style", label: "İstenmeyen Stil (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "unwanted", jsonPath: "quality.avoid_style", options: opts(["Low Quality", "Amateur", "Oversaturated", "Flat Lighting", "Bad Composition", "Distorted Perspective"]) },
];

export const CATALOG_PACKAGES: CatalogPackage[] = [
  { id: "pkg_basic_character", label: "Basic Character", fieldIds: ["char_gender", "char_age_group", "char_type", "char_body_type", "char_skin_tone", "char_hair_color", "char_hair_style", "char_eye_color"] },
  { id: "pkg_face_details", label: "Face Details", fieldIds: ["char_face_shape", "char_skin_texture", "char_freckles", "char_scar"] },
  { id: "pkg_eye_details", label: "Eye Details", fieldIds: ["char_eye_color", "char_eye_shape", "char_eye_size", "char_eye_effect"] },
  { id: "pkg_hair_details", label: "Hair Details", fieldIds: ["char_hair_length", "char_hair_style", "char_hair_color", "char_hair_texture", "char_bangs"] },
  { id: "pkg_body_anatomy", label: "Body Anatomy", fieldIds: ["char_body_type", "char_height", "char_muscle_level", "char_body_proportion"] },
  { id: "pkg_clothing", label: "Clothing", fieldIds: ["cloth_style", "cloth_top", "cloth_bottom", "cloth_shoes", "cloth_fabric", "cloth_main_color", "cloth_pattern"] },
  { id: "pkg_pose", label: "Pose", fieldIds: ["pose_base", "pose_direction", "pose_hands", "pose_head", "pose_movement"] },
  { id: "pkg_expression", label: "Expression", fieldIds: ["expr_emotion", "expr_eyes", "expr_mouth", "expr_intensity"] },
  { id: "pkg_environment", label: "Environment", fieldIds: ["env_city", "weather_condition", "weather_atmosphere", "weather_time", "weather_particle"] },
  { id: "pkg_lighting", label: "Lighting", fieldIds: ["light_source", "light_direction", "light_technique", "light_character", "light_color"] },
  { id: "pkg_camera", label: "Camera", fieldIds: ["cam_shot", "cam_angle", "cam_lens", "cam_aperture", "cam_focus", "cam_movement"] },
  { id: "pkg_composition", label: "Composition", fieldIds: ["comp_position", "comp_framing", "comp_depth", "comp_perspective", "comp_technique"] },
  { id: "pkg_effects", label: "Effects", fieldIds: ["fx_light", "fx_atmospheric", "fx_energy", "fx_camera"] },
  { id: "pkg_quality", label: "Quality", fieldIds: ["quality_level", "quality_anatomy_errors", "quality_visual_errors", "quality_unwanted_style"] },
];

const CATALOG_FIELDS_BY_ID = new Map(CATALOG_FIELDS.map((field) => [field.id, field]));

export function fieldsInSubgroup(categoryId: string, subgroupId: string): CatalogField[] {
  return CATALOG_FIELDS.filter((field) => field.categoryId === categoryId && field.subgroupId === subgroupId);
}

export function packageFields(pkg: CatalogPackage): CatalogField[] {
  return pkg.fieldIds.map((id) => CATALOG_FIELDS_BY_ID.get(id)).filter((field): field is CatalogField => Boolean(field));
}

/** Case/Turkish-insensitive search across field labels, subgroup labels, and their parent category label — reuses this app's existing tag-search normalization (`tag-normalize.ts`) rather than writing a second one. */
export function searchCatalogFields(query: string, normalize: (value: string) => string): CatalogField[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return CATALOG_FIELDS.filter((field) => {
    const category = CATALOG_CATEGORIES.find((c) => c.id === field.categoryId);
    const subgroup = category?.subgroups.find((s) => s.id === field.subgroupId);
    const haystack = normalize(`${field.label} ${subgroup?.label ?? ""} ${category?.label ?? ""}`);
    return haystack.includes(needle);
  });
}
