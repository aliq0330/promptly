# 281 — Sonuç kartı sadeleşti, İstatistik penceresi yenilendi

Kullanıcı iki isteği mockup'larla onayladı ("Mockup'ların aynısı, koda geç").

## Sonuç kartı (`features/prompts/result-card.tsx`)
- Kart yalnız görsel: sol altta yaratıcı (avatar + `@kullanıcı`), sağ altta tepki düğmesi. Araç rozeti, "N değişiklik" rozeti ve zaman yazısı kalktı (sonucun kendi sayfasında duruyor).
- Tepki düğmesi aynı `LikeButton` / `ReactionButton` (altı tepkilik seçici), yeni `tone="overlay"`: görselin üstünde yarı saydam koyu hap (`overlayActionClassName`); 0 tepkide sayı yazılmaz. Alt kenarda okunurluk için hafif koyu kuşak.
- Video/ses sonucu: ortadaki oynat düğmesi yerine sağ üst köşede küçük tür rozeti (`MediaBadge`); metin sonucunda yazı alt şeride taşmaz.
- Kullanıcı sonuçları ızgarası `sm`'den itibaren 3 sütun (eskiden `xl`'de 6: kartlar ~105 px'e düşüyor, ad görünmüyordu).

## İstatistik penceresi (`features/statistics/*`)
- Özet kutuları = sekmeler (Tepki · Yorum · Kaydetme; Kopyalama kutusu sekme değil, kesik çizgili). Eskiden hem kutular hem sekmeler aynı bilgiyi iki kez veriyordu. Sekmelerin erişilebilir adı hâlâ "Tepki verenler N" / "Yorum Yapanlar N" / "Kaydedenler N".
- Tepki sekmesinde tepki dağılımı: renkli çubuk + emojili sayılar (`useReactionBreakdown`, yeni sorgu yok).
- Tepki sekmesi artık `content_engagers` yerine "Tepkiler" sayfasının sorgusunu (`fetchReactorsPage`) kullanır: her satırda kişinin verdiği tepki avatarın köşesinde rozet olur. Yorum ve Kaydetme sekmeleri `content_engagers`'ta kaldı. `ContentEngager.reaction` + `EngagersCursor.offset` eklendi.
- Yorum satırı sohbet balonu gibi; satırlar daha ferah; kapat düğmesi yuvarlak, başlık Bricolage.

## Yapılmayanlar / sınırlar
- Mockup'taki pencere alt başlığı (içeriğin adı) yok: `StatisticsTarget` içerik başlığı taşımıyor, çağıranlar tek tek genişletilmeli.
- Sonuç kartı kare kalır (özet satırı görsel boyutu taşımıyor; mockup'taki değişken oranlar için sorguya genişlik/yükseklik eklenmeli).
- İstatistikte "son 7 gün" grafiği yok (zaman serisi verisi yok).
- `result.modificationBadge` çevirisi artık kullanılmıyor (silinmedi).
- Yalnız istemci kodu, migration yok. Yeni çeviri anahtarı yok. Gerçek Supabase'e / telefona karşı denenmedi.

Test: yeni `tests/messaging-ui/run-result-stats.mjs` 5/5; `run-detail-pages`, `run-community-posts` (İstatistik senaryosu Kaydedenler sekmesine tıklayarak `content_engagers` çağrısını doğrular), `run-reactions`, `run-quotes`, `run-space-posts`, `run-spaces` geçti.
