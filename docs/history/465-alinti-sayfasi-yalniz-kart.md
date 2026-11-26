# 465 — Alıntı sayfası: yalnız alıntılanan gönderinin kartı

`/quotes/local?id=` artık alıntılanan içeriğin tam detay sayfasını (bant, prompt metni, sonuçlar, yan sütun) gömmez. Yeni düzen (yukarıdan aşağı):

1. **Alıntı şeridi:** alıntılayan, "Alıntı" rozeti, zaman, ⋮ (sil / şikâyet), not.
2. **Eylem satırı notun HEMEN altında** (`DetailActionBar`): beğeni/tepki · yorum · İstatistik · Paylaş + "N kişi tepki verdi". Sayfa aşağı kayınca satır alt menünün üstüne sabitlenir (`data-detail-dock`, mevcut mekanizma).
3. **Alıntılanan gönderinin kartı** (`QuotedContentCard`, akıştaki normal görsel kart): alt satırda içeriğin sahibi + "Orijinal içeriği aç" (`data-open-original`). İçerik gizlenmişse bağlantısız "artık görünmüyor" yüzeyi. Skill alıntısı da aynı kartla çizilir.
4. **Alıntının yorumları** (`DetailComments` + `CommentSection quoteId`).

Beğeni/yorum/istatistik/paylaş ALINTININ kendisine aittir; orijinalin sayaçları karışmaz. Ana Sayfa/Keşfet alıntı kartı (`QuoteCard`) davranış olarak değişmedi (not durur); kartın görseli/etiketi artık `quoted-parts.tsx`'ten gelir ve iki yüzeyde ortaktır.

- `quote-scope.tsx` / `Engage*` içindeki `useQuoteScope` dalları artık sayfa tarafından kullanılmıyor (ölü; ayrı temizlikte kaldırılabilir).
- Kalkan çeviri anahtarları: `quotes.page.scopeHelp`, `quotes.page.commentsTitle`, `quotes.page.commentsHelp`. Yeni anahtar yok (İngilizce karşılık gerekmedi).
- Testler: `run-quotes.mjs` 2, 12 güncellendi, 13 (sabitlenen eylem satırı) eklendi; `run-skills-social.mjs` 19 güncellendi. Ağ taklitli; gerçek Supabase'e karşı denenmedi. `run-skills-social.mjs`'in 12 başka senaryosu bu değişiklikten önce de (main'de) kırmızıydı, dokunulmadı.
