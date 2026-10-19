# 201 — Detay sayfaları: Sahne düzeni

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza karşı denenmedi.

## Neden
Kullanıcı detay ("local") sayfalarının daha modern/şık olmasını istedi. Tasarım tuvalinde önce üç yön (A · Vitrin, B · Editoryal, C · Stüdyo) gösterildi; **B · Editoryal** uygulandı (numaralı bölümler, yüzen eylem hapı / dikey ray) ama kullanıcı beğenmedi. Üç yeni yön (D · Gönderi, E · Sahne, F · Bento) gösterildi, kullanıcı **E · Sahne**'yi seçti. Editoryal sürüm ana dala hiç girmedi; bu belge son durumu anlatır.

## Yapılan
- **`DetailShell`** (`features/content/detail-parts.tsx`) iki parçalı kabuk: `stage` (gönderinin medyası) her zaman koyu sahnede (`.dark` + `data-palette`, Odak'ın sahnesiyle aynı yol — ziyaretçinin paleti, koyu mod), gönderi açık panelde.
  - `lg`+ : sahne solda yapışkan sütun (`top-16`, ekran yüksekliği), panel sağda 420px (`xl` 460px), sayfa tek kaydırma.
  - Daha dar ekran: sahne üstte bant, panel üstüne binen yuvarlak köşeli sayfa (tutamaç süsü).
  - Medyası olmayan gönderi (metin promptu, kapaksız workflow/hazır ayar, referanssız istek): sahne yok, ortalanmış panel.
- **Sahne içeriği:** `DetailStageFigure` medyayı kendi en-boy oranında, kırpmadan, sahnenin izin verdiği en büyük boyutta gösterir (telefonda ekranın %60'ı, `lg`+ sahne yüksekliği), tıklayınca ışık kutusu; ek görseller `DetailStageThumb` küçük resimleriyle. Video/ses promptunda yazarın yüklediği çıktı (`PromptPlayableOutput`, kartsız sahne görünümü; çıktı yoksa kapak, o da yoksa türün simgesi).
- **Panel:** ilk satır `DetailByline` (avatar, ad, @kullanıcı · zaman · "N kez kullanıldı", sağda Takip Et + ⋮), sonra tür etiketi (+ durum rozetleri), başlık, açıklama, bölümler (`DetailSection` sade başlık), künye bandı (araç, altında çipler), sonuçlar, yorumlar (`DetailComments` + `EngageComments headless`), en sonda ilgili içerik (`DetailAside`). Ayrı yazar kartı (`CreatorSummary`) kaldırıldı — yazar satırı onun işini görüyor.
- **Eylemler** tek satır (`DetailActionBar`, kartlarla aynı sıra: Beğeni · Yorum · Kaydet · İstatistik … Paylaş): telefonda sahnenin hemen altında, `lg`+ ve sahnesiz sayfalarda panelin dibinde yapışkan.
- Prompt: Kopyala · Çalıştır · Studio'da aç prompt bloğunun altında (dar panelde başlığı sıkıştırmasın diye).
- Çeviri: `detail.actionsAria`, `detail.adaptTitle`, `detail.requestBrief`, `comments.countLabel` — TR + EN.

## Sınırlar
- Gerçek cihazda (özellikle iOS Safari'nin alt çubuğu ile yapışkan eylem satırı) denenmedi.
- Sahnedeki önceki/sonraki gönderi okları yok (bir detay sayfasının "sıradaki gönderisi" tanımlı değil; sahte düğme konmadı).

## Sınama
`tsc`, `lint` (0 hata), `npm test`, `next build --webpack`; `run-detail-pages` (yerleşim senaryoları Sahne'ye göre yeniden yazıldı: lg+ sahne panelin solunda / dar ekranda üstünde, tek eylem satırı; Kopyala prompt bloğunun altında), `run-community-posts`, `run-shared-cards`, `run-focus-feed`; ekran görüntüleri (`shots-details`, 1440 + 390).
