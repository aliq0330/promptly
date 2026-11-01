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
  ["Workflow'una yorum yaptı", "notifMsg.commentedWorkflow", true],
  ["Hazır ayarını beğendi", "notifMsg.likedPreset", false],
  ["Hazır ayarına yorum yaptı", "notifMsg.commentedPreset", true],
  ["Sonucuna yorum yaptı", "notifMsg.commentedResult", true],
  ["İsteğine yorum yaptı", "notifMsg.commentedRequest", true],
  ["Koleksiyonunu takip etmeye başladı", "notifMsg.followedCollection", false],
  // Alıntılar (docs/history/217-*)
  ["İçeriğini alıntıladı", "notifMsg.quotedContent", false],
  ["Alıntını beğendi", "notifMsg.likedQuote", false],
  ["Alıntına yorum yaptı", "notifMsg.commentedQuote", true],
  ["Seni bir yorumda andı", "notifMsg.mentionedComment", true],
  ["Seni bir istekte andı", "notifMsg.mentionedRequest", false],
  ["Yorumuna yanıt verdi", "notifMsg.repliedComment", true],
  ["İsteğine yanıt verdi", "notifMsg.answeredRequest", false],
  ["Promptunu düzenledi", "notifMsg.editedPrompt", false],
  ["Prompt isteğini düzenledi", "notifMsg.editedRequest", false],
  ["Promptun için bir düzenleme önerdi", "notifMsg.suggestedEdit", false],
  ["Düzenleme önerini kabul etti", "notifMsg.acceptedSuggestion", false],
  ["Düzenleme önerini reddetti", "notifMsg.rejectedSuggestion", false],
  ["Promptun için bir sonuç paylaştı", "notifMsg.resultOnPrompt", false],
  ["Sonucunun promptunu sildi", "notifMsg.resultPromptDeleted", false],
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
  [/^"([\s\S]*)" topluluğunda rolün yönetici oldu\.$/, "notifMsg.communityRoleAdmin"],
  [/^"([\s\S]*)" topluluğunda rolün moderatör oldu\.$/, "notifMsg.communityRoleModerator"],
  [/^"([\s\S]*)" topluluğunda rolün üye olarak değiştirildi\.$/, "notifMsg.communityRoleMember"],
];

const WEEKLY_PART_KEYS: Record<string, TranslationKey> = {
  kopyalama: "notifMsg.weeklyCopies",
  tepki: "notifMsg.weeklyReactions",
  yorum: "notifMsg.weeklyComments",
  kaydetme: "notifMsg.weeklySaves",
  "yeni takipçi": "notifMsg.weeklyFollowers",
};

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
  if (preview === "bir GIF gönderdi") return t("notifMsg.previewGif");
  if (preview === "bir mesaj gönderdi") return t("notifMsg.previewGeneric");
  return preview;
}

/**
 * Yalnız fotoğraf/GIF/içerik eki olan bir yorumun önizlemesi boştur (docs/history/308-*): sunucu cümlesi `Yorumuna yanıt verdi: ""` olur.
 * Boş tırnak "önizlemesiz" biçime (`… verdi.`) indirilir; böylece iki dilde de çirkin boş alıntı görünmez.
 */
export function withoutEmptyPreview(message: string): string {
  return message.endsWith(': ""') ? `${message.slice(0, -4)}.` : message;
}

/** Returns the notification sentence in the active language (Turkish messages are returned as stored). */
export function localizeNotificationMessage(rawMessage: string, language: "tr" | "en", t: TFunction): string {
  const message = withoutEmptyPreview(rawMessage);
  if (language === "tr") return message;

  // Haftalık özet (docs/history/307-*): "Haftalık özet: 12 kopyalama, 8 tepki, 3 yorum, 5 kaydetme, 2 yeni takipçi." — sayılar çevrilmez, etiketler çevrilir.
  const weekly = /^Haftalık özet: ([\s\S]+)\.$/.exec(message);
  if (weekly) {
    const parts = weekly[1].split(", ").map((part) => {
      const m = /^(\d+) (kopyalama|tepki|yorum|kaydetme|yeni takipçi)$/.exec(part);
      return m ? t(WEEKLY_PART_KEYS[m[2]], { count: m[1] }) : part;
    });
    return t("notifMsg.weeklyDigest", { parts: parts.join(", ") });
  }

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
  // Hikâyeler (docs/history/198-*)
  const storyReaction = /^Hikâyene tepki verdi: ([\s\S]+)$/.exec(message);
  if (storyReaction) return t("notifMsg.storyReaction", { preview: storyReaction[1] });
  if (message === "Hikâyendeki ankete oy verdi.") return t("notifMsg.storyPollVote");
  if (message === "Hikâyendeki soruyu yanıtladı.") return t("notifMsg.storyQuestionAnswer");
  const storyReply = /^Hikâyene yanıt verdi: ([\s\S]*)$/.exec(message);
  if (storyReply) return t("notifMsg.storyReply", { preview: localizePreviewText(storyReply[1], t) });
  // Promptly Spaces (docs/history/213-*): Space adı çevrilmez.
  const spaceInvited = /^Seni "([\s\S]*)" Space'ine davet etti\.$/.exec(message);
  if (spaceInvited) return t("notifMsg.spaceInvited", { name: spaceInvited[1] });
  const spaceJoined = /^"([\s\S]*)" Space'ine katıldı\.$/.exec(message);
  if (spaceJoined) return t("notifMsg.spaceJoined", { name: spaceJoined[1] });
  // Yaratıcı paneli kilometre taşları (docs/history/295-*): prompt başlığı çevrilmez.
  const milestone = /^Promptun "([\s\S]*)" (\d+) (kopyalamaya|tepkiye) ulaştı\.$/.exec(message);
  if (milestone) return t(milestone[3] === "kopyalamaya" ? "notifMsg.milestoneCopies" : "notifMsg.milestoneReactions", { name: milestone[1], count: milestone[2] });
  // Kişisel API anahtarı oluşturuldu (docs/history/314-*): anahtar adı çevrilmez.
  const apiToken = /^Yeni bir API anahtarı oluşturuldu: "([\s\S]*)" \((pmt_[A-Za-z0-9_-]{4})…\)\. Sen oluşturmadıysan hemen iptal et\.$/.exec(message);
  if (apiToken) return t("notifMsg.apiTokenCreated", { name: apiToken[1], prefix: apiToken[2] });
  const storyRemoved = /^"([\s\S]*)" topluluğundaki hikâyen kaldırıldı\.$/.exec(message);
  if (storyRemoved) return t("notifMsg.storyRemovedCommunity", { name: storyRemoved[1] });
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
