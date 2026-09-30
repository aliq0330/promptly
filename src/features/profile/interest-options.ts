import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Fixed catalog of creative categories a user can tag their profile with
 * (CLAUDE.md section 16). This is a closed, local list — not a Supabase
 * table — kept small and curated rather than free-text so profile chips
 * stay consistent across the app. The stored VALUE (what a profile's
 * `interests` array actually holds, so existing stored profiles keep
 * working unchanged) stays this original Turkish string — only the
 * DISPLAYED label goes through `INTEREST_OPTION_LABELS`/`t()`, the same
 * value/label split `GENERATOR_CATEGORY_TOPIC_LABELS` already uses.
 */
export const INTEREST_OPTIONS = [
  "Dijital Sanat",
  "Fotoğrafçılık",
  "Grafik Tasarım",
  "Yazılım ve Kodlama",
  "Hikaye ve Yaratıcı Yazarlık",
  "Video Üretimi",
  "Müzik ve Ses",
  "3D Tasarım",
  "Oyun Geliştirme",
] as const;

export type InterestOption = (typeof INTEREST_OPTIONS)[number];

export const INTEREST_OPTION_LABELS: Record<InterestOption, TranslationKey> = {
  "Dijital Sanat": "interest.digitalArt",
  Fotoğrafçılık: "interest.photography",
  "Grafik Tasarım": "interest.graphicDesign",
  "Yazılım ve Kodlama": "interest.softwareAndCoding",
  "Hikaye ve Yaratıcı Yazarlık": "interest.storyAndCreativeWriting",
  "Video Üretimi": "interest.videoProduction",
  "Müzik ve Ses": "interest.musicAndAudio",
  "3D Tasarım": "interest.threeDDesign",
  "Oyun Geliştirme": "interest.gameDevelopment",
};
