# 369 — Space alanı: "Merkez" düzeni (ekip projesiyle aynı dil)

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Ağ taklitli Playwright `run-spaces` 34/34 ve ilgili Space/ekip paketleri; gerçek Supabase/cihazda DENENMEDİ.**
Kullanıcı Space alanının PC / tablet / telefon tasarımının ekip projesi gibi olmasını istedi; 18 panoluk mockup (özet, masaüstü 6, tablet 4, telefon 7) onaylandı ve uygulandı.

| Konu | Karar |
|---|---|
| Space sayfası sekmeleri | Tek "Genel bakış ▾" menüsü (235) yerine **altı çizgili `Tabs`** (simge + ad + sayı; dar ekranda kaydırılır). Görünür sekme kuralları (vitrin, Etkinlik görünürlüğü) aynı. |
| Öğe ayrıntısı | Ortada açılan pencere yerine **çekmece**: `SpaceDialog drawer` → md+ sağa yapışık panel (`Modal side`), telefonda alt sayfa (`sheet`). Görseller / Promptlar / Notlar sekmeleri ve pano kullanır; ekip alanının "Düzenle" yolu (`team-item-detail`) eski pencerede kaldı. |
| Genel bakış | 4 sayaç kartı (Görsel · Prompt · Not · Palet; dokununca sekmeye gider) eklendi; "Kaldığın yerden devam", son görseller/promptlar aynı. |
| Telefon | Genel bakış ve pano DIŞINDAKİ sekmelerde bant yerine tek üst çubuk (`PhoneSubBar`: geri · Space türü · ad · Paylaş · ⋮); Genel bakış bandı aynı. |
| Spaces ana sayfa | Bant (simge + başlık + "Yeni Space") + altı çizgili bölüm sekmeleri (Davetler sayaçlı); arama/filtre/görünüm simgeleri satırda kaldı; "+" düğmesi banttaki "Yeni Space" oldu (`data-testid="create-space"` aynı). |
| Metinler | Yeni görünür metin YOK (var olan anahtarlar yeniden kullanıldı) — TR/EN zaten karşılıklı. |

## Yapılmayanlar (mockup'ta vardı)
- Telefonda sağ alttaki yüzen "Ekle" düğmesi / Ekle alt sayfası (sekmelerin kendi ekle düğmeleri duruyor).
- Bantta üye yüzleri ve bantta birincil Paylaş (bant mevcut Albüm bandı + eylem satırı olarak kaldı).
- Ayrı Etkinlik / Üyeler / Palet / Notlar sekmesi yeniden çizimi (aynı kabuk, içerik aynı).

## Testler
`tests/messaging-ui/run-spaces.mjs` yardımcıları (`pickSection`, `spaceTabs`, `spaceTabNames`, `pickSpaceTab`) menüden `tab`/`tablist`e geçirildi.
