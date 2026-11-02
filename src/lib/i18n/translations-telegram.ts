/**
 * Telegram botu (Ayarlar → Geliştirici → Telegram; docs/history/323-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar.
 * Telegram kullanıcı adı/adı kullanıcı verisidir, çevrilmez. Botun KENDİ mesajları (Edge Function) `lib/public-api/telegram/messages.ts`'tedir.
 */
export const telegramTranslations = {
  "tg.title": { tr: "Telegram botu", en: "Telegram bot" },
  "tg.hint": {
    tr: "Promptları Telegram'da ara, kendi promptlarını gör, özel taslak ekle ve bildirim al. Bot hesabına tek kullanımlık bir kodla bağlanır; yayınlama ve silme yalnızca sitede yapılır.",
    en: "Search prompts in Telegram, see your own prompts, add private drafts and get notifications. The bot links to your account with a one-time code; publishing and deleting happen on the site only.",
  },
  "tg.loadFailed": { tr: "Telegram bağlantıları yüklenemedi.", en: "Couldn't load your Telegram links." },
  "tg.empty": { tr: "Henüz bağlı bir Telegram hesabı yok.", en: "No Telegram account is linked yet." },
  "tg.linkedBadge": { tr: "Bağlı", en: "Linked" },
  "tg.weekly": { tr: "Haftalık özet", en: "Weekly summary" },
  "tg.weeklyHint": { tr: "Her hafta promptlarının kopyalanma, tepki ve yorum sayıları.", en: "Each week: how often your prompts were copied, reacted to and commented on." },
  "tg.activity": { tr: "Etkinlik bildirimleri", en: "Activity notifications" },
  "tg.activityHint": {
    tr: "Yorum, yanıt, alıntı ve düzenleme önerileri. Bildirimde başkalarının yorum önizlemesi de Telegram'dan geçer.",
    en: "Comments, replies, quotes and edit suggestions. A notification can include a preview of someone else's comment, which passes through Telegram.",
  },
  "tg.remove": { tr: "Bağlantıyı kaldır", en: "Remove link" },
  "tg.removeConfirm": { tr: "Bu Telegram hesabının Promptly'ye erişimi hemen kapanır. Emin misin?", en: "This Telegram account loses access to Promptly immediately. Are you sure?" },
  "tg.removeYes": { tr: "Evet, kaldır", en: "Yes, remove" },
  "tg.removeFailed": { tr: "Bağlantı kaldırılamadı. Tekrar dene.", en: "Couldn't remove the link. Try again." },
  "tg.saveFailed": { tr: "Tercih kaydedilemedi. Tekrar dene.", en: "Couldn't save the preference. Try again." },
  "tg.connectTitle": { tr: "Yeni Telegram hesabı bağla", en: "Link a new Telegram account" },
  "tg.limit": { tr: "En çok 3 Telegram hesabı bağlanabilir. Yenisini bağlamak için önce birini kaldır.", en: "You can link at most 3 Telegram accounts. Remove one to link another." },
  "tg.writeLabel": { tr: "Özel taslak eklemesine ve düzenlemesine de izin ver", en: "Also allow adding and editing private drafts" },
  "tg.writeHint": { tr: "Kapalıyken bot yalnızca okur. Yayınlama ve silme hiçbir durumda yoktur.", en: "When off, the bot only reads. Publishing and deleting are never possible." },
  "tg.createCode": { tr: "Bağlama kodu oluştur", en: "Create a link code" },
  "tg.creating": { tr: "Oluşturuluyor…", en: "Creating…" },
  "tg.codeTitle": { tr: "Bağlama kodun", en: "Your link code" },
  "tg.codeValid": { tr: "10 dakika geçerli ve yalnızca bir kez kullanılır. Kimseyle paylaşma.", en: "Valid for 10 minutes and works once. Don't share it with anyone." },
  "tg.step1": { tr: "Telegram'da {{bot}} botunu aç", en: "Open the {{bot}} bot in Telegram" },
  "tg.step1NoBot": { tr: "Telegram'da Promptly botunu aç", en: "Open the Promptly bot in Telegram" },
  "tg.openBot": { tr: "Telegram'da aç", en: "Open in Telegram" },
  "tg.step2": { tr: "Başlat'a bas — ya da şunu yaz:", en: "Press Start — or send:" },
  "tg.step3": { tr: "Bot hangi hesaba bağlanacağını gösterir; «Bağla»ya bas.", en: "The bot shows which account it will link to; press “Link”." },
  "tg.waiting": { tr: "Bağlanması bekleniyor…", en: "Waiting for the link…" },
  "tg.justLinked": { tr: "Telegram bağlandı.", en: "Telegram linked." },
  "tg.codeExpired": { tr: "Kodun süresi doldu. Yeni bir kod oluştur.", en: "The code has expired. Create a new one." },
  "tg.copyCode": { tr: "Kodu kopyala", en: "Copy code" },
  "tg.privacy": {
    tr: "Telegram kullanıcı adın, sohbet kimliğin ve bildirim önizlemeleri Telegram sunucularından geçer. Ayrıntı:",
    en: "Your Telegram username, chat id and notification previews pass through Telegram's servers. Details:",
  },
  "tg.privacyLink": { tr: "Gizlilik Politikası", en: "Privacy Policy" },
  "error.telegramLinkLimit": { tr: "Bu hesapta en çok 3 Telegram bağlantısı olabilir. Önce birini kaldır.", en: "An account can have at most 3 Telegram links. Remove one first." },
} as const;
