# 201 — Detay sayfaları: Albüm düzeni

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza karşı denenmedi.

## Neden
Kullanıcı detay ("local") sayfalarının daha modern/şık olmasını istedi. Tasarım tuvalinde dokuz yön gösterildi (A Vitrin, B Editoryal, C Stüdyo; D Gönderi, E Sahne, F Bento; G Uygulama, H Pin, I Albüm). Sırasıyla **B · Editoryal** (#259) ve **E · Sahne** (#260, #261) uygulandı, ikisi de beğenilmedi; kullanıcı **I · Albüm**'ü seçti. Bu belge son durumu anlatır; önceki iki sürüm bu düzenle değiştirildi.

## Yapılan
- **Bant** (`DetailBand`, `features/content/detail-parts.tsx`): sayfanın üstünde, gönderinin görselinden renk alan şerit — görsel büyütülüp bulanıklaştırılır, üstüne sayfa renginde yarı saydam örtü (yazı okunur kalsın diye; topluluk kapağının "otomatik" modundaki yöntem, piksel okuma yok). Görseli olmayan gönderide marka tonu (`bg-primary-soft`).
  - Solda **kapak** (`DetailArt`): görsel kendi en-boy oranında, kırpılmadan; telefonda en çok 240px, `md`+ 300px yükseklik, `lg`+ başlığın solunda en çok 460px / %42 genişlik; tıklayınca ışık kutusu, ek görseller küçük resim. Video/ses promptunda yazarın çıktısı (`PromptPlayableOutput`). Görsel yoksa türün simgesi (`DetailArtPlaceholder`).
  - Sağda tür etiketi (+ durum/taslak rozetleri), büyük başlık, yazar satırı (`DetailByline`: avatar · ad · @kullanıcı · zaman · "N kez kullanıldı").
- **Eylem satırı** (`DetailActionBar`): sayfanın büyük birincil eylemi (`primary`) — Prompt: "Promptu Kopyala" (`CopyPromptButton size="lg"`), İstek: "Yanıtla" (sahibine Kapat/Aç), Workflow: "Adım adım çalıştır", Hazır Ayar: "Studio'da aç"; ardından etkileşim ikonları (Beğeni · Yorum · Kaydet · İstatistik … Paylaş, kartlardaki sıra); sağda Takip Et + ⋮. Telefonda ikonlar kendi satırında.
- **Gövde** `lg`+ iki sütun: içerik (açıklama, bölümler, sonuçlar, yorumlar) ve **Hakkında** (`DetailAside`: araç + sınıflandırma kartı, ilgili içerik, katkıda bulunanlar). Dar ekranda Hakkında içeriğin altında.
- Prompt: "Kendine uyarla" prompt metninden önce; Kopyala · Çalıştır · Studio'da aç prompt bloğunun altında da durur (değişkenleri doldurduktan sonra yukarı kaymadan kopyalamak için).
- Çeviri: yeni anahtar yok ("Hakkında" için var olan `profile.tabAbout`, büyük düğme için `prompt.copyPrompt`); `detail.actionsAria`, `detail.adaptTitle`, `detail.requestBrief`, `comments.countLabel` — TR + EN.

## Sınırlar
- Bant rengi tarayıcıda görselin bulanık hâlinden gelir; çok açık/çok koyu görsellerde ton zayıf kalabilir (örtü okunurluğu korur).
- Gerçek cihazda ve gerçek görsellerle denenmedi.

## Sınama
`tsc`, `lint` (0 hata), `npm test`, `next build --webpack`; `run-detail-pages` 44/44 (iskelet, kapak boyutu, 8 genişlikte yerleşim: bant içeriğin üstünde, `lg`+ Hakkında sağda / altında, kapak başlığa binmez, tek eylem satırı), `run-community-posts`, `run-shared-cards`, `run-focus-feed`; ekran görüntüleri 390 / 768 / 1024 / 1440.
