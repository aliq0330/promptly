/**
 * Studio karşılaştırma yardımcıları (docs/history/296-*): sonuçları modele göre sütunlara ayırır, süreyi biçimler, üretilen çıktıyı
 * "Sonuç olarak paylaş" için dosyaya çevirir. Saf fonksiyonlar — arayüz `features/studio/studio-view.tsx`'tedir.
 */

export interface TargetGroup<T> {
  label: string;
  items: { item: T; index: number }[];
}

/** Sonuçları etiketine (model) göre gruplar; gruplar ilk görülme sırasındadır, her grubun içinde özgün sıra korunur. `index` listedeki yerdir. */
export function groupByLabel<T>(items: readonly T[], labelOf: (item: T) => string): TargetGroup<T>[] {
  const groups = new Map<string, TargetGroup<T>>();
  items.forEach((item, index) => {
    const label = labelOf(item);
    const group = groups.get(label) ?? { label, items: [] };
    group.items.push({ item, index });
    groups.set(label, group);
  });
  return [...groups.values()];
}

/** "4,2" / "4.2": saniye, tek ondalık. Süre bilinmiyorsa (geçmişten açılan sonuç) null. */
export function formatSeconds(ms: number | null | undefined, locale: string): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  return (Math.round(ms / 100) / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** `data:image/png;base64,…` → `File` (ağ isteği yok). Çözülemeyen/görsel olmayan adres null döner. */
export function dataUrlToFile(dataUrl: string, baseName: string): File | null {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match || !match[1].toLowerCase().startsWith("image/")) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const type = match[1].toLowerCase();
    return new File([bytes], `${baseName}.${EXT[type] ?? "png"}`, { type });
  } catch {
    return null;
  }
}
