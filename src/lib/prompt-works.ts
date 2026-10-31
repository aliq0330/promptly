/**
 * "Çalıştı mı?" oyunun saf kuralları (Promptly Skoru'nun ilk dilimi; docs/history/296-*): sayılardan ne gösterileceği ve iyimser güncelleme.
 * Oyu kimin verebileceği SUNUCU kuralıdır (`set_prompt_works`: kopyalamış olmalı, yazar değil, engel yok); burada yalnız gösterim eşikleri var.
 * Az oyla yanıltıcı yüzde göstermemek için rozet iki eşiğe bağlıdır: yeterli oy sayısı VE Wilson alt sınırı (3/3 = "%100" ≠ kanıt).
 */

export interface WorksState {
  yes: number;
  no: number;
  /** Benim oyum: true = çalıştı, false = çalışmadı, null = oy yok. */
  myVote: boolean | null;
  /** Şu an oy verebilir miyim (oturum + yazar değil + engel yok + kopyalamış). Sunucu hesaplar. */
  canVote: boolean;
}

/** Bu kadar oydan azsa yüzde gösterilmez ("henüz yeterli oy yok"). */
export const WORKS_MIN_VOTES = 5;
/** "Kanıtlanmış" rozeti için asgari oy ve Wilson alt sınırı. */
export const WORKS_PROVEN_MIN_VOTES = 10;
export const WORKS_PROVEN_MIN_LOWER = 0.7;

export type WorksTier = "none" | "few" | "mixed" | "proven";

export interface WorksSummary {
  total: number;
  /** Çalıştı diyenlerin yüzdesi (yuvarlanmış); `none`/`few` iken 0 ve gösterilmez. */
  percent: number;
  tier: WorksTier;
}

/** Wilson skoru alt sınırı (%95): küçük örneklemde oranı aşağı çeker; 0–1. */
export function wilsonLowerBound(yes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = Math.min(Math.max(yes / total, 0), 1);
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

export function summarizeWorks(yes: number, no: number): WorksSummary {
  const total = Math.max(0, yes) + Math.max(0, no);
  if (total === 0) return { total, percent: 0, tier: "none" };
  if (total < WORKS_MIN_VOTES) return { total, percent: 0, tier: "few" };
  const percent = Math.round((yes / total) * 100);
  const proven = total >= WORKS_PROVEN_MIN_VOTES && wilsonLowerBound(yes, total) >= WORKS_PROVEN_MIN_LOWER;
  return { total, percent, tier: proven ? "proven" : "mixed" };
}

/**
 * İyimser güncelleme: `vote` (true/false) verilir, aynı oy tekrar verilirse GERİ ALINIR (null). Girdiyi değiştirmez.
 * Sunucu cevabı gelince gerçek sayılarla değiştirilir.
 */
export function toggleVote(state: WorksState, vote: boolean): WorksState {
  const next: boolean | null = state.myVote === vote ? null : vote;
  let { yes, no } = state;
  if (state.myVote === true) yes = Math.max(0, yes - 1);
  if (state.myVote === false) no = Math.max(0, no - 1);
  if (next === true) yes += 1;
  if (next === false) no += 1;
  return { ...state, yes, no, myVote: next };
}
