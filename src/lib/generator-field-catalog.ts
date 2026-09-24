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
      { id: "settings", label: "Çekim Ayarları" },
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
    id: "marketing",
    label: "Pazarlama & Kampanya",
    subgroups: [
      { id: "campaign", label: "Kampanya Türü" },
      { id: "platform", label: "Platform" },
      { id: "audience", label: "Hedef Kitle" },
      { id: "cta", label: "Çağrı (CTA)" },
      { id: "tone", label: "Ton" },
      { id: "format", label: "Format" },
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
    id: "audio",
    label: "Ses & Müzik",
    subgroups: [
      { id: "genre", label: "Tür / Janr" },
      { id: "mood", label: "Ruh Hali" },
      { id: "instrument", label: "Enstrüman" },
      { id: "vocal", label: "Vokal" },
      { id: "tempo", label: "Tempo / Ritim" },
      { id: "production", label: "Prodüksiyon" },
      { id: "duration", label: "Süre" },
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
      { id: "output", label: "Çıktı" },
      { id: "seo", label: "SEO" },
    ],
  },
  {
    id: "code",
    label: "Kod & Yazılım",
    subgroups: [
      { id: "language", label: "Dil" },
      { id: "framework", label: "Framework" },
      { id: "database", label: "Veritabanı" },
      { id: "architecture", label: "Mimari" },
      { id: "output", label: "Çıktı" },
      { id: "testing", label: "Test" },
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
      { id: "layout", label: "Yerleşim" },
      { id: "component", label: "Bileşen" },
      { id: "style", label: "Tasarım Stili" },
      { id: "accessibility", label: "Erişilebilirlik" },
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
  { id: "char_tattoo", label: "Dövme", type: "select", categoryId: "character", subgroupId: "skin", jsonPath: "skin.tattoo", options: opts(["Yok", "Küçük", "Büyük", "Tüm Vücut"]) },
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
  { id: "char_posture", label: "Duruş", type: "select", categoryId: "character", subgroupId: "body", jsonPath: "body.posture", options: opts(["Dik", "Rahat", "Kambur", "Gururlu", "Yorgun", "Askeri"]) },

  // ===== 2. Kıyafet & Moda =====
  { id: "cloth_style", label: "Stil", type: "select", categoryId: "clothing", subgroupId: "style", jsonPath: "clothing.style", options: opts(["Günlük", "Resmi", "Sokak Modası", "Lüks", "Vintage", "Minimal", "Sportif", "Gotik", "Punk", "Cyberpunk", "Fantastik", "Geleneksel"]) },
  { id: "cloth_era", label: "Moda Dönemi", type: "select", categoryId: "clothing", subgroupId: "style", jsonPath: "clothing.era", options: opts(["Modern", "1920'ler", "1950'ler", "1970'ler", "1980'ler", "1990'lar", "Fütüristik"]) },
  { id: "cloth_top", label: "Üst Türü", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.type", options: opts(["Tişört", "Gömlek", "Bluz", "Kazak", "Sweatshirt", "Hoodie", "Ceket", "Deri Ceket", "Mont", "Kaban", "Zırh"]) },
  { id: "cloth_top_sleeve", label: "Kol Tipi", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.sleeve", options: opts(["Kısa", "Uzun", "Kolsuz", "Bol", "Dar"]) },
  { id: "cloth_top_collar", label: "Yaka", type: "select", categoryId: "clothing", subgroupId: "top", jsonPath: "clothing.top.collar", options: opts(["Yuvarlak", "V Yaka", "Gömlek Yaka", "Balıkçı", "Açık Yaka"]) },
  { id: "cloth_bottom", label: "Alt Türü", type: "select", categoryId: "clothing", subgroupId: "bottom", jsonPath: "clothing.bottom.type", options: opts(["Jean", "Pantolon", "Şort", "Etek", "Tayt", "Kargo Pantolon", "Eşofman"]) },
  { id: "cloth_bottom_fit", label: "Kesim", type: "select", categoryId: "clothing", subgroupId: "bottom", jsonPath: "clothing.bottom.fit", options: opts(["Dar Kesim", "İnce Kesim", "Normal Kesim", "Rahat Kesim", "Bol Kesim", "Bol Paça"]) },
  { id: "cloth_shoes", label: "Ayakkabı Türü", type: "select", categoryId: "clothing", subgroupId: "shoes", jsonPath: "clothing.shoes.type", options: opts(["Sneaker", "Bot", "Çizme", "Topuklu", "Sandalet", "Loafer", "Spor Ayakkabı"]) },
  { id: "cloth_shoes_color", label: "Ayakkabı Rengi", type: "select", categoryId: "clothing", subgroupId: "shoes", jsonPath: "clothing.shoes.color", options: opts(["Siyah", "Beyaz", "Kahverengi", "Kırmızı", "Gümüş", "Altın"]) },
  { id: "cloth_fabric", label: "Kumaş", type: "select", categoryId: "clothing", subgroupId: "fabric", jsonPath: "clothing.fabric.material", options: opts(["Pamuk", "Keten", "İpek", "Kadife", "Deri", "Denim", "Yün", "Saten", "Naylon"]) },
  { id: "cloth_fabric_texture", label: "Doku", type: "select", categoryId: "clothing", subgroupId: "fabric", jsonPath: "clothing.fabric.texture", options: opts(["Mat", "Parlak", "Yumuşak", "Kalın", "İnce", "Metalik"]) },
  { id: "cloth_main_color", label: "Ana Renk", type: "color", categoryId: "clothing", subgroupId: "color_pattern", jsonPath: "clothing.color.primary", options: [] },
  { id: "cloth_pattern", label: "Desen", type: "select", categoryId: "clothing", subgroupId: "color_pattern", jsonPath: "clothing.color.pattern", options: opts(["Düz", "Çizgili", "Kareli", "Çiçekli", "Geometrik", "Kamuflaj", "Renk Geçişi"]) },
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
  { id: "light_direction", label: "Işık Yönü", type: "select", categoryId: "lighting", subgroupId: "direction", jsonPath: "lighting.direction", options: opts(["Önden", "Arkadan", "Yandan", "Üstten", "Alttan", "Kenar Işığı"]) },
  { id: "light_technique", label: "Teknik", type: "select", categoryId: "lighting", subgroupId: "technique", jsonPath: "lighting.technique", options: opts(["Yumuşak Işık", "Sert Işık", "Yayılmış Işık", "Volümetrik", "Global Aydınlatma", "Sinematik Aydınlatma", "Stüdyo Aydınlatması"]) },
  { id: "light_character", label: "Işık Karakteri", type: "select", categoryId: "lighting", subgroupId: "character", jsonPath: "lighting.character", options: opts(["High Key", "Low Key", "Dramatik", "Karanlık Ruh Halli", "Doğal", "Yumuşak"]) },
  { id: "light_color", label: "Işık Rengi", type: "select", categoryId: "lighting", subgroupId: "color", jsonPath: "lighting.color", options: opts(["Sıcak", "Soğuk", "Nötr", "Turuncu/Mavi", "Mor/Mavi", "Kırmızı", "Yeşil"]) },

  // ===== 9. Kamera & Lens =====
  { id: "cam_shot", label: "Çekim Türü", type: "select", categoryId: "camera", subgroupId: "shot", jsonPath: "camera.shot_type", options: opts(["Portre", "Tam Boy", "Yarım Boy", "Yakın Plan", "Ekstrem Yakın Plan", "Ürün Çekimi", "Manzara"]) },
  { id: "cam_angle", label: "Kamera Açısı", type: "select", categoryId: "camera", subgroupId: "angle", jsonPath: "camera.angle", options: opts(["Göz Hizası", "Alttan Açı", "Üstten Açı", "Kuşbakışı", "Solucan Bakışı", "Eğik Açı", "Omuz Üzerinden"]) },
  { id: "cam_lens", label: "Lens (mm)", type: "select", categoryId: "camera", subgroupId: "lens", jsonPath: "camera.lens_mm", options: opts(["14mm", "24mm", "35mm", "50mm", "85mm", "105mm", "135mm", "Telefoto", "Makro", "Balık Gözü"]) },
  { id: "cam_aperture", label: "Diyafram", type: "select", categoryId: "camera", subgroupId: "aperture", jsonPath: "camera.aperture", options: opts(["f/1.2", "f/1.4", "f/1.8", "f/2.8", "f/4", "f/5.6", "f/8", "f/11"]) },
  { id: "cam_focus", label: "Odak", type: "select", categoryId: "camera", subgroupId: "focus", jsonPath: "camera.focus", options: opts(["Konu Odakta", "Arka Plan Odakta", "Her Şey Odakta", "Sığ Alan Derinliği", "Derin Alan Derinliği"]) },
  { id: "cam_movement", label: "Kamera Hareketi", type: "select", categoryId: "camera", subgroupId: "movement", jsonPath: "camera.movement", options: opts(["Sabit", "Pan", "Tilt", "Dolly", "Tracking", "Handheld", "Orbit"]) },
  { id: "cam_iso", label: "ISO", type: "select", categoryId: "camera", subgroupId: "settings", jsonPath: "camera.iso", options: opts(["100", "200", "400", "800", "1600", "3200", "6400"]) },
  { id: "cam_shutter_speed", label: "Enstantane Hızı", type: "select", categoryId: "camera", subgroupId: "settings", jsonPath: "camera.shutter_speed", options: opts(["1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60", "1/30", "1sn (Uzun Pozlama)"]) },
  { id: "cam_white_balance", label: "Beyaz Ayarı", type: "select", categoryId: "camera", subgroupId: "settings", jsonPath: "camera.white_balance", options: opts(["Otomatik", "Gün Işığı", "Bulutlu", "Tungsten", "Floresan", "Gölge"]) },

  // ===== 10. Görsel Stil =====
  { id: "style_realism", label: "Gerçekçilik", type: "select", categoryId: "visual_style", subgroupId: "realism", jsonPath: "style.realism", options: opts(["Fotogerçekçi", "Hipergerçekçi", "Gerçekçi", "Stilize Gerçekçilik", "Yarı Gerçekçi"]) },
  { id: "style_3d", label: "3D Stili", type: "select", categoryId: "visual_style", subgroupId: "three_d", jsonPath: "style.three_d", options: opts(["3D Karakter", "3D Animasyon", "Stilize 3D", "Gerçekçi 3D", "Oyun Karakteri", "CGI"]) },
  { id: "style_anime", label: "Anime Stili", type: "select", categoryId: "visual_style", subgroupId: "anime", jsonPath: "style.anime", options: opts(["Anime", "Manga", "Japon Animasyonu", "Cel Shading", "Yarı Gerçekçi Anime"]) },
  { id: "style_art", label: "Sanat Stili", type: "select", categoryId: "visual_style", subgroupId: "art", jsonPath: "style.art", options: opts(["Yağlı Boya", "Suluboya", "Akrilik", "Kalem Çizimi", "Mürekkep", "Konsept Sanat", "Dijital Boyama", "Matte Painting"]) },
  { id: "style_cinematic", label: "Sinematik Stil", type: "select", categoryId: "visual_style", subgroupId: "cinematic", jsonPath: "style.cinematic", options: opts(["Sinematik", "Film Karesi", "Epik", "Belgesel", "Karanlık Sinematik"]) },
  { id: "style_design", label: "Tasarım Dili", type: "select", categoryId: "visual_style", subgroupId: "design", jsonPath: "style.design_language", options: opts(["Minimal", "Lüks", "Editoryal", "Moda", "Retro", "Fütüristik", "Deneysel"]) },

  // ===== 11. Renk & Palet =====
  { id: "color_primary", label: "Ana Renk", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.primary", options: [] },
  { id: "color_secondary", label: "İkincil Renk", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.secondary", options: [] },
  { id: "color_accent", label: "Vurgu Rengi", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.accent", options: [] },
  { id: "color_background", label: "Arka Plan Rengi", type: "color", categoryId: "color", subgroupId: "colors", jsonPath: "color.background", options: [] },
  { id: "color_palette", label: "Renk Paleti", type: "select", categoryId: "color", subgroupId: "palette", jsonPath: "color.palette", options: opts(["Tek Renkli", "Tamamlayıcı Renkler", "Komşu Renkler", "Üçlü Renk Uyumu", "Pastel", "Neon", "Toprak Tonları", "Siyah & Beyaz"]) },
  { id: "color_saturation", label: "Doygunluk", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.saturation", options: [], min: -100, max: 100, step: 5 },
  { id: "color_contrast", label: "Kontrast", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.contrast", options: [], min: -100, max: 100, step: 5 },
  { id: "color_brightness", label: "Parlaklık", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.brightness", options: [], min: -100, max: 100, step: 5 },
  { id: "color_temperature", label: "Sıcaklık", type: "slider", categoryId: "color", subgroupId: "adjustments", jsonPath: "color.adjustments.temperature", options: [], min: -100, max: 100, step: 5 },

  // ===== 12. Kompozisyon =====
  { id: "comp_position", label: "Konu Konumu", type: "select", categoryId: "composition", subgroupId: "position", jsonPath: "composition.subject_position", options: opts(["Merkez", "Sol", "Sağ", "Üst", "Alt", "Köşe"]) },
  { id: "comp_framing", label: "Kadraj", type: "select", categoryId: "composition", subgroupId: "framing", jsonPath: "composition.framing", options: opts(["Tam Kare", "Orta Plan", "Yakın Çekim", "Geniş Çekim", "Ekstrem Geniş Çekim"]) },
  { id: "comp_depth", label: "Derinlik", type: "select", categoryId: "composition", subgroupId: "depth", jsonPath: "composition.depth", options: opts(["Ön Plan", "Orta Plan", "Arka Plan", "Katmanlı"]) },
  { id: "comp_perspective", label: "Perspektif", type: "select", categoryId: "composition", subgroupId: "perspective", jsonPath: "composition.perspective", options: opts(["Normal", "Geniş", "Derin", "Çarpıtılmış", "Zorlanmış Perspektif"]) },
  { id: "comp_technique", label: "Kompozisyon Tekniği", type: "select", categoryId: "composition", subgroupId: "technique", jsonPath: "composition.technique", options: opts(["Üçte Bir Kuralı", "Merkezi Kompozisyon", "Simetri", "Yönlendirici Çizgiler", "Çerçeveleme", "Negatif Alan", "Diyagonal Kompozisyon", "Katmanlama", "Altın Oran"]) },

  // ===== 13. Görsel Efektler =====
  { id: "fx_light", label: "Işık Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "light", jsonPath: "effects.light", options: opts(["Parıltı", "Bloom", "Lens Flare", "Işık Huzmeleri", "Tanrı Işınları", "Volümetrik Işık"]) },
  { id: "fx_atmospheric", label: "Atmosferik Efektler", type: "multi_select", categoryId: "effects", subgroupId: "atmospheric", jsonPath: "effects.atmospheric", options: opts(["Sis", "Duman", "Toz", "Pus", "İnce Sis"]) },
  { id: "fx_nature", label: "Doğa Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "nature", jsonPath: "effects.nature", options: opts(["Yağmur", "Kar", "Yapraklar", "Taç Yaprakları", "Kül", "Kum"]) },
  { id: "fx_energy", label: "Enerji Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "energy", jsonPath: "effects.energy", options: opts(["Büyü Parçacıkları", "Enerji", "Yıldırım", "Ateş", "Buz", "Elektrik", "Aura"]) },
  { id: "fx_camera", label: "Kamera Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "camera", jsonPath: "effects.camera", options: opts(["Hareket Bulanıklığı", "Alan Derinliği", "Kromatik Sapma", "Film Grenı", "Vinyet", "Bokeh"]) },
  { id: "fx_material", label: "Malzeme Efektleri", type: "multi_select", categoryId: "effects", subgroupId: "material", jsonPath: "effects.material", options: opts(["Yansıma", "Kırılma", "Cam", "Islak Yüzey", "Metalik Parlaklık"]) },

  // ===== 14. Fantastik =====
  { id: "fantasy_character", label: "Fantastik Karakter", type: "select", categoryId: "fantasy", subgroupId: "character", jsonPath: "fantasy.character", options: opts(["Elf", "Kara Elf", "Cüce", "Ork", "Peri", "Vampir", "İblis", "Melek", "Ejderha Binicisi", "Büyücü", "Cadı", "Şövalye"]) },
  { id: "fantasy_creature", label: "Yaratık", type: "select", categoryId: "fantasy", subgroupId: "creature", jsonPath: "fantasy.creature", options: opts(["Ejderha", "Anka Kuşu", "Grifon", "Kurt", "Dev", "Element Yaratığı", "Canavar", "Mitolojik Yaratık"]) },
  { id: "fantasy_world", label: "Dünya", type: "select", categoryId: "fantasy", subgroupId: "world", jsonPath: "fantasy.world", options: opts(["Fantastik Krallık", "Antik Kalıntılar", "Büyülü Orman", "Yüzen Adalar", "Yeraltı Dünyası", "Göksel Diyar"]) },
  { id: "fantasy_magic", label: "Büyü Türü", type: "select", categoryId: "fantasy", subgroupId: "magic", jsonPath: "fantasy.magic", options: opts(["Ateş Büyüsü", "Buz Büyüsü", "Yıldırım Büyüsü", "Karanlık Büyü", "Işık Büyüsü", "Doğa Büyüsü", "Gizemli Büyü", "İyileştirme Büyüsü"]) },

  // ===== 15. Sci-Fi & Cyberpunk =====
  { id: "scifi_character", label: "Sci-Fi Karakter", type: "select", categoryId: "scifi", subgroupId: "character", jsonPath: "scifi.character", options: opts(["Android", "Cyborg", "Robot", "Uzay Askeri", "Hacker", "Pilot", "Mühendis"]) },
  { id: "scifi_technology", label: "Teknoloji", type: "select", categoryId: "scifi", subgroupId: "technology", jsonPath: "scifi.technology", options: opts(["Hologram", "Nöral Arayüz", "Sibernetik Kol", "Mekanik Göz", "Enerji Çekirdeği", "Yapay Zekâ Asistanı", "Nanoteknoloji"]) },
  { id: "scifi_location", label: "Mekân", type: "select", categoryId: "scifi", subgroupId: "location", jsonPath: "scifi.location", options: opts(["Cyberpunk Sokağı", "Mega Şehir", "Uzay İstasyonu", "Laboratuvar", "Fabrika", "Uzay Aracı", "Neon Sokak"]) },
  { id: "scifi_style", label: "Stil", type: "select", categoryId: "scifi", subgroupId: "style", jsonPath: "scifi.style", options: opts(["Cyberpunk", "Synthwave", "Fütüristik", "Endüstriyel Bilim Kurgu", "Retro-Fütürizm", "Uzay Operası"]) },

  // ===== 16. Silah & Ekipman =====
  { id: "weapon_melee", label: "Yakın Dövüş Silahı", type: "select", categoryId: "weapon", subgroupId: "melee", jsonPath: "equipment.melee_weapon", options: opts(["Kılıç", "Katana", "Balta", "Mızrak", "Hançer", "Çekiç", "Asa"]) },
  { id: "weapon_ranged", label: "Uzak Dövüş Silahı", type: "select", categoryId: "weapon", subgroupId: "ranged", jsonPath: "equipment.ranged_weapon", options: opts(["Yay", "Arbalet", "Enerji Silahı", "Bilim Kurgu Silahı", "Fantastik Menzilli Silah"]) },
  { id: "weapon_defense", label: "Savunma Ekipmanı", type: "multi_select", categoryId: "weapon", subgroupId: "defense", jsonPath: "equipment.defense", options: opts(["Kalkan", "Zırh", "Kask", "Eldiven", "Omuzluk"]) },
  { id: "weapon_detail", label: "Ekipman Detayı", type: "select", categoryId: "weapon", subgroupId: "detail", jsonPath: "equipment.material_detail", options: opts(["Metal", "Deri", "Ahşap", "Kristal", "Enerji", "Rün", "Gravür"]) },

  // ===== 17. Ürün & Reklam =====
  { id: "product_category", label: "Ürün Kategorisi", type: "select", categoryId: "product", subgroupId: "product", jsonPath: "product.category", options: opts(["Telefon", "Tablet", "Laptop", "Saat", "Ayakkabı", "Çanta", "Kozmetik", "Mobilya", "Elektronik", "Otomotiv"]) },
  { id: "product_shot", label: "Çekim Türü", type: "select", categoryId: "product", subgroupId: "shot", jsonPath: "product.shot_type", options: opts(["Stüdyo Ürünü", "Ana Çekim", "Yakın Çekim", "Yaşam Tarzı", "Üstten Düzen", "360 Derece Ürün"]) },
  { id: "product_background", label: "Arka Plan", type: "select", categoryId: "product", subgroupId: "background", jsonPath: "product.background", options: opts(["Beyaz", "Siyah", "Renk Geçişli", "Minimal", "Stüdyo", "Yaşam Tarzı", "Doğal"]) },
  { id: "product_ad_style", label: "Reklam Stili", type: "select", categoryId: "product", subgroupId: "ad", jsonPath: "product.ad_style", options: opts(["Lüks", "Minimal", "Premium", "Ticari", "Editoryal", "Sosyal Medya Reklamı"]) },
  { id: "product_reference_url", label: "Referans Görsel URL", type: "url", categoryId: "product", subgroupId: "product", jsonPath: "product.reference_url", options: [], placeholder: "https://…" },

  // ===== 17b. Pazarlama & Kampanya =====
  { id: "marketing_campaign", label: "Kampanya Türü", type: "select", categoryId: "marketing", subgroupId: "campaign", jsonPath: "marketing.campaign_type", options: opts(["Sosyal Medya Reklamı", "Google Ads", "Email Kampanyası", "Influencer İşbirliği", "Lansman Kampanyası", "İndirim Kampanyası", "Marka Bilinirliği", "Yeniden Hedefleme"]) },
  { id: "marketing_goal", label: "Kampanya Hedefi", type: "select", categoryId: "marketing", subgroupId: "campaign", jsonPath: "marketing.goal", options: opts(["Satış", "Trafik", "Marka Bilinirliği", "Takipçi Kazanımı", "Potansiyel Müşteri Toplama", "Uygulama İndirme"]) },
  { id: "marketing_platform", label: "Platform", type: "multi_select", categoryId: "marketing", subgroupId: "platform", jsonPath: "marketing.platforms", options: opts(["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Twitter/X", "Google", "E-posta", "Web Sitesi"]) },
  { id: "marketing_ad_format", label: "Reklam Formatı", type: "select", categoryId: "marketing", subgroupId: "platform", jsonPath: "marketing.ad_format", options: opts(["Statik Görsel", "Carousel", "Kısa Video", "Story", "Banner", "Newsletter"]) },
  { id: "marketing_audience", label: "Hedef Kitle", type: "select", categoryId: "marketing", subgroupId: "audience", jsonPath: "marketing.audience.segment", options: opts(["Genç Yetişkin", "Aile", "Profesyonel", "Öğrenci", "Girişimci", "Kadın", "Erkek", "Genel"]) },
  { id: "marketing_audience_age", label: "Yaş Aralığı", type: "select", categoryId: "marketing", subgroupId: "audience", jsonPath: "marketing.audience.age_range", options: opts(["13-17", "18-24", "25-34", "35-44", "45-54", "55+"]) },
  { id: "marketing_cta", label: "Çağrı (CTA)", type: "select", categoryId: "marketing", subgroupId: "cta", jsonPath: "marketing.cta.button_text", options: opts(["Şimdi Al", "Kaydol", "Daha Fazla Bilgi", "Ücretsiz Dene", "İletişime Geç", "İndir", "Sepete Ekle"]) },
  { id: "marketing_urgency", label: "Aciliyet Vurgusu", type: "select", categoryId: "marketing", subgroupId: "cta", jsonPath: "marketing.cta.urgency", options: opts(["Yok", "Sınırlı Süre", "Sınırlı Stok", "Son Gün", "Yalnızca Bugün"]) },
  { id: "marketing_tone", label: "Ton", type: "select", categoryId: "marketing", subgroupId: "tone", jsonPath: "marketing.tone", options: opts(["Enerjik", "Güven Verici", "Eğlenceli", "Lüks", "Samimi", "Profesyonel", "Cesur"]) },
  { id: "marketing_discount", label: "İndirim Oranı (%)", type: "number", categoryId: "marketing", subgroupId: "tone", jsonPath: "marketing.discount_percent", options: [], min: 0, max: 100, step: 5 },
  { id: "marketing_headline", label: "Başlık Fikri", type: "text", categoryId: "marketing", subgroupId: "format", jsonPath: "marketing.headline", options: [], placeholder: "Örn. Yaza Hazır Ol, %30 İndirim" },
  { id: "marketing_brand_voice", label: "Marka Sesi", type: "select", categoryId: "marketing", subgroupId: "format", jsonPath: "marketing.brand_voice", options: opts(["Ciddi/Kurumsal", "Arkadaşça", "Esprili", "İlham Verici", "Cesur/Rahatsız Edici"]) },

  // ===== 18. Video =====
  { id: "video_type", label: "Video Türü", type: "select", categoryId: "video", subgroupId: "type", jsonPath: "video.type", options: opts(["Sinematik", "Reklam", "Kısa Film", "Müzik Videosu", "Sosyal Medya", "Ürün Videosu", "Animasyon"]) },
  { id: "video_duration", label: "Süre (sn)", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.duration_seconds", options: opts(["3", "5", "10", "15", "30", "60"]) },
  { id: "video_aspect_ratio", label: "En-Boy Oranı", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.aspect_ratio", options: opts(["1:1", "4:5", "16:9", "9:16", "21:9"]) },
  { id: "video_fps", label: "FPS", type: "select", categoryId: "video", subgroupId: "format", jsonPath: "video.fps", options: opts(["24", "25", "30", "60", "120"]) },
  { id: "video_camera_movement", label: "Kamera Hareketi", type: "select", categoryId: "video", subgroupId: "movement", jsonPath: "video.camera_movement", options: opts(["Sabit", "Pan", "Tilt", "Dolly", "Takip", "Yörünge", "El Kamerası", "Vinç"]) },
  { id: "video_character_movement", label: "Karakter Hareketi", type: "multi_select", categoryId: "video", subgroupId: "movement", jsonPath: "video.character_movement", options: opts(["Yürüme", "Koşma", "Dönme", "Bakma", "El Kol Hareketi", "Dövüşme", "Dans Etme", "Oturma", "Ayakta Durma"]) },
  { id: "video_transition", label: "Geçiş", type: "select", categoryId: "video", subgroupId: "transition", jsonPath: "video.transition", options: opts(["Kesme", "Karartma", "Çözülme", "Yakınlaştırma", "Eşleşen Kesme", "Hızlı Pan"]) },

  // ===== 18b. Ses & Müzik =====
  { id: "audio_genre", label: "Tür / Janr", type: "select", categoryId: "audio", subgroupId: "genre", jsonPath: "audio.genre", options: opts(["Pop", "Rock", "Hip-Hop", "Elektronik", "Klasik", "Jazz", "Lo-fi", "Ambient", "Folk", "Metal", "R&B", "Sinematik"]) },
  { id: "audio_subgenre", label: "Alt Tür", type: "text", categoryId: "audio", subgroupId: "genre", jsonPath: "audio.subgenre", options: [], placeholder: "Örn. Synthwave, Deep House" },
  { id: "audio_mood", label: "Ruh Hali", type: "select", categoryId: "audio", subgroupId: "mood", jsonPath: "audio.mood", options: opts(["Enerjik", "Sakin", "Hüzünlü", "Karanlık", "Romantik", "Epik", "Gizemli", "Neşeli", "Gergin", "Rahatlatıcı"]) },
  { id: "audio_energy", label: "Enerji Seviyesi", type: "slider", categoryId: "audio", subgroupId: "mood", jsonPath: "audio.energy_level", options: [], min: 0, max: 100, step: 5 },
  { id: "audio_instrument", label: "Ana Enstrüman", type: "multi_select", categoryId: "audio", subgroupId: "instrument", jsonPath: "audio.instruments", options: opts(["Piyano", "Gitar", "Keman", "Davul", "Bas", "Synth", "Flüt", "Saksafon", "Orkestra", "Perküsyon"]) },
  { id: "audio_vocal", label: "Vokal", type: "select", categoryId: "audio", subgroupId: "vocal", jsonPath: "audio.vocal.style", options: opts(["Enstrümantal (Vokalsiz)", "Erkek Vokal", "Kadın Vokal", "Koro", "Rap", "Fısıltı", "Opera Tarzı", "Duet"]) },
  { id: "audio_vocal_language", label: "Vokal Dili", type: "select", categoryId: "audio", subgroupId: "vocal", jsonPath: "audio.vocal.language", options: opts(["Türkçe", "İngilizce", "Yok", "Çok Dilli"]) },
  { id: "audio_tempo", label: "Tempo", type: "select", categoryId: "audio", subgroupId: "tempo", jsonPath: "audio.tempo", options: opts(["Çok Yavaş", "Yavaş", "Orta", "Hızlı", "Çok Hızlı"]) },
  { id: "audio_bpm", label: "BPM", type: "number", categoryId: "audio", subgroupId: "tempo", jsonPath: "audio.bpm", options: [], min: 40, max: 220, step: 1 },
  { id: "audio_production", label: "Prodüksiyon", type: "select", categoryId: "audio", subgroupId: "production", jsonPath: "audio.production_style", options: opts(["Stüdyo Kalitesi", "Lo-fi / Ham", "Canlı Kayıt", "Elektronik / Sentetik", "Akustik"]) },
  { id: "audio_effects", label: "Ses Efektleri", type: "multi_select", categoryId: "audio", subgroupId: "production", jsonPath: "audio.effects", options: opts(["Reverb", "Echo", "Distortion", "Autotune", "Vinyl Crackle", "Sidechain"]) },
  { id: "audio_duration", label: "Süre", type: "select", categoryId: "audio", subgroupId: "duration", jsonPath: "audio.duration", options: opts(["15sn", "30sn", "1dk", "2dk", "3dk", "Tam Şarkı"]) },

  // ===== 19. Metin & İçerik =====
  { id: "text_content_type", label: "İçerik Türü", type: "select", categoryId: "text", subgroupId: "content_type", jsonPath: "content.type", options: opts(["Blog", "Makale", "Sosyal Medya", "Reklam", "E-posta", "Ürün Açıklaması", "Haber", "Senaryo", "Hikâye", "Şiir"]) },
  { id: "text_audience", label: "Hedef Kitle", type: "select", categoryId: "text", subgroupId: "audience", jsonPath: "content.audience", options: opts(["Genel", "Çocuk", "Genç", "Profesyonel", "Teknik", "Akademik", "Pazarlama"]) },
  { id: "text_language", label: "Dil", type: "select", categoryId: "text", subgroupId: "language", jsonPath: "content.language", options: opts(["Türkçe", "İngilizce", "Almanca", "Fransızca", "İspanyolca", "İtalyanca", "Arapça", "Çok Dilli"]) },
  { id: "text_tone", label: "Ton", type: "select", categoryId: "text", subgroupId: "tone", jsonPath: "content.tone", options: opts(["Profesyonel", "Samimi", "Eğlenceli", "Resmi", "Akademik", "İkna Edici", "İlham Verici", "Minimal"]) },
  { id: "text_length", label: "Uzunluk", type: "select", categoryId: "text", subgroupId: "length", jsonPath: "content.length", options: opts(["Çok Kısa", "Kısa", "Orta", "Uzun", "Çok Uzun"]) },
  { id: "text_word_count", label: "Kelime Sayısı", type: "number", categoryId: "text", subgroupId: "length", jsonPath: "content.word_count", options: [], min: 0, step: 50 },
  { id: "text_structure", label: "Yapı", type: "multi_select", categoryId: "text", subgroupId: "structure", jsonPath: "content.structure", options: opts(["Başlık", "Giriş", "Bölümler", "Maddeler", "Sonuç", "CTA"]) },
  { id: "text_output", label: "Çıktı Formatı", type: "select", categoryId: "text", subgroupId: "output", jsonPath: "content.output_format", options: opts(["Düz Metin", "Markdown", "JSON", "HTML", "Tablo", "Madde İşaretleri"]) },
  { id: "text_seo_keyword", label: "Anahtar Kelime", type: "text", categoryId: "text", subgroupId: "seo", jsonPath: "content.seo.keyword", options: [], placeholder: "Örn. organik kahve çekirdeği" },
  { id: "text_meta_description", label: "Meta Açıklama", type: "textarea", categoryId: "text", subgroupId: "seo", jsonPath: "content.seo.meta_description", options: [] },

  // ===== 20. Kod & Yazılım =====
  {
    id: "code_language",
    label: "Programlama Dili",
    type: "select",
    categoryId: "code",
    subgroupId: "language",
    jsonPath: "code.language",
    // "C#" and "C++" both slug down to bare "c" via slugValue() (punctuation stripped) —
    // given explicit, distinct values here instead of via opts() so the two options never collide.
    options: [...opts(["TypeScript", "JavaScript", "Python", "Java"]), { label: "C#", value: "csharp" }, { label: "C++", value: "cpp" }, ...opts(["Go", "Rust", "PHP", "SQL", "Swift", "Kotlin"])],
  },
  { id: "code_framework", label: "Framework", type: "select", categoryId: "code", subgroupId: "framework", jsonPath: "code.framework", options: opts(["Next.js", "React", "Vue", "Angular", "Svelte", "Flutter", "React Native", "Node.js", "Django", "Laravel"]) },
  { id: "code_database", label: "Database", type: "select", categoryId: "code", subgroupId: "database", jsonPath: "code.database", options: opts(["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Supabase", "Firebase", "Redis"]) },
  { id: "code_architecture", label: "Mimari", type: "select", categoryId: "code", subgroupId: "architecture", jsonPath: "code.architecture", options: opts(["Monolitik", "REST API", "GraphQL", "Mikroservisler", "Sunucusuz", "Olay Güdümlü"]) },
  { id: "code_output", label: "Çıktı", type: "multi_select", categoryId: "code", subgroupId: "output", jsonPath: "code.output", options: opts(["Kod", "Açıklama", "Testler", "Dokümantasyon", "JSON", "Fark (Diff)", "Dosya Yapısı"]) },
  { id: "code_test_type", label: "Test Türü", type: "select", categoryId: "code", subgroupId: "testing", jsonPath: "code.test.type", options: opts(["Birim Testi", "Entegrasyon Testi", "Uçtan Uca Test", "Anlık Görüntü Testi", "Yok"]) },
  { id: "code_test_coverage", label: "Test Kapsama Hedefi (%)", type: "number", categoryId: "code", subgroupId: "testing", jsonPath: "code.test.coverage_target", options: [], min: 0, max: 100, step: 5 },

  // ===== 21. AI / Prompt Ayarları =====
  { id: "ai_model", label: "Model", type: "select", categoryId: "ai", subgroupId: "model", jsonPath: "ai.model", options: opts(["GPT", "Claude", "Gemini", "Llama", "Mistral", "Görsel Modeli", "Video Modeli", "Özel Model"]) },
  { id: "ai_temperature", label: "Sıcaklık", type: "slider", categoryId: "ai", subgroupId: "settings", jsonPath: "ai.settings.temperature", options: [], min: 0, max: 100, step: 5 },
  { id: "ai_max_tokens", label: "Maksimum Token Sayısı", type: "number", categoryId: "ai", subgroupId: "settings", jsonPath: "ai.settings.max_tokens", options: [], min: 0, step: 100 },
  { id: "ai_role", label: "Rol", type: "text", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.role", options: [], placeholder: "Örn. Kıdemli backend mühendisi" },
  { id: "ai_objective", label: "Amaç", type: "textarea", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.objective", options: [] },
  { id: "ai_constraints", label: "Kısıtlar", type: "textarea", categoryId: "ai", subgroupId: "instruction", jsonPath: "ai.instruction.constraints", options: [] },

  // ===== 22. UI / UX Tasarım =====
  { id: "uiux_platform", label: "Platform", type: "select", categoryId: "uiux", subgroupId: "platform", jsonPath: "ui.platform", options: opts(["Web", "Mobil Web", "iOS", "Android", "Masaüstü", "Tablet"]) },
  { id: "uiux_layout", label: "Yerleşim", type: "select", categoryId: "uiux", subgroupId: "layout", jsonPath: "ui.layout", options: opts(["Kontrol Paneli", "Açılış Sayfası", "Akış", "Profil", "Ayarlar", "Yönetim Paneli", "E-Ticaret", "SaaS"]) },
  { id: "uiux_component", label: "Bileşen", type: "multi_select", categoryId: "uiux", subgroupId: "component", jsonPath: "ui.components", options: opts(["Navigasyon Çubuğu", "Kenar Menü", "Kart", "Modal", "Form", "Tablo", "Sekmeler", "Akordeon", "Açılır Menü", "Bildirim", "Arama", "Sayfalama"]) },
  { id: "uiux_style", label: "Tasarım Stili", type: "select", categoryId: "uiux", subgroupId: "style", jsonPath: "ui.design_style", options: opts(["Minimal", "Glassmorphism", "Neumorphism", "Editoryal", "Lüks", "Brütalist", "Soft UI", "Material", "Apple Tarzı", "Fütüristik"]) },
  { id: "uiux_accessibility_level", label: "Erişilebilirlik Seviyesi", type: "select", categoryId: "uiux", subgroupId: "accessibility", jsonPath: "ui.accessibility.level", options: opts(["A", "AA", "AAA"]) },
  { id: "uiux_color_contrast", label: "Renk Kontrastı", type: "select", categoryId: "uiux", subgroupId: "accessibility", jsonPath: "ui.accessibility.color_contrast", options: opts(["Standart", "Yüksek Kontrast", "Renk Körü Dostu"]) },

  // ===== 23. Fotoğraf =====
  { id: "photo_type", label: "Fotoğraf Türü", type: "select", categoryId: "photo", subgroupId: "type", jsonPath: "photo.type", options: opts(["Portre", "Moda", "Sokak", "Manzara", "Ürün", "Mimari", "Yemek", "Otomotiv", "Düğün", "Belgesel"]) },
  { id: "photo_technique", label: "Çekim Tekniği", type: "select", categoryId: "photo", subgroupId: "technique", jsonPath: "photo.technique", options: opts(["Uzun Pozlama", "HDR", "Makro", "Sığ Alan Derinliği", "Derin Alan Derinliği", "Hareket Bulanıklığı", "Hareketi Dondurma"]) },
  { id: "photo_character", label: "Fotoğraf Karakteri", type: "select", categoryId: "photo", subgroupId: "character", jsonPath: "photo.character", options: opts(["Editoryal", "Sinematik", "Doğal", "Ham", "Film", "Polaroid", "Vintage", "Üst Düzey Moda"]) },

  // ===== 24. Negative & Quality =====
  { id: "quality_level", label: "Kalite", type: "multi_select", categoryId: "quality", subgroupId: "quality", jsonPath: "quality.wanted", options: opts(["Yüksek Kalite", "Ultra Detaylı", "Keskin", "Temiz", "Yüksek Çözünürlük", "Profesyonel"]) },
  { id: "quality_anatomy_errors", label: "Anatomik Hatalar (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "anatomy", jsonPath: "quality.avoid_anatomy", options: opts(["Fazla Parmak", "Fazla Uzuv", "Deforme Eller", "Bozuk Anatomi", "Çarpık Yüz", "Asimetrik Gözler"]) },
  { id: "quality_visual_errors", label: "Görsel Hatalar (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "visual", jsonPath: "quality.avoid_visual", options: opts(["Bulanıklık", "Gürültü", "Pikselli", "Düşük Çözünürlük", "Aşırı Pozlanmış", "Yetersiz Pozlanmış", "Görüntü Artefaktları", "Sıkıştırma Bozulması"]) },
  { id: "quality_unwanted_style", label: "İstenmeyen Stil (kaçınılacak)", type: "multi_select", categoryId: "quality", subgroupId: "unwanted", jsonPath: "quality.avoid_style", options: opts(["Düşük Kalite", "Amatör", "Aşırı Doygun Renkler", "Düz Aydınlatma", "Kötü Kompozisyon", "Bozuk Perspektif"]) },
];

export const CATALOG_PACKAGES: CatalogPackage[] = [
  { id: "pkg_basic_character", label: "Temel Karakter", fieldIds: ["char_gender", "char_age_group", "char_type", "char_body_type", "char_skin_tone", "char_hair_color", "char_hair_style", "char_eye_color"] },
  { id: "pkg_face_details", label: "Yüz Detayları", fieldIds: ["char_face_shape", "char_skin_texture", "char_freckles", "char_scar"] },
  { id: "pkg_eye_details", label: "Göz Detayları", fieldIds: ["char_eye_color", "char_eye_shape", "char_eye_size", "char_eye_effect"] },
  { id: "pkg_hair_details", label: "Saç Detayları", fieldIds: ["char_hair_length", "char_hair_style", "char_hair_color", "char_hair_texture", "char_bangs"] },
  { id: "pkg_body_anatomy", label: "Vücut Anatomisi", fieldIds: ["char_body_type", "char_height", "char_muscle_level", "char_body_proportion"] },
  { id: "pkg_clothing", label: "Kıyafet", fieldIds: ["cloth_style", "cloth_top", "cloth_bottom", "cloth_shoes", "cloth_fabric", "cloth_main_color", "cloth_pattern"] },
  { id: "pkg_pose", label: "Poz", fieldIds: ["pose_base", "pose_direction", "pose_hands", "pose_head", "pose_movement"] },
  { id: "pkg_expression", label: "Yüz İfadesi", fieldIds: ["expr_emotion", "expr_eyes", "expr_mouth", "expr_intensity"] },
  { id: "pkg_environment", label: "Ortam", fieldIds: ["env_city", "weather_condition", "weather_atmosphere", "weather_time", "weather_particle"] },
  { id: "pkg_lighting", label: "Işıklandırma", fieldIds: ["light_source", "light_direction", "light_technique", "light_character", "light_color"] },
  { id: "pkg_camera", label: "Kamera", fieldIds: ["cam_shot", "cam_angle", "cam_lens", "cam_aperture", "cam_focus", "cam_movement"] },
  { id: "pkg_composition", label: "Kompozisyon", fieldIds: ["comp_position", "comp_framing", "comp_depth", "comp_perspective", "comp_technique"] },
  { id: "pkg_effects", label: "Efektler", fieldIds: ["fx_light", "fx_atmospheric", "fx_energy", "fx_camera"] },
  { id: "pkg_quality", label: "Kalite", fieldIds: ["quality_level", "quality_anatomy_errors", "quality_visual_errors", "quality_unwanted_style"] },
  { id: "pkg_fantasy", label: "Fantastik Kurulum", fieldIds: ["fantasy_character", "fantasy_creature", "fantasy_world", "fantasy_magic"] },
  { id: "pkg_scifi", label: "Sci-Fi Kurulum", fieldIds: ["scifi_character", "scifi_technology", "scifi_location", "scifi_style"] },
  { id: "pkg_weapons", label: "Silah & Ekipman", fieldIds: ["weapon_melee", "weapon_ranged", "weapon_defense", "weapon_detail"] },
  { id: "pkg_product_shot", label: "Ürün Çekimi", fieldIds: ["product_category", "product_shot", "product_background", "product_ad_style"] },
  { id: "pkg_video_basics", label: "Video Temelleri", fieldIds: ["video_type", "video_duration", "video_aspect_ratio", "video_camera_movement"] },
  { id: "pkg_content_brief", label: "İçerik Brifi", fieldIds: ["text_content_type", "text_audience", "text_tone", "text_length"] },
  { id: "pkg_code_project", label: "Kod Projesi", fieldIds: ["code_language", "code_framework", "code_database", "code_output"] },
  { id: "pkg_ai_settings", label: "AI Prompt Ayarları", fieldIds: ["ai_model", "ai_temperature", "ai_role", "ai_objective"] },
  { id: "pkg_ui_screen", label: "Arayüz Ekranı", fieldIds: ["uiux_platform", "uiux_layout", "uiux_component", "uiux_style"] },
  { id: "pkg_photo_shoot", label: "Fotoğraf Çekimi", fieldIds: ["photo_type", "photo_technique", "photo_character"] },
  { id: "pkg_music_track", label: "Müzik Parçası", fieldIds: ["audio_genre", "audio_mood", "audio_instrument", "audio_tempo"] },
  { id: "pkg_ad_campaign", label: "Reklam Kampanyası", fieldIds: ["marketing_campaign", "marketing_platform", "marketing_audience", "marketing_cta"] },
  { id: "pkg_accessories", label: "Aksesuarlar", fieldIds: ["acc_necklace", "acc_earrings", "acc_ring", "acc_head", "acc_glasses"] },
  { id: "pkg_visual_style", label: "Görsel Stil", fieldIds: ["style_realism", "style_art", "style_cinematic", "style_design"] },
  { id: "pkg_color_palette", label: "Renk Paleti", fieldIds: ["color_primary", "color_secondary", "color_palette", "color_saturation"] },
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
