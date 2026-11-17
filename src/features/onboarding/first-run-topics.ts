import { INTEREST_OPTIONS, type InterestOption } from "@/features/profile/interest-options";

/**
 * İlk giriş kurulumunun konu satırları (docs/history/424-*). Kaydedilen değer profilin `interests` değeridir
 * (`INTEREST_OPTIONS`, Türkçe orijinal metin — `for_you_page` aynı değerleri kategoriye eşler); yalnız görünen ad `INTEREST_OPTION_LABELS`
 * ile çevrilir. Her konunun üç görseli `public/onboarding/` altındadır: sitenin kendi gönderileri DEĞİL, konu başlığına uyan, lisansı serbest
 * (CC0 / kamu malı) stok fotoğraflardır (kaynaklar `public/onboarding/CREDITS.txt`).
 */
export interface FirstRunTopic {
  value: InterestOption;
  /** `public/onboarding/<slug>-1..3.jpg` */
  slug: string;
}

/** `Record` olduğu için yeni bir ilgi alanı eklenince derleme, görsel slug'ı da istemeden geçmez. */
const TOPIC_SLUGS: Record<InterestOption, string> = {
  "Dijital Sanat": "dijital",
  Fotoğrafçılık: "foto",
  "Grafik Tasarım": "grafik",
  "Yazılım ve Kodlama": "kod",
  "Hikaye ve Yaratıcı Yazarlık": "yazi",
  "Video Üretimi": "video",
  "Müzik ve Ses": "muzik",
  "3D Tasarım": "3d",
  "Oyun Geliştirme": "oyun",
};

export const FIRST_RUN_TOPICS: readonly FirstRunTopic[] = INTEREST_OPTIONS.map((value) => ({ value, slug: TOPIC_SLUGS[value] }));

export function topicImagePaths(topic: FirstRunTopic): string[] {
  return [1, 2, 3].map((n) => `/onboarding/${topic.slug}-${n}.jpg`);
}
