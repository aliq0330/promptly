/**
 * Yaratıcı paneli (docs/history/294-*) — saf kurallar: dönem seçenekleri, artış/azalış, grafik ölçeği ve çizgi noktaları, tepki dağılımı.
 * Bileşenlerden ayrı tutulur ki sayı/ölçek kuralları birim testle sınansın; ağa ve DOM'a dokunmaz.
 */
import { isReactionKey, REACTION_KEYS, type ReactionKey } from "./reactions.ts";

export const INSIGHT_PERIODS = [7, 30, 90] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];
export const DEFAULT_INSIGHT_PERIOD: InsightPeriod = 30;

export interface InsightSummary {
  copies: number;
  prevCopies: number;
  reactions: number;
  prevReactions: number;
  comments: number;
  prevComments: number;
  saves: number;
  prevSaves: number;
  followers: number;
  prevFollowers: number;
  /** Başkalarının promptlarının altına paylaştığı sonuç sayısı (docs/history/295-*). */
  results: number;
  prevResults: number;
}

export interface InsightDay {
  /** UTC günü, `YYYY-MM-DD`. */
  day: string;
  copies: number;
  reactions: number;
  comments: number;
  /** Yalnız prompt başına seride gelir (genel seride yok). */
  results?: number;
}

/** Tek bir promptun özeti (prompt başına ayrıntı sayfası): başlık/tür/araç + beş sayı ve önceki dönemleri. */
export interface InsightPromptSummary {
  title: string;
  contentType: string;
  tools: string[];
  copies: number;
  prevCopies: number;
  reactions: number;
  prevReactions: number;
  comments: number;
  prevComments: number;
  saves: number;
  prevSaves: number;
  results: number;
  prevResults: number;
}

/** Prompt başına ayrıntı sayfasının adresi (statik export: `/x/local?id=`). */
export function insightPromptHref(id: string): string {
  return `/insights/local?id=${id}`;
}

export interface InsightTopItem {
  id: string;
  title: string;
  contentType: string;
  tools: string[];
  copies: number;
  reactions: number;
  prevCopies: number;
}

export interface InsightReactionRow {
  reaction: ReactionKey;
  n: number;
  /** En çok verilen tepkiye göre 0–100 (çubuk genişliği). */
  barPercent: number;
}

export const EMPTY_SUMMARY: InsightSummary = {
  copies: 0, prevCopies: 0, reactions: 0, prevReactions: 0, comments: 0, prevComments: 0, saves: 0, prevSaves: 0, followers: 0, prevFollowers: 0, results: 0, prevResults: 0,
};

export type TrendKind = "up" | "down" | "flat" | "new";
export interface Trend {
  kind: TrendKind;
  /** Mutlak yüzde (yuvarlanmış); `flat` ve `new` için 0. */
  percent: number;
}

/**
 * Önceki döneme göre değişim. Önceki dönem 0 iken artış yüzdesi tanımsızdır → "new" (yeni): 0'dan 40'a "%∞" demek yanıltıcı olur.
 * İkisi de 0 ya da eşitse "flat".
 */
export function trendOf(current: number, previous: number): Trend {
  if (current === previous) return { kind: "flat", percent: 0 };
  if (previous <= 0) return current > 0 ? { kind: "new", percent: 0 } : { kind: "flat", percent: 0 };
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) return { kind: "flat", percent: 0 };
  return { kind: current > previous ? "up" : "down", percent };
}

/** Hiç etkileşim yok mu (hem bu dönem hem önceki dönem hem de liste boş) — boş durum ekranı için. */
export function hasNoActivity(summary: InsightSummary, days: InsightDay[], top: InsightTopItem[]): boolean {
  const totals = summary.copies + summary.prevCopies + summary.reactions + summary.prevReactions + summary.comments + summary.prevComments +
    summary.saves + summary.prevSaves + summary.followers + summary.prevFollowers + summary.results + summary.prevResults;
  return totals === 0 && top.length === 0 && days.every((d) => d.copies + d.reactions + d.comments === 0);
}

/** Tek promptta hem bu dönem hem önceki dönem hiç etkileşim yok mu (ayrıntı sayfasında "etkileşim olmadı" notu için). */
export function promptHasNoActivity(summary: InsightPromptSummary, days: InsightDay[]): boolean {
  const totals = summary.copies + summary.prevCopies + summary.reactions + summary.prevReactions + summary.comments + summary.prevComments +
    summary.saves + summary.prevSaves + summary.results + summary.prevResults;
  return totals === 0 && days.every((d) => d.copies + d.reactions + d.comments + (d.results ?? 0) === 0);
}

/**
 * Dikey eksenin tavanı: 4'e tam bölünen "yuvarlak" bir sayı (4, 8, 12, 20, 40, 60, 80, 100, 200 …) — dört eşit ızgara aralığı hep tam sayı çıkar.
 * Sıfır ya da küçük değerlerde en az 4.
 */
export function niceMax(value: number): number {
  const max = Math.max(4, Math.ceil(Number.isFinite(value) ? value : 0));
  for (let mag = 1; mag <= 1e9; mag *= 10) {
    for (const step of [1, 2, 4, 6, 8, 10]) {
      const candidate = step * mag;
      if (candidate >= max && candidate % 4 === 0) return candidate;
    }
  }
  return max;
}

/** Izgara çizgilerinin değerleri: 0 … tavan, dört eşit aralık. */
export function chartTicks(max: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
}

/** Bir seriyi `width`×`height` kutusuna çizgi noktalarına çevirir ("x,y x,y …"); y yukarı doğru artar. Tek noktada çizgi yatay uzanır. */
export function linePoints(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return "";
  const safeMax = max > 0 ? max : 1;
  const xs = (i: number) => (values.length === 1 ? 0 : (i * width) / (values.length - 1));
  const ys = (v: number) => height - (Math.min(Math.max(v, 0), safeMax) / safeMax) * height;
  const points = values.map((v, i) => `${round1(xs(i))},${round1(ys(v))}`);
  if (values.length === 1) points.push(`${round1(width)},${round1(ys(values[0]))}`);
  return points.join(" ");
}

/** Çizginin altını boyayan kapalı çokgen. */
export function areaPoints(values: number[], width: number, height: number, max: number): string {
  const line = linePoints(values, width, height, max);
  return line ? `${line} ${round1(width)},${height} 0,${height}` : "";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** En yüksek değerin sırası; hepsi 0 ise -1 (işaretlenecek zirve yok). Eşitlikte en yeni gün. */
export function peakIndex(values: number[]): number {
  let best = -1;
  let bestValue = 0;
  values.forEach((v, i) => {
    if (v > 0 && v >= bestValue) {
      best = i;
      bestValue = v;
    }
  });
  return best;
}

/** Eksen etiketi için eşit aralıklı gün sıraları (ilk ve son dahil, en çok `count`). */
export function labelIndexes(length: number, count = 5): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const last = length - 1;
  return Array.from(new Set(Array.from({ length: count }, (_, i) => Math.round((i * last) / (count - 1)))));
}

/** `reaction_mix` satırları: bilinmeyen tepki atılır, çok → az sıralanır, çubuk oranı en büyüğe göredir. */
export function reactionRows(rows: { reaction: string; n: number }[]): InsightReactionRow[] {
  const known = rows.filter((r) => isReactionKey(r.reaction) && r.n > 0) as { reaction: ReactionKey; n: number }[];
  const top = known.reduce((m, r) => Math.max(m, r.n), 0);
  return known
    .map((r) => ({ reaction: r.reaction, n: r.n, barPercent: top > 0 ? Math.max(3, Math.round((r.n / top) * 100)) : 0 }))
    .sort((a, b) => b.n - a.n || REACTION_KEYS.indexOf(a.reaction) - REACTION_KEYS.indexOf(b.reaction));
}

export function reactionTotal(rows: { n: number }[]): number {
  return rows.reduce((sum, r) => sum + r.n, 0);
}

/** `YYYY-MM-DD` (UTC günü) → okunur kısa tarih ("31 Eki" / "Oct 31"). Gün bir takvim günüdür, saat dilimi kaymaz. */
export function formatInsightDay(day: string, language: "tr" | "en"): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** Tam sayı, dile göre binlik ayraçlı ("1.284" / "1,284"). */
export function formatInsightNumber(value: number, language: "tr" | "en"): string {
  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US").format(Math.round(value));
}
