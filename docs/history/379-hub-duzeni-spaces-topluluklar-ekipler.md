# 379 — Hub düzeni: Spaces, Topluluklar ve Ekipler tek iskelette

**Karar (kullanıcı):** Spaces, Topluluklar ve Ekipler'in ana sayfaları ile iç sayfaları aynı düzeni ve aynı kart ölçüsünü kullanır; masaüstü, tablet ve telefon için ayrı tasarım. Mockup onaylandı, hiçbir özellik çıkarılmadı. Yalnız istemci; migration YOK.

## Ortak parçalar — `src/features/hub/hub-kit.tsx`
- **Ana sayfa:** `HubBand` (simge karosu · başlık · tek satır açıklama · tek birincil düğme `HubCreateButton`) → altı çizgili `Tabs` → `HubControlRow` (sayı + arama/filtre/görünüm simgeleri) → `HubAttentionStrip` (davet/bekleyen iş) → `HubGrid` içinde `HubCard`'lar.
- **İç sayfa:** `HubDetailBand` (kapak · geri · tür etiketleri · başlık · alt bilgi · eylemler) → aynı `Tabs` → `HubDetailLayout` (içerik + `xl`+ 300 px "Hakkında" sütunu).
- **Kart (`HubCard`):** 16:9 kapak + SABİT 6,5 rem gövde (başlık · tek satır özet · alt satır). Sol üst tür etiketi, sağ üst köşe (Sabitle/⋮), kapağın altında rozet, sağ altta durum/eylem. Üç alanda aynı ölçü; genişlik yalnız sütun sayısına göre değişir.
- **Izgara:** telefonda 1, tablette (`sm`) 2, geniş masaüstünde (`xl`) 3 sütun; 12/16/20 px aralık. Sayfa kenar boşluğu 12/24/32 px (`HUB_PAGE_CLASS`).
- `Tabs` (`components/ui/tabs.tsx`) link sekmesi alır (`item.href`, `item.attrs`): ekip sayfası aynı bileşeni kullanır.

## Alanlar
- **Spaces:** `SpacesHome` bant/sekme/kontrol/davet şeridi/ızgara; `SpaceCard` ızgara görünümü `HubCard` (kapak, tür etiketi, Sabitle, ⋮, palet çizgisi, sahip · son düzenleme, sayılar, görünürlük); liste görünümü aynı. `SpacePage` bandı `HubDetailBand` (panoyu aç · kayıt durumu · paylaş · ⋮ bandın içinde).
- **Topluluklar:** ilk sekme **Topluluklarım** (varsayılan, `/communities`), Gönderiler `?tab=posts`. Eski "Topluluklarım" rafı ve sağ yardımcı sütun kalktı: kartlar ızgarada ("N yeni" rozeti kapağın altında), sayılar sekme sayaçlarında (Yönettiklerim, Davet ve başvurular), "Tüm topluluklar" kontrol satırındaki pusula simgesi. `CommunityCard` = `HubCard` (kategori etiketi, görünürlük/rol/kapalı rozetleri, tek üyelik düğmesi, üye · aktif · gönderi · etkinlik · okunmamış özeti); açıklama ad bağlantısının ipucundadır. Telefon kök listesi (`CommunityPhoneHome`) kalktı: telefonda da bant + kaydırmalı sekmeler.
- **Ekipler:** sekmeler Ekiplerim · Senden bekleyenler · Davetler (son ikisi yalnız bekleyen varken, dikkat şeridi sekmeye götürür); süzgeç (Tümü/Yönettiklerim) + arama kontrol satırında; `TeamCard` = `HubCard` (telefon kartı birleşti: bekleyen onay rozeti, okunmamış sohbet bağlantısı, rol rozeti, üye yüzleri). `TeamBand` = `HubDetailBand`, `TeamTabs` = link sekmeli ortak `Tabs`.

## Test notları
- Birim: `community-home.test.ts` (varsayılan görünüm Topluluklarım).
- Ağ taklitli Playwright: ilgili `run-*.mjs` senaryoları yeni düzene göre güncellendi (bkz. commit).
- Gerçek Supabase/cihaz DENENMEDİ.
- Yerel derleme: bu ortamda `next build` Turbopack yazı tipi indirmesinde düşer; `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx next build --webpack` ile derlenir. Playwright için `node_modules/playwright` global kuruluma symlink edilir.

İngilizce karşılıklar eklendi (`translations-hub.ts`, `hub.*`).
