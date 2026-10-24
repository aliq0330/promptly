/**
 * Ana Sayfa / Keşfet süzgeç düzeninin TR/EN metinleri (docs/history/221-*). `translations.ts` bu nesneyi açar (`...filterTranslations`),
 * böylece `TranslationKey` tipi ve `t()` bu anahtarları da tanır. Kullanıcı içeriği (kişi adı, etiket, araç adı) çevrilmez.
 */
export const filterTranslations = {
  // ---- Ana Sayfa: "takip ettiklerim" süzgeçleri (geçici görünüm; takibin kendisi kalıcı tercihtir) ----
  "feed.filterFollowedHint": {
    tr: "Takip ettiklerinden seç; seçimin yalnızca bu görünümü daraltır, takibini değiştirmez. Kişi ve araçlardan biri yeter, seçtiğin etiketlerin hepsi gerekir.",
    en: "Pick from what you follow. This only narrows this view and never changes who or what you follow. Any one of the people or tools matches; all of the tags you pick are required.",
  },
  "feed.filterPeople": { tr: "Kişiler", en: "People" },
  "feed.filterTools": { tr: "AI araçları", en: "AI tools" },
  "feed.filterPeopleSearch": { tr: "Takip ettiklerinde ara", en: "Search the people you follow" },
  "feed.filterPeopleNone": { tr: "Henüz kimseyi takip etmiyorsun.", en: "You don't follow anyone yet." },
  "feed.filterPeopleNoMatch": { tr: "Eşleşen kişi yok.", en: "No matching person." },
  "feed.filterTagsNone": { tr: "Henüz takip ettiğin bir etiket yok.", en: "You don't follow any tag yet." },
  "feed.filterToolsNone": { tr: "Henüz takip ettiğin bir AI aracı yok.", en: "You don't follow any AI tool yet." },
  "feed.filterPeopleLoading": { tr: "Takip ettiklerin yükleniyor…", en: "Loading the people you follow…" },
  "feed.activeFiltersAria": { tr: "Etkin filtreler", en: "Active filters" },
  "feed.removeFilter": { tr: "{{name}} filtresini kaldır", en: "Remove the {{name}} filter" },
  "feed.clearFilters": { tr: "Filtreleri temizle", en: "Clear filters" },
  "feed.filteredEmptyTitle": { tr: "Bu filtrelere uyan paylaşım yok", en: "No posts match these filters" },
  "feed.filteredEmptyDescription": {
    tr: "Seçtiğin kişi, etiket ve araçların hepsine uyan bir paylaşım bulunamadı. Bir filtreyi kaldırmayı dene.",
    en: "No post matches all the people, tags and tools you picked. Try removing a filter.",
  },

  // ---- Keşfet: sıralama + bölümler ----
  "discover.sortRecommended": { tr: "Önerilen", en: "Recommended" },
  "discover.sortPopular": { tr: "Popüler", en: "Popular" },
  "discover.sectionTools": { tr: "AI Araçları", en: "AI tools" },
  "discover.sectionTags": { tr: "Etiketler", en: "Tags" },
  "discover.sectionCommunities": { tr: "Topluluklar", en: "Communities" },
  "discover.searchIn": { tr: "{{scope}} içinde ara", en: "Search in {{scope}}" },
  "discover.toolFilter": { tr: "AI aracı", en: "AI tool" },
  "discover.toolFilterAny": { tr: "Tüm araçlar", en: "All tools" },
  "discover.toolsIntro": {
    tr: "Bir aracın gönderilerini gör, takip ederek Ana Sayfa'da süzgeç olarak kullan.",
    en: "See a tool's posts, and follow it to use it as a filter on Home.",
  },
  "discover.toolsNoMatch": { tr: "Eşleşen araç yok.", en: "No matching tool." },
  "discover.toolPosts": { tr: "{{count}} gönderi", en: "{{count}} posts" },

  // ---- Sana özel: ayar penceresi, ilk kullanım bandı, yenile (docs/history/222-*, 227-*) ----
  "forYou.refresh": { tr: "Yenile", en: "Refresh" },
  "forYou.settings": { tr: "Sana özel'i ayarla", en: "Tune For you" },
  "forYou.settingsTitle": { tr: "Sana özel'i ayarla", en: "Tune For you" },
  "forYou.settingsHow": {
    tr: "Sana özel; takip ettiğin kişilerden, etiketlerden ve AI araçlarından, ilgi alanlarından, beğendiğin gönderilere benzeyenlerden, kalite ve tazelikten oluşur. Takip ettiğin kişilerin her paylaşımını kronolojik görmek için Takip Ettiklerim'e bak.",
    en: "For you is built from the people, tags and AI tools you follow, your interests, what is like the posts you liked, quality and freshness. To see every post from the people you follow in time order, open Following.",
  },
  "forYou.setupBanner": { tr: "Sana özel'i ayarla · ilgi alanlarını seç", en: "Tune For you · pick your interests" },
} as const;
