# 266 — Görsel ağırlıklı gönderi kartı (Albüm kartının yerini aldı)

**Durum: uygulandı (repoda). Yalnız istemci kodu, migration yok.** Kullanıcı üç yönü (A · görsel + tek satır alt bilgi, B · telefonda tam kaplama, C · görsel duvarı) mockup'ta gördü, C'yi seçti ve referans olarak bir Dribbble kartı verdi: yuvarlak köşeli büyük görsel, çerçevesiz, altında tek satır (avatar · ad · sayaçlar). `202-*`'deki Albüm kartının (renkli bant + tür satırı + büyük başlık + eylem satırı) yerine geçer; detay sayfalarının Albüm bandı (`201-*`) DEĞİŞMEDİ.

## Kullanıcı gözüyle
- Kart = gönderinin görseli (yuvarlak, `rounded-xl`, kutu/kenarlık/gölge yok) + altında tek satır: **avatar · ad** solda; **Beğeni · Yorum · Kaydet (yalnız simge) · ⋮** sağda. Başlık, açıklama, tür etiketi, araç, zaman ve tepki özeti kartta GÖRÜNMEZ.
- **Üzerine gelince / klavyeyle odaklanınca** görselin altında karanlık bir geçişle tür satırı (+araç), başlık ve "@kullanıcı · zaman" belirir. Başlık kartın gerçek bağlantısı olarak durur (klavye/ekran okuyucu); dokunmatikte hover olmadığından başlık görünmez (bilinçli).
- **Tür** görsel biçimden ve köşedeki yuvarlak simgeden anlaşılır (görsel prompt hariç — görsel zaten söyler): video/ses/metin promptu, Workflow, Hazır ayar, İstek, Alıntılanan içerik, Space. Görselsiz içeriğin "görseli" kendisidir: prompt metni (mono, alta doğru soluyan), Workflow adım özeti, Hazır ayar parametre çipleri, İsteğin metni.
- **Durum rozetleri hep görünür**, görselin sol üst köşesinde: Taslak, Özel, Açık/Kapandı, Alıntı, Başvuru, Sabit.
- Birden çok çıktı görseli olan promptta kapak + küçük "+N" çipi (şerit kalktı). Video/ses kapağında ortadaki oynat işareti kalktı; yerine köşedeki simge geldi.
- **Kartlardan kaldırılanlar:** Paylaş ve İstatistik düğmeleri (detay sayfasının eylem satırında duruyor), "Tepki verdi" özeti (`ReactionSummary` — detay sayfasında), Space kartının "Panoyu gez" düğmesi ve Paylaş'ı (Space sayfasında), `OutputCaption` ("Çıktı" etiketi). Beğeni düğmesi aynı `LikeButton`/tepki seçicidir; sayaç yine toplam tepkidir.

## Kodda
- `features/content/content-card.tsx`: `ContentCard` `variant="visual"` (kutusuz kabuk; Odak/Izgara kartları varsayılan `box` ile aynı kaldı); `ContentCardPost` yeniden yazıldı. Yeni/değişen props: `typeIcon`, `status`; kalktı: `backdrop`, `tint`, `primary`, `reactions`. `CardBandBackdrop`/`bandTint` (topluluk/koleksiyon/yaratıcı kartları, detay bandı) olduğu gibi duruyor. `CARD_PRIMARY_CLASS` silindi (tek kullanıcısı Space kartıydı). `CONTENT_GRID_ITEM_CLASS` ve `ContentGrid` boşluğu 20/24 px (alt satır yüzünden).
- Kapak: `data-card-media` artık `ContentCardPost`'un görsel kutusunda (kart→detay geçişi `lib/card-transition.ts` onu okur); art bileşenleri kendi çerçevesini (yuvarlak/gölge) çizmez, `OutputThumbnailStrip`/`OutputPosterPreview`/`PromptPreviewBox variant="art"`/Workflow-Hazır ayar-İstek art'ları kutuyu doldurur. Görselli art'ların en/boy oranı `clampedAspectRatio` (0,75–1,4) — duvarda kartlar farklı boyda; görselsiz art'lar 4:5.
- `features/prompts/prompt-card-footer.tsx`: `PromptCardFooter` kompakt (Beğeni · Yorum · Kaydet); `action-styles.ts` `CARD_SAVE_CLASS` (Kaydet'in sayısını gizler), `PostSave` `className` alır.
- Yedi kart (`prompt/workflow/preset/request/quote/application` + Space Keşfet kartı) ve `PromptCardSkeleton` yeni yapıya uyarlandı.
- Yeni metin yok (i18n): mevcut anahtarlar kullanıldı; `prompt.output` artık kartta kullanılmıyor, çeviri dosyasında duruyor.

## Bilinçli sınırlar / açık
- Dokunmatik cihazda kartta başlık yok (hover yok); kullanıcı isteği "başlık/açıklama kalksın" idi. Gerekirse başlığı alt satıra tek satır ekleyen bir tercih eklenebilir.
- Kaydet'in sayısı, Paylaş ve İstatistik kartta yok — hızlı paylaşım/istatistik için karta dokunmak gerekir.
- Odak/Izgara (`focus-*`) kartları ve Space panosu/Kaydedilenler dışındaki listeler bu kartı `ContentGrid` ile kullanır; Odak'a dokunulmadı.
- Gerçek Supabase'e / gerçek görsellerle / iOS Safari'ye karşı denenmedi; ekran görüntüleri ağ taklitli Keşfet'te (gradyan sahte görsellerle) alındı.
