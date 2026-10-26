import type { ExchangePrompt } from "./prompt-format.ts";

/**
 * Moderatör toplu yüklemesinin parçalama + ilerleme mantığı (docs/history/251-*). Ağ bilmez: `call` bir parçayı sunucuya gönderen
 * işlevdir (`admin_import_prompts`), böylece mantık birim testle doğrulanır. Her parça sunucuda ATOMİKTİR; parçalar arası değil —
 * yarıda kalan yükleme (ağ, durdurma, hız/yetki hatası) tekrar çalıştırılınca yinelenenleri atlayarak kaldığı yerden sürer.
 */

export type BulkItemStatus = "ok" | "duplicate" | "invalid";

export interface BulkItemResult {
  /** Parça içinde 1'den başlar (sunucunun verdiği). */
  index: number;
  status: BulkItemStatus;
  field?: string;
  code?: string;
  warnings?: string[];
  id?: string;
}

export interface BulkBatchReport {
  ok: boolean;
  created: number;
  published?: number;
  items: BulkItemResult[];
}

export interface BulkProgress {
  /** İşlenen (sunucuya gönderilip yanıtı alınan) kayıt sayısı. */
  done: number;
  total: number;
  /** Kuru çalıştırmada "eklenecek", gerçek çalıştırmada "eklenen" kayıtlar (`status: ok`). */
  newCount: number;
  duplicates: number;
  invalid: number;
  /** Gerçekten yazılan (kuru çalıştırmada 0). */
  created: number;
  published: number;
  warnings: number;
}

export interface BulkInvalid {
  /** Bütün listedeki 1 tabanlı sıra. */
  index: number;
  title: string;
  field?: string;
  code?: string;
}

export interface BulkOutcome extends BulkProgress {
  invalidItems: BulkInvalid[];
  /** Hata ya da durdurma nedeniyle yarıda kaldıysa ilk işlenmeyen kaydın 0 tabanlı sırası; tamamlandıysa null. */
  stoppedAt: number | null;
  /** Yarıda kalmaya yol açan hata iletisi (durdurma değilse). */
  error: string | null;
}

export async function runBatches(
  items: ExchangePrompt[],
  batchSize: number,
  call: (batch: ExchangePrompt[]) => Promise<BulkBatchReport>,
  options: { onProgress?: (progress: BulkProgress) => void; shouldStop?: () => boolean } = {},
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = {
    done: 0, total: items.length, newCount: 0, duplicates: 0, invalid: 0, created: 0, published: 0, warnings: 0,
    invalidItems: [], stoppedAt: null, error: null,
  };
  for (let offset = 0; offset < items.length; offset += batchSize) {
    if (options.shouldStop?.()) {
      outcome.stoppedAt = offset;
      return outcome;
    }
    const batch = items.slice(offset, offset + batchSize);
    let report: BulkBatchReport;
    try {
      report = await call(batch);
    } catch (err) {
      outcome.stoppedAt = offset;
      outcome.error = err instanceof Error ? err.message : String(err);
      return outcome;
    }
    for (const result of report.items) {
      if (result.status === "ok") outcome.newCount += 1;
      else if (result.status === "duplicate") outcome.duplicates += 1;
      else {
        outcome.invalid += 1;
        outcome.invalidItems.push({ index: offset + result.index, title: batch[result.index - 1]?.title ?? "", field: result.field, code: result.code });
      }
      if (result.warnings?.length) outcome.warnings += 1;
    }
    outcome.created += report.created;
    outcome.published += report.published ?? 0;
    outcome.done = offset + batch.length;
    options.onProgress?.({ ...outcome });
  }
  return outcome;
}
