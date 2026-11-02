# 319 — Bağlantı ekranları yeniden tasarlandı: sihirbaz, izin ekranı, bağlı uygulamalar, /developers bölümleri

> **Durum:** repoda, testli (ağ taklitli). Canlı site GitHub Pages ile merge sonrası yayınlanır. Veritabanı/Edge Function değişikliği YOK (yalnız arayüz). Gerçek cihaza / claude.ai / ChatGPT'ye KARŞI DENENMEDİ.

## Neden
Bağlama rehberi (Ayarlar → Geliştirici) uzun bir numaralı listeydi; "aptala anlatır gibi" değildi, hangi yolun ne zaman seçileceği belli değildi. OAuth onay ekranı, Bağlı uygulamalar kutusu ve `/developers` sayfası ayrı dillerdeydi; `/developers` ise tek uzun akıştı (içindekiler yok).
Kullanıcı Claude tuvalinde 4 yön (A–D) + 3 bölüm-gezinmesi mockup'ı görüp seçti: **Geliştirici ekranı = B** (sihirbaz), **Bağlı uygulamalar = C** (kart), **İzin ekranı = B**, **/developers = aynı dil + 3. gezinme** (önceki/sonraki şeridi).

## Ne yapıldı
- **Bağlama sihirbazı** `features/developers/connect-wizard.tsx` (`ConnectWizard`; veri ve saf yardımcılar `lib/connect-guide.ts`): önce yol (İzin vererek bağlan [Deneysel] / Anahtarla bağlan), sonra her seferinde TEK adım — ilerleme çubuğu, "Adım n / N", büyük başlık, kopyalanabilir değer, "ekranda şuna benzer bir form görürsün" küçük resmi (adres kutusu vurgulu; gerçek form değil), Geri / Sonraki adım, son adımda "Bitti" notu + "Baştan göster", altta tüm adımların listesi (dokununca o adıma gider; durum: yapıldı / şimdiki / bekliyor).
  İzin yolu 5 adım (adresi yapıştır adımında «Şimdi oturum aç» + «Otomatik olarak kaydet» + boş Client ID/Secret hatırlatması), anahtar yolu 8 adım («Oturum açma yok», `Authorization`, `Bearer pmt_…` + Bearer uyarısı). Anahtar bu bileşende ASLA görünmez; adres `developerEndpoints()`'ten gelir.
  **Aynı bileşen** Ayarlar → Geliştirici'de ve `/developers → Hesabınla bağla`'da kullanılır (`keysHref`: Ayarlar'da `#anahtarlarim`, `/developers`'ta `/settings/developer`).
- **İzin ekranı** `/oauth/connect` (`features/oauth/connect-view.tsx`): üstte uygulama harfi ⋯ Promptly "el sıkışma" görseli, başlık, dönüş alan adı; üç satır — **Okuyabilir** · **taslak ekleme anahtarı** (gerçek `role="switch"` onay kutusu, varsayılan KAPALI) · **Asla yapamaz**; güven uyarısı; tam genişlik İzin ver / Reddet. Karar mantığı, RPC gövdeleri ve güvenli yönlendirme DEĞİŞMEDİ.
- **Bağlı uygulamalar** (`features/settings/connected-apps-section.tsx`): her uygulama kendi kartı — ad + "Bağlı" durumu, host, izin çipleri (Okuma / Taslak ekleme / eski tür izin), verilme + son kullanım satırı, tam genişlik "İzni geri al" (iki adımlı onay aynen). Boş durum: "Bağlı uygulama yok."
  **Bilerek yapılmadı:** mockup C'deki "oturum belirteci kalan süre" çubuğu ve "Ayrıntı" düğmesi — `list_my_oauth_grants` erişim belirtecinin bitişini döndürmüyor (RPC dönüş türünü değiştirmek ayrı bir migration ister) ve kartta zaten tüm bilgi var.
- **`/developers`** altı bölüm: Başlangıç · Claude'a bağla · Hesabınla bağla · HTTP API · Kod editörleri · Bilmen gerekenler (hesap/editör bölümleri adres yoksa çizilmez). Her bölüm "Bölüm n / N" üst yazısı + başlık, `scroll-mt-24`; üstte içindekiler YOK.
  **Sabit bölüm şeridi** `features/developers/section-pager.tsx` (`SectionPager`; karar saf `lib/section-pager.ts`): ekranın sağ altında [▲ bölüm adı · n/N ▼] kapsülü, altta ince ilerleme çubuğu; oklar önceki/sonraki bölüme, ada basınca bölüm listesi (dışarı basınca / Esc ile kapanır). Şimdiki bölüm kaydırmayla izlenir (rAF, sayfa sonunda son bölüm). Telefonda alt menünün üstünde (`bottom: 4.5rem + güvenli alan`), `md`+'da `bottom-6 right-6`. Hareketi azalt tercihinde animasyonsuz kaydırma.
  "Başlangıç" bölümündeki üç yol kartı ilgili bölüme kaydırır. Yeni uzun bir belge sayfası bölümlenirse aynı `SectionPager` kullanılır; ikinci bir bölüm gezinmesi yazılmaz.
- **Çeviri** (TR+EN): yeni `lib/i18n/translations-connect-guide.ts`; eskiyen anahtarlar silindi (`devSettings.methodKey/step1–5/methodOauth*`, `dev.meOauth*` [`dev.meOauthLimits` kaldı], `dev.meTitle`, `connect.canTitle/cannotTitle`); `dev.meLead` yeni bölüm sırasına göre yeniden yazıldı.

## Testler
- Birim: `lib/connect-guide.test.ts` (adım verisi, durumlar, sınırlar) + `lib/section-pager.test.ts` (şimdiki bölüm, sayfa sonu, ilerleme, komşular) — `npm test` listesine eklendi.
- Arayüz (ağ taklitli): `run-settings.mjs` 8/8b/9/10 (sihirbaz: iki yol, adımlar, kopyalama, tamamlanma, İngilizce), `run-oauth-connect.mjs` 3b (gerçek anahtar + satırlar) / 13 ("Bağlı" durumu) / 15 (/developers sihirbazı), `run-developers.mjs` 14/15 güncellendi + 16–23 (altı bölüm sırası, üstte içindekiler yok, şerit: ▲▼, liste, Esc, başlangıç kartları, sayfa sonu, telefonda alt menü üstü, İngilizce, sihirbaz).

## Bilinen sınırlar
- Masaüstünde (`lg`+) de sağ altta aynı kapsül durur; mockup notundaki "sol yapışkan bölüm listesi" yapılmadı.
- Sihirbazdaki "ekranda şunu göreceksin" resmi bir ÖRNEKtir (etiketler araca göre değişir); claude.ai/ChatGPT form metinleri doğrulanmadı.
- İzin yolu "deneysel" etiketini koruyor (kullanıcı kararı): belirteç yenilemesi gerçek istemcilerle henüz gözlenmedi.
