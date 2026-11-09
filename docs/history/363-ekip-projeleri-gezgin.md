# 363 — Ekip projeleri: Gezgin düzeni, "Space" metinlerinin temizlenmesi, telefonda gruplanmış pano araç çubuğu

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Ağ taklitli Playwright + birim testleri; gerçek Supabase/cihazda DENENMEDİ.**
Kullanıcı üç telefon ekran görüntüsüyle şikâyet etti: (1) "proje geneli alanı" ile dosya karışıyor; (2) dosyaya girince büyük bant + tuval karşılıyor, dar
ekranda başlık "Oturm/a Odası/konse/pt" diye kırılıyor, üstteki iki çubuk (telefon alt-sayfa çubuğu + yol kırıntısı) aynı bilgiyi tekrarlıyor;
(3) ekip içinde hâlâ "Space" yazıyor; (4) panonun araç çubuğu telefona sığmıyor. Üç mockup yönü gösterildi, **1 · Gezgin** seçildi
(hiçbir şey açık gelmez, her şey "Ekle" ile gelir, tuval öncelikli değil).

## Yapılanlar

| Konu | Karar |
|---|---|
| Üst çubuk | TEK `ProjectPathBar`: geri oku + yol çipleri (Ekip › Proje › Dosya/Alan) + ⓘ. Telefonda proje sayfalarında `PhoneSubBar` çizilmez (`team-page.tsx`). Eski `Crumbs` ve büyük mavi başlık bandı kalktı. |
| Adlandırma | "Proje geneli" → **"Ortak"** (pin simgesi, `tp.area.projectWide`); dosya klasör simgesiyle. İkisi artık görsel olarak da ayrı. |
| Proje ana ekranı | Başlık + tek satır özet; **klasör listesi** (Ortak + dosyalar), sağ altta tek **"Yeni dosya"** düğmesi (lider). Kişiler/roller/değişkenler/sohbet/ayarlar **ⓘ penceresindedir** (`ProjectInfoSheet`); eski yan sütun kalktı. |
| Dosya / Ortak / ek pano | Adres `?file=` ya da `?board=`; `sub` YOKSA **liste kipi** (`AreaFolderList`): ana pano, ek panolar, görsel, prompt, not, workflow/ayar paketi, palet **satır satır** (liste ↔ ızgara). `sub=board|images|…` ise eski sekmeli alan görünümü. Hiçbir sekme/tuval kendiliğinden açık gelmez. Üst çubuğun geri oku sekmeden listeye, listeden bir üst konuma döner. |
| Ekle | Sağ altta tek düğme (`data-area-add`); seçenekler aynı (`AddMenuDialog`). **Not / Prompt / Palet** seçilince ilgili sekme açılır ve **ekle penceresi kendiliğinden açılır** (`&add=1` → `autoAdd`); Görsel dosya seçici tarayıcı kuralı yüzünden sekmede kendi düğmesinden; workflow/ayar paketi panodaki "Promptly'den ekle"den. |
| Dosya bilgisi (ⓘ) | Onay anahtarı/notu, dosya değişkenleri, yeniden adlandır, sil (`FileInfoSheet`). |
| "Space" metni | (a) `translations-team-system.ts` / `translations-team-spaces.ts` içindeki görünür metinler "proje"ye çevrildi (+ eskimiş "Kütüphane" cümleleri temizlendi). (b) Alan içinde (Space motorunun ortak bileşenleri) kalan "Space" için `LanguageTermScope` + `rewriteAreaTerms` (`lib/team-area-terms.ts`): HAM çeviri "alan"a yeniden yazılır (Türkçe ek uyumu: alana/alandan/alanda/alanı/alanın/alanlar; İngilizce "a Space" → "an area"); `{{param}}` değerleri (kullanıcının yazdığı ad) ham metinde olmadığı için bozulmaz. Birim testi `team-area-terms.test.ts`. |
| Pano araç çubuğu (telefon) | `SpaceBoard` `useMediaQuery(max-width 767.98px)` ile gruplanır: **[+ Ekle] [çoklu seçim] [bağlantı] │ [geri al] [yinele] │ [%] [⋯]**; yakınlaştır/uzaklaştır/sığdır/ara/mini harita/tam ekran/gruplar "Diğer pano araçları" (⋯) menüsüne girdi. Masaüstü aynı kaldı. |

## Bilinen sınırlar / dürüst notlar

- Listede bir öğeye dokunmak **o öğenin sekmesini** açar (görsel → Görseller, prompt → Promptlar…); tek öğeye odaklanma yalnız Görseller/Pano'da vardır (`focusId`), diğer sekmelerde yok.
- Mockup 3'teki "Taşı" (öğeyi dosyalar arasında taşıma) ve arama/tür süzgeci **yapılmadı**; taşıma için yeni RPC gerekir.
- "Ekip projelerini de sil" onay kutusunun (`tm.admin.deleteSpaces`) arka plandaki davranışı (`team_delete` `p_delete_spaces`) ekip alanları için ayrıca denetlenmedi; yalnız metin düzeltildi.
- SQL tetikleyicilerinin yazdığı bildirim cümleleri (ör. "ekip Space'ini açtı") veritabanında DEĞİŞMEDİ; yalnız istemcideki çeviri karşılıkları güncellendi.
- Gerçek Supabase, gerçek telefon (iOS Safari) ve Realtime'a karşı DENENMEDİ.
