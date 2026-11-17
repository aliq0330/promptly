import { DOMAIN_IDS, type DomainId } from "../../lib/domains.ts";

/**
 * İlk giriş kurulumunun konu satırları (docs/history/424-*, 425-*). Kaydedilen değer ortak ALAN kimliğidir (`profiles.interests`, bkz. `@/lib/domains`);
 * yalnız görünen ad çevrilir. Sekiz alanın üç görseli `public/onboarding/` altındadır: sitenin kendi gönderileri DEĞİL, konu başlığına uyan, lisansı serbest
 * (CC0 / kamu malı) stok fotoğraflardır (kaynaklar `public/onboarding/CREDITS.txt`). Görseli olmayan alanlar (iş, eğitim…) fotoğraf yerine düz bir şerit alır.
 */
export interface FirstRunTopic {
  value: DomainId;
  /** Satırın kararlı kimliği (`data-first-run-topic`) = alan kimliği. */
  slug: DomainId;
}

/** `Record` olduğu için yeni bir alan eklenince derleme, görsel kararını da istemeden geçmez. Boş dizi = bu alanın fotoğrafı yok. */
const TOPIC_IMAGES: Record<DomainId, readonly string[]> = {
  art: ["dijital-1", "dijital-2", "dijital-3"],
  photography: ["foto-1", "foto-2", "foto-3"],
  design: ["grafik-1", "grafik-2", "grafik-3"],
  software: ["kod-1", "kod-2", "kod-3"],
  writing: ["yazi-1", "yazi-2", "yazi-3"],
  marketing: [],
  business: [],
  education: [],
  research: [],
  data: [],
  "music-audio": ["muzik-1", "muzik-2", "muzik-3"],
  video: ["video-1", "video-2", "video-3"],
  "game-3d": ["3d-1", "oyun-1", "3d-2"],
  productivity: [],
};

export const FIRST_RUN_TOPICS: readonly FirstRunTopic[] = DOMAIN_IDS.map((value) => ({ value, slug: value }));

export function topicImagePaths(topic: FirstRunTopic): string[] {
  return TOPIC_IMAGES[topic.value].map((name) => `/onboarding/${name}.jpg`);
}
