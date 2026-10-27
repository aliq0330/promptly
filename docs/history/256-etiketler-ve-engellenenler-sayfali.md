# 256 — Keşfet → Etiketler ve Ayarlar → Engellenenler sayfalı

**Durum: uygulandı (repoda). Yalnız istemci kodu, migration YOK. Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / cihaza karşı DENENMEDİ.**

254–255'te "tam okunan" diye bırakılan listelerden, ekranda kaydırılarak gezilenler sayfalandı:
- **Keşfet → Etiketler** (`TagsSection`): `fetchTagsPage` — 30'arlı, en çok kullanılan önce (`usage_count desc, label, slug`), toplam ilk sayfada `count: exact`; sonraki sayfa kaydırınca kendiliğinden (`usePagedList` + `PagedListState` + `LoadMore`). 1516 etiketin hepsi artık tek seferde çekilip çizilmiyor.
- **Ayarlar → Engellenenler**: `fetchBlockedProfilesPage` — 30'arlı, en yeni engel önce. Eski `fetchBlockedProfiles` sınırsızdı (1000'de sessizce kesilirdi) ve koruma testinin izin listesindeydi; kaldırıldı.
- `PagedListState`'e isteğe bağlı `skeleton` verildi (satır listeleri kart iskeleti göstermesin).

## Neden DİĞERLERİ sayfalanmadı (bilinçli)
- **Dışa aktarma**: dosya, tanımı gereği HEPSİNİ içerir; sayfalamak yarım dosya demektir. Tam okunur (`fetchAllRows`), hata olursa fırlatır.
- **Engelli kimlik kümesi** (`getBlockedIds`): engellenenlerin içeriğini gizleyen süzgeçtir; eksik olursa 1001. kişinin içeriği geri görünür. Tam okunmalı (yalnız ayarlar *listesi* sayfalı).
- **Mesaj tepkileri, değişken tanımları**: tek mesajın / tek promptun küçük kümeleri; ekranda "liste" değil, hepsi birlikte gösterilen veri.
- **/tags dizini**: istemci tarafı arama ve 3 sıralama var (normalleştirilmiş etiket eşleşmesi); sunucuda aynı eşleşmeyi yazmak ayrı iş, tam okunur.
- **Taslaklar**: dört türün birleşik, zamana göre sıralı listesi + tür başına sayılar — sunucuda sayfalamak birleşim RPC'si (migration) ister. Hafif satır (id, başlık, tarih) tam okunur, çizim 50'şer + kendiliğinden.
- **Yorumlar**: ağaç yapısı (yanıtlar, derin bağlantı, vurgulu yoruma atlama, 9 hedef türü); sayfalamak ayrı ve büyük bir tasarım. `fetchAllRows` ile 1000'de kesilmez, görünüm kısa açılır.

## Doğrulama
`run-pagination` 15/15 (14: 1516 etiket → 30 satır, offset 30 kendiliğinden, 1000'lik istek yok; 15: 75 engellenen → 30'arlı), `run-feed-filters` 18/18, `npm test` 477/477, tsc/eslint/build temiz. İngilizce: yeni metin yok (mevcut anahtarlar).
