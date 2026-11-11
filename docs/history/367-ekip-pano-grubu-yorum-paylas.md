# 367 — Ekip panosu: pano grubu, konumlu yorumlar, Paylaş, çizim araçları (tek seferlik uygulama planı)

**Durum: UYGULANDI (PR ile birleşir; migration `20261118100000_team_board_group.sql` deploy hattıyla uygulanır — `schema_migrations`'a bak).**
Kaynak: kullanıcının onayladığı tuval mockup'ı "Ekip Panosu · Çoklu Pano" (8 sayfa: Özet, Masaüstü, Tablet, Telefon, Yorum ve Paylaş × 3, Ortak parçalar).
Kapsam: yalnız **ekip alanlarının panosu** (`spaces.team_project_id` dolu). Kişisel Space panosu, uygulama menüleri, sol menü (masaüstü/tablet) ve
telefon alt menüsü DEĞİŞMEZ; telefonda alt menü pano açıkken de görünür kalır (mockup'taki tam ekran düzeni bilerek uygulanmadı).

## 1. Pano grubu
- Pano grubu = bir kapsamın (proje geneli ya da dosya) ana alanı + ek panoları. Her pano ayrı alan (Space satırı) olduğu için öğeler karışmaz — YENİ TABLO YOK.
- `spaces.team_board_position` (sıra). `team_project_get` yanıtına `areas` anahtarı (ana + ek, sıralı, öğe sayısı, son düzenleme, bekleyen, açık yorum) eklendi; `boards` aynı kaldı.
- RPC: `team_reorder_boards`, `team_transfer_items` (taşı/kopyala; görsel dosyaları istemcide hedef klasöre kopyalanır, eşleme `p_media` ile gelir), `team_create_board` sıra yazar.
  Çoğalt = yeni pano + `team_transfer_items(copy)`. Taşıma kuralı: lider her şeyi, düzenleyici yalnız kendi taslağını/çizim öğelerini taşır (onay tasarımı: onaylı öğeyi lider siler); düzenleyici KOPYALAYABİLİR.
- Arayüz: araç çubuğunda pano adı + açılır menü (masaüstü), soldan çekmece (tablet), açılır liste (telefon); "Tüm panolara bak" genel bakışı; ⋯ menüsü (yeniden adlandır, çoğalt, yukarı/aşağı, kaldır); seçim çubuğunda "Panoya taşı/kopyala".
- Adresler: her pano `?board=<alan>&sub=board` (dosya ana alanı da). Eski `?file=&sub=board` ve `?board=` adresleri çalışır.

## 2. Tuval arayüzü (ekip modu)
Yüzen iki hap (pano/araçlar/Ekle · sunum/ayarlar/yakınlaştırma), yakınlaştırma menüsü (sayfa/açılır), Ekle menüsü (Promptly içeriği + çizim), durum hapı, mini harita, seçim çubuğu seçimin üstünde (telefonda alt çubuk),
yol çubuğu (geri · yol · avatarlar · yorum · Paylaş · rol · bilgi). Mevcut tüm özellikler (not/prompt/görsel/palet/workflow/ayar paketi, oklar, grup, hizala, kilit, çoğalt, çoklu seçim, geri al, arama, kılavuz, tam ekran) korunur.

## 3. Çizim araçları ve sunum
Yeni öğe türleri `frame`, `text`, `shape` (+ `space_items.data jsonb`): çerçeve (taşınınca içindekiler gelir), metin, dikdörtgen/oval, çizgi/ok, serbest kalem. Bu türler ONAYA TABİ DEĞİLDİR (süs/anotasyon; hep `approved`, düzenleyici düzenler/siler) ve "N öğe" sayısına girmez.
Sunum modu: çerçeveleri okuma sırasıyla tam ekran gezer (← → / Esc).

## 4. Konumlu yorumlar
`space_pin_comments` (kök = pin, yanıt = `parent_id`; konum dünya biriminde + isteğe bağlı öğe + öğe içi ofset; çözüldü). Yazma YALNIZ RPC (`pin_comment_create/update/set_resolved/delete`), okuma RLS (ekip alanını okuyan + görünmeyen taslak öğeye bağlı yorum gizli).
Görüntüleyici dahil projeyi gören herkes yorum yazar. `@kullanıcı` ve yanıt/öğe sahibi bildirimi (`system` + dedupe). Yorum modu: simge/“Yeni” → yer ya da öğe seç → yazma kutusu; panel: Açık/Çözüldü, Bu pano/Tüm panolar, yer simgesi → tuvalde göster; `?comment=` bildirim bağlantısı.

## 5. Paylaş penceresi
Paylaşım: kullanıcı adıyla davet (ekip içi arama), erişimi olanlar + roller (lider düzenler), erişim notu (yalnız proje üyeleri), pano bağlantısı kopyala. Dışa aktarma: PNG, PDF, JSON (istemcide üretilir; sunucuya yazılmaz; yalnız lider+düzenleyici).

## 6. Test
Yerel PostgreSQL `supabase/tests/team-board-group.sql`; ağ taklitli Playwright `tests/messaging-ui/run-team-board.mjs`; birim testleri (`src/lib/*.test.ts`); tsc + lint + build.

## 7. Uygulanan / denenen / denenmeyen
**Uygulanan:** hepsi (pano grubu, yüzen araç çubukları, yakınlaştırma/Ekle menüleri, çerçeve/metin/şekil/çizgi/ok/kalem, sunum, konumlu yorumlar, Paylaş + PNG/PDF/JSON). Dosyalar:
`supabase/migrations/20261118100000_team_board_group.sql`, `src/features/teams/board/*` (araç çubukları, pano değiştirici, yorumlar, Paylaş, sunum, çizim, dışa aktarma çizimi), `SpaceBoard`'a `team` kipi
(`space-board.tsx`; kişisel Space panosu `team` vermeyince AYNI davranır), saf kurallar `src/lib/team-board.ts` + `board-export.ts`, veri katmanı `src/lib/supabase/team-board.ts`, metinler `translations-team-board.ts` (`tb.*`, TR+EN),
bildirim kalıpları `notification-message.ts` (`PIN_TEMPLATES`, `notifMsg.teamPin*`).
**Adresler:** `sub=board` her alanı (proje geneli, dosya ana alanı, ek pano) `BoardMode` ile açar (`?board=<alan>&sub=board`, dosya için eski `?file=&sub=board` da çalışır); `?item=` çekmecesi liste görünümünde kalır.
**Yerleşim:** masaüstü/tablette sol menü, telefonda alt menü DEĞİŞMEDİ (pano kipinde yalnız ekip bandı/sekmeleri gizlenir; telefonda tam ekran YOK — mockup'tan bilerek ayrıldı). Yükseklik `h-[calc(100dvh-10rem-…)]` (telefon) / `md:h-[calc(100dvh-8.5rem)]`.
**Testler:** yerel PostgreSQL `team-board-group.sql` 56/56; `team-projects-v2`, `team-project-review`, `team-library-removal`, `teams-core`, `team-admin`, `team-membership`, `team-channels`, `spaces`, `space-*`, `anon-hardening`, `counter-protection`, `safety-hardening` temiz
(`contract-cleanup` 3 kontrol ÖNCEDEN de kırmızı); ağ taklitli `run-team-board` 19/19 (yeni), `run-team-projects` 34/34 (20/21 pano kipine uyarlandı), `run-team-hub` 42/42, `run-space-board-tools` 15/15, `run-spaces` 34/34,
`run-space-comments` 10/10, `run-workflow-space` 40/40, `run-space-connectors` (4b yarış koşulu düzeltildi); birim testleri (1030) , `tsc`, `eslint` (0 hata), `next build` temiz.
Bu testlerin yakaladığı gerçek hata: pano açılır panelinde ⋯ menüsü `body`'ye taşındığı için tıklaması "dışarı" sayılıp paneli kapatıyordu → `BoardPopover` artık `[role=menu]` tıklamasını yok sayar.
**Denenmeyen:** gerçek Supabase'e, gerçek Realtime'a ve gerçek telefon/tablet/iOS Safari'ye KARŞI DENENMEDİ; PNG/PDF çıktısı tarayıcıda (canvas) üretilir — dosya içeriği gerçek tarayıcıda gözle kontrol edilmedi (JSON indirme taklitli testte doğrulandı);
yorum yoklaması 45 sn (Realtime yok); büyük panolarda dışa aktarma 4096 px ile sınırlı; çerçeve içindekileri birlikte taşıma yalnız istemcide; Gizlilik/Koşullar'ın "Ekipler" bölümü yorum/dışa aktarma için güncellenmedi (ürün/hukuk kararı).
**Bilinçli sınırlar:** çizim öğeleri (çerçeve/metin/şekil) onaya tabi değildir ve "N öğe" sayısına girmez; pano taşırken görsel dosyaları istemcide hedef klasöre kopyalanır (Storage politikası yol bekler); düzenleyici yalnız KENDİ taslağını taşır, onaylıyı lider taşır (kopyalayabilir).
