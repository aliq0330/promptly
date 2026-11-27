# 9.480 — Gönderi ⋮ menüsü yeniden düzeni, Alıntıla eylem çubuğunda, Paylaş penceresi, Profilde sabitle

Kullanıcı kart ⋮ menüsü, detay (local) sayfası ⋮ menüsü ve Paylaş penceresinin içeriğini bir mockup üzerinde işaretleyerek netleştirdi; bu iş onu uygular.
**Kural:** Paylaş = içeriği dışarı yaymak (bağlantı, kişiler, hikâye); ⋮ = yönetim ve kişisel araçlar. Bir eylemin yeri tek kaynakta: `src/lib/post-menu.ts`.

## Menü satırları (`lib/post-menu.ts`, birim testli)

| Grup | Kart ⋮ | Detay ⋮ |
|---|---|---|
| Gönder | Paylaş… | — (eylem çubuğunda Paylaş var) |
| Kaydet | Space'e ekle · Koleksiyona ekle · Dışa aktar (yalnız prompt) | aynı |
| İçerik | İstatistik görüntüle · (Düzenle · Kopyasını oluştur · Profilde sabitle — kendi) · Düzenleme öner (başkasının prompt'u) | aynı + İlişki haritasını aç (ekstra) |
| Kişi | Takip et / Takipten çık · İlgimi çekiyor · İlgimi çekmiyor (başkasının) | — |
| Güvenlik | (Bildirimleri duraklat / sürdür — kendi) · Sessize al / Sesi aç · Engelle / Engeli kaldır · Şikayet et (başkasının) · (Sil — kendi) | aynı |

- **Bağlantıyı kopyala ⋮'de YOK** (Paylaş penceresinde). Dışa aktar karttan kalkmadı: kullanıcının işaretine göre hem kartta hem detayda var.
- **Renk:** olumsuz satırlar kırmızı (Sessize al, Engelle, Şikayet et, İlgimi çekmiyor, Takipten çık, Sil), "İlgimi çekiyor" yeşil (`text-success`), öbürleri nötr. Zıt etiketler duruma göre değişir.
- **Görünüm:** yatay üç nokta (`Ellipsis`); detay sayfasında kenarlıklı 40 px düğme + 20 px ikon (kartta sessiz 36 px). `md`+'da düğmenin altında açılır panel, **telefonda alttan açılan kart** (`Modal`; satırlar 48 px). Gruplar arasında ince ayırıcı. Kabuk `components/ui/action-menu.tsx` (`ActionMenu` + `ActionMenuRows`).
- **Tek menü, tek bileşen:** `PostMenu` artık `target` nesnesi ister (`{kind, prompt|request|workflow|preset|result|skill}`: Paylaş, İstatistik, takip… için kimlik + sayaç + yazar birlikte gerekir) ve `surface="card"|"detail"` alır. Skill de aynı menüyü kullanır (`SkillMenu` ve kartın eski `DropdownMenu`'sü kaldırıldı; Skill'in "Sil"i sayfanın kendi onayına `onDelete` ile bağlanır).
- **Durum kancaları yalnız menü AÇIKKEN çalışır** (takip, engel, sessize alma, ilgi, sabit; `useFollowState`/`useBlockState` `enabled` seçeneği aldı): kapalı kartlar hiçbir istek atmaz.
- **Ekstralar** (`PostMenuExtras`) `group`/`order`/`tone` taşır: İlişki haritası "içerik" grubunda İstatistik'ten sonra, Sana özel/Keşfet "İlgimi çekiyor/çekmiyor" "kişi" grubunda (menü ikinci kez eklemez), topluluk işleri "güvenlik" grubunda. `PostMenuOptions interest={false}` **Takip Ettiklerin** etkinlik akışında ilgi satırlarını kapalı tutar (451-* kararı korunur).
- **Başvuru gönderisi / alıntı sayfası** (`PostScope`/`QuoteScope`): yerel satır yok, yalnız ekstralar (eskisi gibi). Topluluğa özgü içerikte Paylaş/Space/Koleksiyon/Dışa aktar/Sabitle yok.
- **Bildirimleri duraklat** yeni bir veritabanı nesnesi gerektirmedi: mevcut `notification_mutes` (`kind='content'`, hedef = içeriğin `hl=`'siz adresi; `set_notification_mute`) kullanılır — bildirim sessize alma TEK BEFORE INSERT tetikleyicisinde olduğundan duraklatılan içeriğin bildirimi hiç yazılmaz.
- **Dışa aktar** yalnız prompt için (istek/ayar paketi/workflow/Skill dışa aktarma biçimleri "kendi tüm içeriklerim" akışıdır, tek içerik hâli yok).

## Eylem çubuğu: İstatistik → Alıntıla

Detay sayfalarının (prompt, istek, workflow, ayar paketi, Skill) eylem çubuğunun sağ başındaki **İstatistik** düğmesinin yerine **Alıntıla** geldi (`EngageQuoteSlot` → `QuoteTriggerButton`, `features/quotes/`); İstatistik ⋮ menülerinde. Başvuru gönderisi / alıntı sayfasında gönderi alıntılanamayacağı için İstatistik eskisi gibi çubukta kalır. Misafir tıklayınca ortak giriş penceresi açılır; yayında/herkese açık olmayan içerikte düğme nedeniyle pasiftir; topluluğa özgü içerikte çizilmez. `announceTarget` `features/quotes/quote-target.ts`'e taşındı.

## Paylaş penceresi

Eylem satırı: **Bağlantıyı kopyala** (her zaman panoya yazar; `share.action.copyLink`) · **Diğer uygulamalar** (sistem paylaşım sayfası, yalnız `navigator.share` olan cihazda; ayrı eylem) · Hikâye · Space · Koleksiyon · **Dışa aktar** (yalnız prompt). **Alıntıla artık Paylaş'ta yok** (eylem çubuğunda). Misafir de aynı eylem satırını görür (eski tek büyük düğme kalktı). `share-button.tsx`: `copyShareLink`, `nativeShareLink`, `canUseNativeShare`, `shareableUrl` (profil paylaşımının `shareOrCopyLink`'i bunların üstüne kuruldu, davranışı aynı).

## Profilde sabitle

- **Veritabanı** (`20261223100000_profile_pins.sql`, yalnız ekleyici): `profile_pins` (beş hedef sütunundan tam biri: prompt/istek/workflow/ayar paketi/Skill, hedef silinince CASCADE, kişi başına en çok 3) + `set_profile_pin(kind, id, pinned)` (SECURITY DEFINER; içerik KENDİSİNİN + yayında + herkese açık + topluluğa/ekibe ait değil, kişi başına danışma kilidiyle `pin_limit`, saatte 60 işlem). İstemci tabloya yazamaz. Okuma RLS: sahibi her zaman; başkası ve ziyaretçi yalnız hedefi okunabilen satırları görür (gizlenen/taslağa dönen içeriğin sabiti kendiliğinden görünmez). Test: `supabase/tests/profile-pins.sql` (25 madde).
- **İstemci:** `lib/supabase/profile-pins.ts` + `features/profile/profile-pins.tsx` (kendi sabitleri için modül tekili iyimser depo; başkasının profilinde bir kez okunur). Profil bölümlerinde (Promptlar · İstekler · Workflow'lar · Ayar paketleri · Skill'ler) sabitler kimlikle okunup listenin EN ÜSTÜNE konur, sayfalı listenin geri kalanı arkasından gelir (aynı gönderi iki kez çıkmaz); arama/süzgeç açıkken sabit gösterilmez. Sabitlenen kartın kicker satırında **raptiye** (`Pin` simgesi, `data-pinned-mark`, "Profilde sabit") görünür — yalnız profilde (`ProfilePinScope`), akışta/aramada yok; `ContentCardPost` `pinned` prop'u.
- Sınır aşılırsa sunucu kodu `pin_limit` okunur cümleyle gösterilir (`server-errors.ts`, `error.profilePinLimit`).

## Çeviri
`src/lib/i18n/translations-post-menu.ts` (TR+EN; `node scripts/build-i18n.mjs`). İngilizce karşılıkların hepsi eklendi.

## Testler
Birim: `src/lib/post-menu.test.ts` (19). SQL: `supabase/tests/profile-pins.sql`. Arayüz (ağ taklitli): yeni `tests/messaging-ui/run-post-menu.mjs` (16 senaryo, port 4330); güncellenenler `run-share-people`, `run-quotes`, `run-detail-pages`, `run-skills-social`, `run-community-posts`, `run-report-modal`, `run-interest`. Gerçek Supabase'e / cihaza KARŞI DENENMEDİ; migration canlıya CI'da (`deploy.yml`) uygulanır.
