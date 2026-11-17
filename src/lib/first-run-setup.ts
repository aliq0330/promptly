/**
 * İlk giriş kurulumu (docs/history/424-*): yeni kayıt olan biri, en az 2 konu seçmeden siteyi kullanamaz.
 * Karar tek yerde, saf: ekran (`features/onboarding/first-run-gate.tsx`) yalnız burayı çağırır.
 *
 * "Yeni kayıt" = hesap `FIRST_RUN_SINCE`'ten SONRA açıldı. Eski hesaplar (tarihten önce) hiçbir zaman zorlanmaz; veritabanına yeni sütun
 * eklenmedi — tamamlanma durumu zaten `profiles.interests` (en az 2 konu) ile sunucuda durur, cihaz bayrağı yalnız "profil yüklenmeden
 * uygulamayı çizebilir miyim" ipucudur (kayıt yoksa asla "atla" değil, "bekle" demektir).
 */

/** Kurulumun asgari / azami konu sayısı (profil ilgi alanlarıyla aynı kayıt: `profiles.interests`). */
export const FIRST_RUN_MIN_TOPICS = 2;
export const FIRST_RUN_MAX_TOPICS = 5;
/** İsteğe bağlı kişi adımında önerilen takip sayısı (zorunlu DEĞİL). */
export const FIRST_RUN_SUGGESTED_FOLLOWS = 3;

const DEFAULT_SINCE = "2026-11-17T00:00:00Z";

/** Bu andan sonra açılan hesaplar kurulumdan geçer. Derleme zamanında `NEXT_PUBLIC_FIRST_RUN_SINCE` ile değiştirilebilir (test/önizleme). */
export const FIRST_RUN_SINCE: number = Date.parse(process.env.NEXT_PUBLIC_FIRST_RUN_SINCE || DEFAULT_SINCE);

export interface FirstRunProfile {
  createdAt: string;
  interests?: string[] | null;
  isDemo?: boolean;
}

/**
 * Bu profil için kurulum zorunlu mu?
 *  - `done`: bu cihazda bu hesap için kurulum bitti (ya da hesap zaten kurulumdan geçmiş sayıldı).
 *  - Hesap tarihi okunamıyorsa zorlama YOK (yanlış kişiyi kilitlemekten iyidir).
 */
export function firstRunRequired(profile: FirstRunProfile, done: boolean, since: number = FIRST_RUN_SINCE): boolean {
  if (done) return false;
  if (profile.isDemo) return false;
  const created = Date.parse(profile.createdAt);
  if (!Number.isFinite(created) || !Number.isFinite(since)) return false;
  if (created < since) return false;
  return (profile.interests ?? []).length < FIRST_RUN_MIN_TOPICS;
}

/** Seçilen konuları sınırlar içinde tutarak açıp kapatır (sıra korunur, en fazla `FIRST_RUN_MAX_TOPICS`). */
export function toggleTopic(picked: readonly string[], value: string, max: number = FIRST_RUN_MAX_TOPICS): string[] {
  if (picked.includes(value)) return picked.filter((v) => v !== value);
  if (picked.length >= max) return [...picked];
  return [...picked, value];
}

/** Konu adımının alt çubuk durumu: kaç konu daha gerek, "İleri" açık mı. */
export function topicProgress(count: number, min: number = FIRST_RUN_MIN_TOPICS): { missing: number; canContinue: boolean } {
  const missing = Math.max(0, min - count);
  return { missing, canContinue: missing === 0 };
}

const DONE_KEY_PREFIX = "promptly-first-run-done:";

export function firstRunDoneKey(userId: string): string {
  return `${DONE_KEY_PREFIX}${userId}`;
}

export interface DoneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): DoneStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Bu cihazda bu hesabın kurulumu bitti mi? Depolama yoksa/engelliyse `false` (= profili bekle). */
export function readFirstRunDone(userId: string, storage: DoneStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(firstRunDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markFirstRunDone(userId: string, storage: DoneStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(firstRunDoneKey(userId), "1");
  } catch {
    /* depolama engelli — profil yüklenince karar yine ilgi alanlarından verilir */
  }
}
