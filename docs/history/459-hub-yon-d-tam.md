# 459 — Hub: Yön D "Merkez" tam uygulama (tablo, özet şeridi, yol + sekmeler bantta)

**Karar (kullanıcı):** 458'deki hafif uygulamanın ardından "D'yi komple uygula, eksiksiz olsun". Mockup: sol/üst menü mevcut açık kabuk (siyah YOK), içerik çizgili tablo + paneller, aynı ekran masaüstü/tablet/telefonda. Yalnız istemci; migration YOK; yeni metinler iki dilde (`translations-hub.ts`, `hub.col.* / hub.stat.* / hub.view.* / hub.crumbs`).

## Ortak parçalar — `features/hub/hub-kit.tsx`
- `HubStatStrip` (tek çerçevede 3–4 kutu; telefonda 2×2), `HubTable` / `HubTableBody` / `HubRow` (üç kırılım için sütun şablonu: `cols` · `colsMd` · `colsSm`; hücreler `HUB_COL_LG` ya da `HUB_COL_MD` ile saklanır — saklanan hücre sayısı şablondaki sütun sayısına uymalı; **son/eylem sütunu `auto` DEĞİL sabit genişlik** olmalı, yoksa sütunlar satırdan satıra kayar), satırın adı `h3 > Link` (`HUB_ROW_LINK_CLASS` satırı kaplar, düğmeler `relative z-10`).
- `useHubView(alan)` / `HubViewToggle`: Tablo ↔ Kart tercihi, alan başına cihazda (`promptly-hub-view-<alan>`), `useSyncExternalStore` ile tüm bileşenlerde ortak. Varsayılan Tablo.
- `HubDetailBand`: `crumbs` (Spaces › Ad; telefonda gizli) ve `tabs` (sekmeler bandın içinde, ince çizgiyle ayrılır). `backdrop` kalktı. 458'deki `HubHeader` (ana sayfa bandı + sekmeler) korunur.

## Ekranlar
- **Spaces:** liste = tablo (Ad · Tür · Görünürlük · Üyeler · Güncelleme · Sabitle/⋮; varsayılan; Izgara anahtarı kalır, eski `grid` tercihi korunur) + özet şeridi (yüklenen Space'lerden; sonraki sayfa varsa sayılar `+`). Detay: yol + sekmeler bantta (telefonda "compactPhone" alt sayfalarında sekmeler yine ayrı).
- **Topluluklar:** Topluluklarım/Yönettiklerim = `CommunityRow` tablosu (Topluluk · Rolüm · Üye · Çevrimiçi · Yeni · Son etkinlik · Katıldın ▼ + ⋮), kontrol satırında Tablo/Kart anahtarı. Keşfet/Tüm topluluklar kart olarak kalır. Detay: yol + sekmeler bantta; Akış'ta özet şeridi (üye · çevrimiçi · gönderi).
- **Ekipler:** Ekiplerim = `TeamRow` tablosu (Ekip · Rol · Üye · Proje · Onay · Sohbet · Son etkinlik), anahtar; detay: yol + sekmeler bantta, Genel bakış'ta özet şeridi (proje · onay · üye · okunmamış; konuk yalnız proje + üye).
- **Telefon:** tablo başlığı gizli, satır iki sütun; eksik bilgi adın altına iner — **metin tek yerde durmalı** (CSS ile gizlenen kopya Playwright `getByText` katı kipini ve testleri bozar): bu yüzden telefon özeti `useMediaQuery` ile yalnız telefonda çizilir.

## Testler
Kart varsayılanı Tablo olduğu için `run-community-shelf` 2 numaralı senaryo önce satırı doğrular, sonra Kart anahtarıyla 16:9 kapağı sınar. Doğrulama: `npx tsc`, `npx eslint`, `npm test` (1542), `next build --webpack`, ağ taklitli Playwright paketleri (`run-spaces`, `run-communities`, `run-community-home`, `run-community-shelf`, `run-team-hub`, `run-space-comments`, `run-profile-collections`, `run-focus-feed`) + ekran görüntüleri (masaüstü/tablet/telefon). Bu ortamda önceden de kırmızı olanlar (değişiklikle ilgisiz, temiz HEAD'de aynı): `run-spaces` 10 senaryo (taklit `list_spaces` boş döner), `run-team-hub` 1, `run-community-home` 2 + 4, `run-communities` 13b, `run-space-comments` 8, `run-profile-collections` 7, `run-focus-feed` 27. Gerçek Supabase/cihaza karşı DENENMEDİ.
