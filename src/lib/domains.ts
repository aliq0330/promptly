import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Ortak ALAN sözlüğü (docs/history/426-*): "konu/alan" ekseninin TEK kaynağı. Profil ilgi alanı (`profiles.interests`), Skill uzmanlık alanı
 * (`skill_categories.id ⊂ domains.id`) ve prompt kategorileri (`taxonomy_category_domains`) aynı kimlikleri kullanır. Ortam (görsel/metin/ses/video)
 * ayrı bir eksendir ve `content-taxonomy.ts`'te kalır; bu liste onun yerine geçmez.
 *
 * Liste veritabanındaki `domains` tablosuyla birebir aynıdır (`domains.test.ts` migration metnini okuyup karşılaştırır): yeni alan = migration
 * satırı + buraya kimlik + `domain.*` çevirisi. Saklanan değer kimliktir (çevrilmez); yalnız görünen ad çevrilir.
 */
export const DOMAIN_IDS = [
  "art",
  "photography",
  "design",
  "software",
  "writing",
  "marketing",
  "business",
  "education",
  "research",
  "data",
  "music-audio",
  "video",
  "game-3d",
  "productivity",
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

export const DOMAIN_LABEL_KEYS: Record<DomainId, TranslationKey> = {
  art: "domain.art",
  photography: "domain.photography",
  design: "domain.design",
  software: "domain.software",
  writing: "domain.writing",
  marketing: "domain.marketing",
  business: "domain.business",
  education: "domain.education",
  research: "domain.research",
  data: "domain.data",
  "music-audio": "domain.musicAudio",
  video: "domain.video",
  "game-3d": "domain.game3d",
  productivity: "domain.productivity",
};

export function isDomainId(value: unknown): value is DomainId {
  return typeof value === "string" && (DOMAIN_IDS as readonly string[]).includes(value);
}

/** Alan kimliğinden önceki (Türkçe metin) ilgi alanı değerleri → alan. SQL `interest_domain` ile aynı eşleme. */
export const LEGACY_INTEREST_DOMAIN: Readonly<Record<string, DomainId>> = {
  "Dijital Sanat": "art",
  Fotoğrafçılık: "photography",
  "Grafik Tasarım": "design",
  "Yazılım ve Kodlama": "software",
  "Hikaye ve Yaratıcı Yazarlık": "writing",
  "Video Üretimi": "video",
  "Müzik ve Ses": "music-audio",
  "3D Tasarım": "game-3d",
  "Oyun Geliştirme": "game-3d",
};

/** Bir ilgi alanı değerini alana çözer (kimlik ya da eski Türkçe değer); tanınmayan `null`. */
export function interestDomain(value: string | null | undefined): DomainId | null {
  const v = (value ?? "").trim();
  if (isDomainId(v)) return v;
  return LEGACY_INTEREST_DOMAIN[v] ?? null;
}

/** Profilden gelen ilgi alanı listesi: eski değerler alana çevrilir, yinelenenler birleşir, tanınmayanlar düşer (ilk görülme sırası korunur). */
export function normalizeInterests(values: readonly string[] | null | undefined): DomainId[] {
  const out: DomainId[] = [];
  for (const raw of values ?? []) {
    const id = interestDomain(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
