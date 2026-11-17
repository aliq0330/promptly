/**
 * İlk giriş kurulumu (docs/history/424-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...firstRunTranslations`).
 * Konu adları burada DEĞİL: `interest.*` anahtarlarıdır (profilin ilgi alanlarıyla aynı).
 */
export const firstRunTranslations = {
  "firstRun.stepLabel": { tr: "Adım {{current}} / {{total}}", en: "Step {{current}} of {{total}}" },
  "firstRun.topicsTitle": { tr: "Bir veya birkaç konu seçin", en: "Pick a few topics" },
  "firstRun.topicsSubtitle": { tr: "Böylece seveceğiniz yaratıcı çalışmaları önerebiliriz.", en: "So we can recommend creative work you'll love." },
  "firstRun.followed": { tr: "Takip Edildi", en: "Following" },
  "firstRun.needMin": { tr: "Devam etmek için en az {{count}} kategoriyi takip edin", en: "Follow at least {{count}} topics to continue" },
  "firstRun.needMore": { tr: "Devam etmek için {{count}} kategori daha takip edin", en: "Follow {{count}} more to continue" },
  "firstRun.good": { tr: "İyi iş çıkardınız!", en: "Nice work!" },
  "firstRun.next": { tr: "İleri", en: "Next" },
  "firstRun.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "firstRun.saveFailed": { tr: "Seçimlerin kaydedilemedi. Bağlantını kontrol edip tekrar dene.", en: "Couldn't save your picks. Check your connection and try again." },
  "firstRun.peopleTitle": { tr: "Kimleri takip edelim?", en: "Who should we follow?" },
  "firstRun.peopleSubtitle": {
    tr: "Öne çıkan yaratıcılar. En az {{count}} kişiyi takip edersen akışın boş kalmaz; istersen atlayabilirsin.",
    en: "Standout creators. Follow at least {{count}} so your feed never looks empty, or skip this step.",
  },
  "firstRun.peopleLoadFailed": { tr: "Öneriler yüklenemedi.", en: "Couldn't load suggestions." },
  "firstRun.peopleEmpty": { tr: "Şu an önerecek kimse yok. Akışına Keşfet'ten devam edebilirsin.", en: "No suggestions right now. You can keep going from Discover." },
  "firstRun.followProgress": { tr: "{{count}} / {{total}} kişi takipte", en: "Following {{count}} of {{total}}" },
  "firstRun.followDone": { tr: "{{count}} kişiyi takip ediyorsun, hazırsın", en: "You follow {{count}} people. You're all set." },
  "firstRun.finish": { tr: "Bitir ve akışımı gör", en: "Finish and see my feed" },
  "firstRun.skipPeople": { tr: "Şimdilik geç", en: "Skip for now" },
  "firstRun.buildingTitle": { tr: "Özel akışın oluşturuluyor", en: "Building your feed" },
  "firstRun.building": { tr: "{{topic}} gönderileri toplanıyor…", en: "Gathering {{topic}} posts…" },
  "firstRun.buildingPopular": { tr: "Popüler", en: "Popular" },
} as const;
