/**
 * Fixed catalog of creative categories a user can tag their profile with
 * (CLAUDE.md section 16). This is a closed, local list — not a Supabase
 * table — kept small and curated rather than free-text so profile chips
 * stay consistent across the app.
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
