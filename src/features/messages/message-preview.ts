import type { TranslationKey } from "@/lib/i18n/translations";
import type { Message } from "@/types";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Tek satırlık metin özeti (sabit çubuğu, arama/yıldız satırı): gövde varsa o, yoksa fotoğraf / paylaşılan içerik etiketi. */
export function messagePreviewText(message: Pick<Message, "body" | "attachments" | "sharedPromptId" | "sharedRequestId">, t: T): string {
  const body = message.body?.trim();
  if (body) return body.length > 200 ? `${body.slice(0, 200)}…` : body;
  if (message.attachments.length > 0) return t("chat.pin.photo");
  if (message.sharedPromptId || message.sharedRequestId) return t("chat.pin.shared");
  return "";
}
