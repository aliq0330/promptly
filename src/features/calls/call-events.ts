/**
 * Çağrı satırı olayları (docs/history/450-*): `CallProvider` Realtime'dan gelen HER çağrı satırını buraya yayınlar; sohbet akışı, Aramalar
 * listesi ve mesaj listesi önizlemesi aynı kaynaktan canlı güncellenir (her biri ayrı Realtime kanalı açmaz). Modül düzeyindedir: uygulama
 * statik dışa aktarmadır, sekme başına tek örnek vardır.
 */
import type { CallRow } from "@/lib/webrtc/types";

const listeners = new Set<(row: CallRow) => void>();

export function publishCallRow(row: CallRow): void {
  for (const listener of [...listeners]) listener(row);
}

export function subscribeCallRows(listener: (row: CallRow) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
