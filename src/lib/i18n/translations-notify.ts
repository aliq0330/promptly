/**
 * Bildirim standardı (docs/history/484-*): Topluluk ve Ekip'te aynı yerde aynı sözcük. `translations.ts` bu nesneyi açar.
 * Seçenek sözlüğü: sohbet düzeyi = Tüm mesajlar · Bahsetmeler · Sessiz (+ Varsayılan); merkez = Tümü · Yalnız önemli · Sessiz.
 */
export const notifyTranslations = {
  "notify.heading": { tr: "Bildirimler", en: "Notifications" },
  "notify.level.default": { tr: "Varsayılan", en: "Default" },
  "notify.level.all": { tr: "Tüm mesajlar", en: "All messages" },
  "notify.level.mentions": { tr: "Bahsetmeler", en: "Mentions" },
  "notify.level.none": { tr: "Sessiz", en: "Muted" },
  "notify.hub.all": { tr: "Tümü", en: "All" },
  "notify.default.channel": { tr: "Kanalın varsayılanı: {{level}}", en: "Channel default: {{level}}" },
  "notify.room.all": { tr: "Yeni mesajlar okunmamış sayısında görünür.", en: "New messages show in the unread count." },
  "notify.room.none": { tr: "Bu odanın okunmamış sayısı ve bildirimi susar.", en: "This room's unread count and notifications go quiet." },
  "notify.source.default": { tr: "Varsayılan", en: "Default" },
  "notify.source.own": { tr: "Kendi ayarın", en: "Your setting" },
  "notify.section.community": { tr: "Topluluk bildirimleri", en: "Community notifications" },
  "notify.section.team": { tr: "Ekip bildirimleri", en: "Team notifications" },
  "notify.section.chats": { tr: "Sohbet mesajları", en: "Chat messages" },
  "notify.section.rooms": { tr: "Odalar", en: "Rooms" },
  "notify.chats.community": { tr: "Tüm topluluk sohbetleri", en: "All community chats" },
  "notify.chats.communityHint": { tr: "«Sessiz» yeni mesaj bildirimini ve okunmamış sayısını susturur. Odalar kendi ayarını seçebilir.", en: "“Muted” silences new-message notifications and the unread count. Rooms can pick their own setting." },
  "notify.always.label": { tr: "Her zaman gelenler:", en: "Always delivered:" },
  "notify.always.community": { tr: "Sahiplik devri ve rol değişikliği bildirimleri hiçbir sessizlikle susmaz.", en: "Ownership transfers and role changes are never silenced." },
  "notify.picker.room": { tr: "Bu odadaki bildirimler", en: "Notifications in this room" },
  "notify.picker.project": { tr: "Bu projedeki bildirimler", en: "Notifications in this project" },
  "notify.picker.projectNone": { tr: "Projenin hiçbir kanalından bildirim gelmez.", en: "No notifications from any channel of the project." },
  "notify.picker.projectAll": { tr: "Proje sohbeti ve onay bildirimleri gelir.", en: "Project chat and approval notifications arrive." },
} as const;
