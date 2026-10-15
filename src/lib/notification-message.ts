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
  ["Paylaşımına yorum yaptı", "notifMsg.commentedPost", true],
  ["Workflow'unu beğendi", "notifMsg.likedWorkflow", false],
  ["Workflow'una yorum yaptı", "notifMsg.commentedWorkflow", false],
  ["Hazır ayarını beğendi", "notifMsg.likedPreset", false],
  ["Hazır ayarına yorum yaptı", "notifMsg.commentedPreset", false],
  ["Sonucuna yorum yaptı", "notifMsg.commentedResult", false],
  ["İsteğine yorum yaptı", "notifMsg.commentedRequest", true],
  ["Koleksiyonunu takip etmeye başladı", "notifMsg.followedCollection", false],
  ["Seni bir yorumda andı", "notifMsg.mentionedComment", false],
  ["Seni bir istekte andı", "notifMsg.mentionedRequest", false],
  ["Yorumuna yanıt verdi", "notifMsg.repliedComment", true],
  ["İsteğine yanıt verdi", "notifMsg.answeredRequest", false],
  ["Promptunu düzenledi", "notifMsg.editedPrompt", false],
  ["Prompt isteğini düzenledi", "notifMsg.editedRequest", false],
  ["Promptun için bir düzenleme önerdi", "notifMsg.suggestedEdit", false],
  ["Düzenleme önerini kabul etti", "notifMsg.acceptedSuggestion", false],
  ["Düzenleme önerini reddetti", "notifMsg.rejectedSuggestion", false],
  ["Promptun için bir sonuç paylaştı", "notifMsg.resultOnPrompt", false],
  // Grup sohbeti bildirimleri (docs/history/172-*): sunucu cümlesi sabit önek + tırnaklı grup adıdır.
  ["Katılma isteğini kabul etti", "notifMsg.groupRequestAccepted", false],
  ["Katılma isteğini reddetti", "notifMsg.groupRequestRejected", false],
  ["Davetini kabul etti", "notifMsg.groupInviteAccepted", false],
];

/** Grup adını `"…"` içinde taşıyan, öneksiz/sonekli cümleler → çeviri anahtarı (grup adı çevrilmez). */
const GROUP_NAME_TEMPLATES: [re: RegExp, key: string][] = [
  [/^Seni "([\s\S]*)" grubuna davet etti\.$/, "notifMsg.groupInvited"],
  [/^"([\s\S]*)" grubuna katılma isteği gönderdi\.$/, "notifMsg.groupNewRequest"],
  [/^"([\s\S]*)" grubuna katıldı\.$/, "notifMsg.groupMemberJoined"],
  [/^Seni "([\s\S]*)" grubundan çıkardı\.$/, "notifMsg.groupRemoved"],
  [/^"([\s\S]*)" grubunu herkese açık yaptı\.$/, "notifMsg.groupMadePublic"],
  [/^"([\s\S]*)" grubunu herkese kapattı\.$/, "notifMsg.groupMadePrivate"],
  [/^"([\s\S]*)" grubunda artık yalnızca yöneticiler mesaj gönderebilir\.$/, "notifMsg.groupPostingAdmins"],
  [/^"([\s\S]*)" grubunda artık tüm üyeler mesaj gönderebilir\.$/, "notifMsg.groupPostingMembers"],
  [/^Sana "([\s\S]*)" grubunun sahipliğini devretti\.$/, "notifMsg.groupOwnershipTransferred"],
  [/^"([\s\S]*)" grubunun yeni sahibi oldun\.$/, "notifMsg.groupNewOwner"],
  [/^"([\s\S]*)" grubunda yönetim yetkilerin güncellendi\.$/, "notifMsg.groupPermissionsChanged"],
];

/**
 * Topluluk bildirimleri (docs/history/175-*): ad (ve bazen başlık) `"…"` içinde taşınır. Kalıplar ad → `name`, ikinci alıntı → `preview`.
 * Sıra önemlidir: iki alıntılı kalıplar tek alıntılılardan önce denenir.
 */
const COMMUNITY_TEMPLATES: [re: RegExp, key: string][] = [
  [/^"([\s\S]*)" topluluğunda yeni duyuru: "([\s\S]*)"$/, "notifMsg.communityAnnouncement"],
  [/^"([\s\S]*)" topluluğunda yeni etkinlik: "([\s\S]*)"$/, "notifMsg.communityEvent"],
  [/^"([\s\S]*)" topluluğundaki "([\s\S]*)" etkinliği güncellendi\.$/, "notifMsg.communityEventUpdated"],
  [/^"([\s\S]*)" topluluğundaki "([\s\S]*)" etkinliği iptal edildi\.$/, "notifMsg.communityEventCancelled"],
  [/^"([\s\S]*)" topluluğunda "([\s\S]*)" etkinliği 24 saat içinde başlıyor\.$/, "notifMsg.communityEventReminder"],
  [/^Seni "([\s\S]*)" topluluğunun sohbetinde andı\.$/, "notifMsg.communityMention"],
  [/^"([\s\S]*)" topluluğundaki paylaşımın kaldırıldı\.$/, "notifMsg.communityPostRemoved"],
  [/^"([\s\S]*)" topluluğunda bildirdiğin içerik için karar verildi\.$/, "notifMsg.communityReportResolved"],
  [/^"([\s\S]*)" topluluğunun kuralları güncellendi\.$/, "notifMsg.communityRulesUpdated"],
  [/^"([\s\S]*)" topluluğu kapatıldı\.$/, "notifMsg.communityClosed"],
  [/^"([\s\S]*)" topluluğu yeniden açıldı\.$/, "notifMsg.communityReopened"],
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
  if (preview === "bir fotoğraf gönderdi") return t("notifMsg.previewPhoto");
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

  for (const [re, key] of GROUP_NAME_TEMPLATES) {
    const groupMatch = re.exec(message);
    if (groupMatch) return t(key as TranslationKey, { name: groupMatch[1] });
  }

  for (const [re, key] of COMMUNITY_TEMPLATES) {
    const match = re.exec(message);
    if (match) return t(key as TranslationKey, { name: match[1], preview: match[2] ?? "" });
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
