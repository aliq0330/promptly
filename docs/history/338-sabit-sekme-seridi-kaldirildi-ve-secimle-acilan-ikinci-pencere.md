# 338 — Sabit sekme şeridi kaldırıldı + seçimle açılan ikinci pencere

Durum: uygulandı (ağ taklitli Playwright; gerçek cihaz/Supabase'e karşı denenmedi).

## 1) Aşağı kaydırınca çıkan şerit kaldırıldı
- `SectionNav`'in `FoldedBar`'ı (kaydırınca üst menünün altına yapışan 52 px şerit), `useScrolledPast` ve `globals.css`'teki
  `[data-sticky-under-header]` kuralları silindi. Ana Sayfa, Keşfet ve konu sayfaları (`/tags`, `/categories`, `/tools`) etkilenir:
  sekmeler ve Filtre sayfayla birlikte kaydırılıp kaybolur. `CountBadge`'in `inside` kipi (yalnız şeritte kullanılıyordu) da kalktı.

## 2) Seçimle açılan form artık ikinci pencere
Sorun: uzun içerik listesinde seçim yapınca "Alıntıla"/Not formu listenin altına ekleniyordu; 50 satır aşağı inmek gerekiyordu.
- `QuoteSection` yeni `mode="popup"` (+ `open`/`onOpenChange`/`hideTrigger`/`contextTitle`/`extra`): form üstte `Modal overLayers`
  içinde açılır (başlık + içerik adı, kayan gövde, sabit alt çubukta Alıntıla). Durum pencere kapanınca korunur.
- "Var olan içeriği paylaş" (`share-existing-modal`): satıra dokunmak pencereyi açar; kapatınca liste/seçim yerinde, seçili satıra
  tekrar dokunmak yeniden açar ("İçeriği aç" bağlantısı pencerenin gövdesinde).
- "Mevcut içeriğe başvur" (`share-to-community-modal`): Not + Paylaş ikinci pencerede; ilk pencerede kapat (X) var, alt çubuk kalktı.
- Paylaş penceresindeki "Alıntıla" satırı (`share-modal`): satıra basınca form ikinci pencerede açılır.
- Testler güncellendi: `run-quotes`, `run-space-posts` (`[data-quote-popup]`).
- İngilizce: yeni metin yok (mevcut `quotes.section.*`, `common.close` anahtarları).
- Bilinen sınır: `run-discover` 7. senaryo (yan menü girişleri) bu işten bağımsız olarak kırmızı.
