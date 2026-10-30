/**
 * Merkezi şikâyet nedenleri (docs/history/284-*): hangi içerik türünde hangi hazır neden gösterilir. Aynı tablo veritabanında
 * `_report_reasons_for()` olarak tutulur (sunucu da doğrular); `report-reasons.test.ts` ikisini karşılaştırır — birini değiştirince diğerini de değiştir.
 */
export const REPORT_REASON_CODES = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "copyright",
  "privacy",
  "fraud",
  "wrongcat",
  "impersonation",
  "platform",
  "other",
] as const;
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

/** `reports.target_type` + topluluk içi iki hedef (`community_reports`'a yönlenir). */
export const REPORT_TARGET_TYPES = [
  "prompt",
  "request",
  "workflow",
  "preset",
  "space",
  "quote",
  "story",
  "user",
  "comment",
  "message",
  "community",
  "community_post",
  "chat_message",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_DETAILS_MAX = 1000;
/** "Diğer" seçilince ek bilginin en az uzunluğu (sunucuda da aynı). */
export const REPORT_OTHER_MIN = 3;

const CONTENT: readonly ReportReasonCode[] = ["spam", "copyright", "sexual", "hate", "harassment", "violence", "privacy", "fraud", "wrongcat", "platform", "other"];
const MESSAGE: readonly ReportReasonCode[] = ["harassment", "spam", "hate", "sexual", "violence", "privacy", "fraud", "other"];

export const REPORT_REASONS_BY_TARGET: Record<ReportTargetType, readonly ReportReasonCode[]> = {
  prompt: CONTENT,
  request: CONTENT,
  workflow: CONTENT,
  preset: CONTENT,
  space: CONTENT,
  quote: CONTENT,
  story: CONTENT,
  user: ["impersonation", "harassment", "spam", "hate", "sexual", "violence", "privacy", "fraud", "other"],
  comment: MESSAGE,
  message: MESSAGE,
  chat_message: MESSAGE,
  community_post: ["spam", "harassment", "hate", "sexual", "violence", "wrongcat", "copyright", "privacy", "fraud", "platform", "other"],
  community: ["wrongcat", "spam", "hate", "harassment", "violence", "fraud", "impersonation", "sexual", "other"],
};

export function reportReasonsFor(type: ReportTargetType): readonly ReportReasonCode[] {
  return REPORT_REASONS_BY_TARGET[type];
}

export function isReportReasonCode(value: unknown): value is ReportReasonCode {
  return typeof value === "string" && (REPORT_REASON_CODES as readonly string[]).includes(value);
}

/** Gönder düğmesinin açılma koşulu: neden seçili; "Diğer" ise ek bilgi de gerekli. */
export function reportDetailsProblem(code: ReportReasonCode | null, details: string): "reason" | "details" | null {
  if (!code) return "reason";
  if (code === "other" && [...details.trim()].length < REPORT_OTHER_MIN) return "details";
  return null;
}
