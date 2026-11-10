# 365 — Ekip: tek düz üst çubuk + eski alan sekmelerinin kaldırılması

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Ağ taklitli Playwright `run-team-projects` 34/34, `run-team-hub` 38/38, Space paketleri yeşil; gerçek Supabase/cihazda DENENMEDİ.**
Kullanıcı iki şikâyet getirdi: (1) 364'ten sonra ekranlar aynı görünüyordu — çünkü "Ekle → Prompt" ve eski Promptlar/Görseller/Notlar/Palet sekmeleri (arama, sıralama, "Yeni taslak", "Tümü" menüsü) duruyordu; (2) "Projeler" sayfasındaki düz üst çubuk (`← Kod Mutfağı / Projeler`) ekibin HER sayfasında olsun, yuvarlak köşeli yol çubuğu gitsin.

| Konu | Karar |
|---|---|
| Üst çubuk | `ProjectPathBar` artık düz, köşesiz, tam genişlik çubuk (telefondaki `PhoneSubBar` ile aynı görünüm): solda geri oku, ortada iki satır (üstte son iki üst konum "Proje › Dosya" — ilki bağlantı, altta kalın şu anki sayfa), sağda ⓘ ya da öğe sayfasında ⋯. Proje ana ekranı, dosya, pano, öğe ve **lider onay kuyruğu** hep bu çubuğu kullanır (kuyruk eski "ok + proje / başlık" yolunu bıraktı). Projeler/Sohbet/Üyeler/Panel/Yönetim zaten `PhoneSubBar` idi. Çubuğun başlığı `<div>`'dir (`h1` sayfa başlığındadır). Ekip ana ekranı (kimlik bloğu + karolar) bilerek çubuk almadı: ekip adı zaten kimlik bloğunda. |
| Sekmeler | Alanın sekme şeridi (Pano · Görseller · Promptlar · Workflow/İstek · Notlar · Palet) ve bu sekmelerin gövdeleri ekip alanından KALKTI. Tek alt görünüm pano (`sub=board`, gruplanmış araç çubuğu 363'ten). Eski `sub=images|prompts|notes|palette|content` adresleri listeye düşer. (Kişisel Space'in sekmeleri aynen duruyor — yalnız ekip alanı değişti.) |
| Ekle | Sağ alttaki "Ekle" artık sekmeye gitmez: Prompt → `DraftEditorModal`, Not → `NoteEditorModal`, Palet → `NewPaletteDialog` listenin ÜSTÜNDE açılır; Görsel → gizli dosya girişi (`useSpaceImageUpload` — Görseller sekmesindeki yükleme mantığı kancaya çıkarıldı, tek yol); Workflow/Ayar paketi → pano. |
| Satırlar | Listedeki HER öğe satırı (workflow/ayar paketi/istek dahil) öğe sayfasına gider. |
| Öğe sayfası ⋯ | Panoda göster · **Düzenle** (not → not düzenleyici, taslak prompt → taslak düzenleyici, görsel/yayınlanmış prompt → `ItemDetailModal`, palet → `PaletteCard` penceresi) · **Değişiklik öner** (düzenleyici + onaylı öğe; `ProposeChangeDialog` ortak dosyaya çıktı) · Sil. Yetki `lib/team-projects.ts` aynasından (`canEditItemContent`, `canProposeChange`, `canDeleteItem`); karar yine sunucuda. |
| Dil | `tp.item.edit` TR+EN eklendi (diğer metinler 364'te). **İngilizce karşılıkları eklendi.** |

## Bilinen sınırlar
- Sekmelerdeki arama / sıralama / kaynak süzgeci / çoklu görünüm ekip alanında artık YOK (liste + öğe sayfası var). Gerekirse listeye arama eklenir (mockup 3 "Drive tarzı").
- Görsellerin grup yönetimi ve "Palet → görselden çıkar" ekip alanında bu sürümde erişilemez (kişisel Space'te duruyor).
- Ekip ana ekranı ve ekip sohbeti çubuğa geçirilmedi.
- Gerçek Supabase, gerçek telefon ve dosya seçici akışı (yalnız `filechooser` olayı doğrulandı, yükleme sahte ağda denenmedi) DENENMEDİ.
