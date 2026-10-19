# 201 — Detay sayfaları: Editoryal düzen

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza karşı denenmedi.

## Neden
Kullanıcı detay ("local") sayfalarının daha modern/şık olmasını istedi; üç yön (A · Vitrin, B · Editoryal, C · Stüdyo) tasarım tuvalinde gösterildi, kullanıcı **B · Editoryal — dergi gibi okunan sayfa**yı seçti.

## Yapılan
- **Ortak parçalar** (`features/content/detail-parts.tsx`) dört detay sayfasının (Prompt, Prompt İsteği, Workflow, Hazır Ayar — topluluk başvuru gönderisi de aynı görünümleri kullanır) dilini taşır:
  - `DetailTitle` büyük display başlık (clamp 36→56px, sıkı satır aralığı); `DetailLede` daha büyük giriş metni; `DetailByline` iki ince çizgi arasında, `meta` ile ek bilgi (Prompt'ta "N kez kullanıldı").
  - **`DetailSection`** — numaralı bölüm ("01 Prompt Metni · [eylemler]", "02 Kendine uyarla", "03 Sonuçlar · N", … "Yorumlar"). Numara CSS sayacından gelir (`DetailShell` `counter-reset`, her bölüm `counter-increment`), gizli bölüm boşluk bırakmaz. `DetailComments` artık son numaralı bölümdür; `EngageComments … headless` yorum bölümünün kendi başlığını "N yorum" satırına çevirir (çift başlık yok).
  - **Eylemler tek araç çubuğu** (`DetailActionBar`, `role="toolbar"`, `data-detail-actions`): telefonda/tablette altta yüzen hap (alt menünün üstünde), `xl`'de makalenin solunda yapışkan dikey ray. `DetailShell`'in yeni `actions` prop'u ile verilir; Paylaş/İstatistik etiketsiz (yalnız ikon + sayı, erişilebilir adlar korunur). `DetailShell` alt boşluğu hapın son satırları örtmemesi için artırıldı.
  - `DetailMetaCard` kutusuz "künye" bandı (iki ince çizgi arası); `RelationMapLink` yalnız ikon.
  - Kartlar/bloklar 22px köşe, kapak/çıktı görselleri gölgesiz `bg-surface-soft` zemin.
- Sayfalar: Prompt (prompt bloğu + Kopyala/Çalıştır/Studio başlık satırında, değişkenler "Kendine uyarla", sonuçlar bölümü), İstek ("İstek" bölümü: mono blok + yaratıcı yön alıntısı; "Yaratıcı yanıtlar · N"), Workflow ("Adımlar" bölümü, Akış/Adım adım seçici başlıkta), Hazır Ayar ("İçerik" parametre tablosu).
- Çeviri: `detail.actionsAria`, `detail.adaptTitle`, `detail.requestBrief`, `comments.countLabel` — TR + EN.

## Sınırlar
- Yüzen hap iOS Safari'nin alt araç çubuğuyla gerçek cihazda denenmedi.
- Oluşturma/düzenleme ekranları ve listeler değişmedi.

## Sınama
`tsc`, `lint` (0 hata), `npm test`, `next build --webpack`; `run-detail-pages`, `run-community-posts` (seçiciler `[data-detail-actions]` / `#prompt-text`'e güncellendi), `run-focus-feed`, ekran görüntüleri (`shots-details`, 1440 + 390).
