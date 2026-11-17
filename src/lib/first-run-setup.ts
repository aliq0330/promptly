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

/**
 * Üçüncü adım: kullanıcı adı + profil resmi. Kayıtta kullanıcı adını veritabanı üretir (`handle_new_user`); burada yeni üye onu görür ve
 * isterse değiştirir. Biçim kuralı `profiles_username_format` / `lib/supabase/profiles.ts` `USERNAME_PATTERN` ile AYNIDIR (test karşılaştırır).
 */
export const USERNAME_FORMAT = /^[a-z0-9_.]{3,30}$/;
export const USERNAME_MAX = 30;

/** Hazır profil resmi renkleri (kullanıcı verisinin varsayılanı: resme çizilen piksel renkleridir, arayüz token'ı değil). Beyaz harfle ≥ 4.5:1. */
export const AVATAR_COLORS = ["#3b5be2", "#b4530f", "#17653a", "#6b2fa3", "#0e5a73", "#a3204a"] as const;

/** Yazılanı kullanıcı adına çevirir: küçük harf, boşluksuz, en çok 30 karakter. */
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/\s/g, "").slice(0, USERNAME_MAX);
}

export type UsernameFormat = "empty" | "short" | "invalid" | "valid";

export function usernameFormat(username: string): UsernameFormat {
  if (username.length === 0) return "empty";
  if (!/^[a-z0-9_.]+$/.test(username)) return "invalid";
  if (username.length < 3) return "short";
  return USERNAME_FORMAT.test(username) ? "valid" : "invalid";
}

/** Sunucuya sorulan "bu ad alınmış mı?" yanıtının durumu. */
export type UsernameCheck = "idle" | "checking" | "taken" | "free" | "error";
export type UsernameStatus = UsernameFormat | "checking" | "taken" | "available";

/**
 * Alan altındaki durum. Kişinin şu anki adı hep "müsait"tir (kendi adı); sorgu hatası engellemez ("available" — kesin karar kayıtta,
 * veritabanının benzersizlik kuralındadır).
 */
export function usernameStatus(username: string, check: UsernameCheck, current: string): UsernameStatus {
  const format = usernameFormat(username);
  if (format !== "valid") return format;
  if (username === current) return "available";
  if (check === "taken") return "taken";
  if (check === "free" || check === "error") return "available";
  return "checking";
}

export function usernameCanFinish(status: UsernameStatus): boolean {
  return status === "available";
}

/** Alınmış bir ad için iki öneri (geçerli biçimde, 30 karakteri aşmadan). */
export function usernameSuggestions(username: string): [string, string] {
  const base = username.slice(0, USERNAME_MAX - 3);
  return [`${base}_1`, `${base}.tr`];
}

/** Resmin üstündeki baş harf (büyük harf; ad boşsa "M"). */
export function avatarInitial(username: string): string {
  return (username[0] ?? "m").toUpperCase();
}
