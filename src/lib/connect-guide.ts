import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * "Yapay zekâ aracına bağla" rehberinin (Ayarlar → Geliştirici ve /developers → Hesabınla bağla) adım verisi ve saf yardımcıları (docs/history/319-*).
 * Metinler çeviri anahtarıdır; adres/başlık/değer gibi kopyalanacak parçalar `ConnectCode` ile adlandırılır ve bileşen gerçek değeri koyar (uydurma adres yok).
 * İki yol: `oauth` (izin vererek, "deneysel") ve `key` (kişisel anahtar, Authorization başlığı).
 */

export type ConnectMethod = "oauth" | "key";

/** Adımın altında kopyalanabilir bloğa dönüşen değer. */
export type ConnectCode = "address" | "headerName" | "headerValue";

export interface ConnectStep {
  id: string;
  title: TranslationKey;
  body: TranslationKey;
  code?: ConnectCode;
  warn?: TranslationKey;
  /** Aracın bağlayıcı formunun küçük resmi (adres kutusu vurgulu). */
  sketch?: boolean;
  /** "Anahtarlarım" bölümüne bağlantı. */
  keysLink?: boolean;
}

export const CONNECT_METHODS: ConnectMethod[] = ["oauth", "key"];

export const CONNECT_STEPS: Record<ConnectMethod, ConnectStep[]> = {
  oauth: [
    { id: "open", title: "guide.oauth.open.title", body: "guide.oauth.open.body" },
    { id: "connector", title: "guide.connector.title", body: "guide.connector.body" },
    { id: "address", title: "guide.oauth.address.title", body: "guide.oauth.address.body", code: "address", sketch: true },
    { id: "connect", title: "guide.oauth.connect.title", body: "guide.oauth.connect.body" },
    { id: "allow", title: "guide.oauth.allow.title", body: "guide.oauth.allow.body" },
  ],
  key: [
    { id: "create", title: "guide.key.create.title", body: "guide.key.create.body", keysLink: true },
    { id: "copy", title: "guide.key.copy.title", body: "guide.key.copy.body" },
    { id: "connector", title: "guide.connector.title", body: "guide.connector.body" },
    { id: "address", title: "guide.key.address.title", body: "guide.key.address.body", code: "address", sketch: true },
    { id: "noauth", title: "guide.key.noauth.title", body: "guide.key.noauth.body" },
    { id: "header", title: "guide.key.header.title", body: "guide.key.header.body", code: "headerName" },
    { id: "value", title: "guide.key.value.title", body: "devSettings.step5Value", code: "headerValue", warn: "devSettings.step5Warn" },
    { id: "add", title: "guide.key.add.title", body: "devSettings.step6" },
  ],
};

export type StepState = "done" | "current" | "todo";

/** Adım listesindeki bir satırın durumu: öncekiler tamam, şimdiki, sonrakiler bekliyor. */
export function stepState(index: number, current: number): StepState {
  if (index < current) return "done";
  return index === current ? "current" : "todo";
}

/** Adım numarasını `[0, total - 1]` aralığında tutar (boş liste → 0). */
export function clampStep(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** İlerleme çubuğunun dolu parça sayısı: şimdiki adım dahil. */
export function filledSegments(current: number, total: number): number {
  if (total <= 0) return 0;
  return clampStep(current, total) + 1;
}
