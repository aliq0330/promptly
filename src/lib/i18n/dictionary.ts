/**
 * Çalışma zamanı sözlüğü (docs/history/372-*): metinlere bileşenler `useTranslation().t`, bileşen dışı kod
 * `translateForRuntime` (`./runtime`) ile erişir — ikisi de buradan okur.
 *
 * Türkçe (varsayılan dil, statik ön-çizim de Türkçe) sayfayla birlikte gelir; İngilizce yalnız gerekince ayrı parça olarak
 * indirilir. Kaynak `translations*.ts`'tir; `generated/*` oradan `node scripts/build-i18n.mjs` ile üretilir. Bu dosya
 * `translations.ts`'ten YALNIZ tip alır — değer içe aktarmak iki dili birden pakete geri sokar.
 */
import type { Language, TranslationKey } from "./translations";
import tr from "./generated/tr";

type Dictionary = Record<string, string>;

const loaded: Partial<Record<Language, Dictionary>> = { tr };
let pendingEn: Promise<void> | null = null;

export function isDictionaryLoaded(language: Language): boolean {
  return Boolean(loaded[language]);
}

/** Dilin sözlüğünü yükler (zaten yüklüyse hemen döner). Ağ hatasında bir sonraki çağrı yeniden dener. */
export function loadDictionary(language: Language): Promise<void> {
  if (loaded[language]) return Promise.resolve();
  pendingEn ??= import("./generated/en")
    .then((mod) => {
      loaded.en = mod.default;
    })
    .catch((error: unknown) => {
      pendingEn = null;
      throw error;
    });
  return pendingEn;
}

// İngilizce ziyaretçide (`languageInitScript` <html lang>'i ilk boyamadan önce yazar) sözlük React'i beklemeden, hidrasyonla
// paralel inmeye başlar — İngilizce'ye geçiş, Türkçe ön-çizimden sonra mümkün olan en erken anda olur.
if (typeof document !== "undefined" && document.documentElement.lang === "en") {
  loadDictionary("en").catch(() => {
    // Sağlayıcı yeniden dener; burada sessiz.
  });
}

/** Ham metin; dil henüz yüklenmediyse Türkçesi, anahtar hiç yoksa `undefined`. */
export function lookupTranslation(key: TranslationKey | string, language: Language): string | undefined {
  return (loaded[language] ?? loaded.tr)?.[key];
}

/** `{{token}}` yer tutucularını doldurur (yalnız verilen parametreler; bilinmeyen jeton olduğu gibi kalır). */
export function fillParams(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (match, token: string) => (token in params ? String(params[token]) : match));
}
