import type { TFunction } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * `notifications.message` is composed in Turkish by the SQL notification
 * triggers (the stored text is a plain sentence: a fixed Turkish lead plus
 * an optional quoted preview of user content). Instead of rewriting every
 * trigger (and leaving old rows behind), the client recognises those known
 * sentence templates and re-renders them in the active language, passing the
 * quoted user content through untouched (user content is never translated).
 * Unknown text falls back to the stored message unchanged.
 */
const PREVIEW_TEMPLATES: [prefix: string, key: string, hasNoPreviewForm: boolean][] = [
  ["Paylaşımını beğendi", "notifMsg.likedPost", true],
  ["Yorumunu beğendi", "notifMsg.likedComment", true],
  ["Generatorunu beğendi", "notifMsg.likedGenerator", false],
  ["Paylaşımına yorum yaptı", "notifMsg.commentedPost", true],
  ["Generatoruna yorum yaptı", "notifMsg.commentedGenerator", false],
  ["Workflow'unu beğendi", "notifMsg.likedWorkflow", false],
  ["Workflow'una yorum yaptı", "notifMsg.commentedWorkflow", false],
  ["Hazır ayarını beğendi", "notifMsg.likedPreset", false],
  ["Hazır ayarına yorum yaptı", "notifMsg.commentedPreset", false],
  ["Sonucuna yorum yaptı", "notifMsg.commentedResult", false],
  ["İsteğine yorum yaptı", "notifMsg.commentedRequest", true],
  ["Yorumuna yanıt verdi", "notifMsg.repliedComment", true],
  ["İsteğine yanıt verdi", "notifMsg.answeredRequest", false],
  ["Generatorunu düzenledi", "notifMsg.editedGenerator", false],
  ["Promptunu düzenledi", "notifMsg.editedPrompt", false],
  ["Prompt isteğini düzenledi", "notifMsg.editedRequest", false],
  ["Promptun için bir düzenleme önerdi", "notifMsg.suggestedEdit", false],
  ["Düzenleme önerini kabul etti", "notifMsg.acceptedSuggestion", false],
  ["Düzenleme önerini reddetti", "notifMsg.rejectedSuggestion", false],
  ["Promptun için bir sonuç paylaştı", "notifMsg.resultOnPrompt", false],
  ["Generatorun için bir sonuç paylaştı", "notifMsg.resultOnGenerator", false],
];

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PREVIEW_MATCHERS = PREVIEW_TEMPLATES.map(([prefix, key, hasNone]) => ({
  key,
  hasNone,
  re: new RegExp(`^${escapeRe(prefix)}(?:: "([\\s\\S]*)"|\\.)$`),
}));

function localizePreviewText(preview: string, t: TFunction): string {
  if (preview === "bir prompt paylaştı") return t("notifMsg.previewPrompt");
  if (preview === "bir prompt isteği paylaştı") return t("notifMsg.previewRequest");
  if (preview === "bir mesaj gönderdi") return t("notifMsg.previewGeneric");
  return preview;
}

/** Returns the notification sentence in the active language (Turkish messages are returned as stored). */
export function localizeNotificationMessage(message: string, language: "tr" | "en", t: TFunction): string {
  if (language === "tr") return message;

  for (const { key, hasNone, re } of PREVIEW_MATCHERS) {
    const match = re.exec(message);
    if (!match) continue;
    const preview = match[1];
    if (preview !== undefined) return t(key as TranslationKey, { preview });
    if (hasNone) return t(`${key}None` as TranslationKey);
  }

  const selected = /^Yanıtın "([\s\S]*)" isteği için seçildi!$/.exec(message);
  if (selected) return t("notifMsg.answerSelected", { preview: selected[1] });
  const unselected = /^Yanıtın "([\s\S]*)" isteği için artık seçili değil\.$/.exec(message);
  if (unselected) return t("notifMsg.answerUnselected", { preview: unselected[1] });
  const closed = /^Yanıt verdiğin "([\s\S]*)" isteği kapandı\.$/.exec(message);
  if (closed) return t("notifMsg.requestClosed", { preview: closed[1] });
  if (message === "Seni takip etmeye başladı.") return t("notifMsg.followed");
  if (message === "Yorumuna bir yanıt geldi.") return t("notifMsg.repliedCommentNone");
  if (message === "Sana bir mesaj gönderdi.") return t("notifMsg.messageNone");
  if (message === "Sana bir mesaj isteği gönderdi.") return t("notifMsg.messageRequestNone");
  const dm = /^Sana bir mesaj (isteği )?gönderdi: ([\s\S]*)$/.exec(message);
  if (dm) return t(dm[1] ? "notifMsg.messageRequest" : "notifMsg.message", { preview: localizePreviewText(dm[2], t) });
  const answered = /^İsteğine yeni bir yanıt geldi: "([\s\S]*)"$/.exec(message);
  if (answered) return t("notifMsg.answeredRequest", { preview: answered[1] });
  return message;
}
