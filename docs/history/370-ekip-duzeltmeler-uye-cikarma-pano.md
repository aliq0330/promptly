# 370 — Ekip düzeltmeleri: "Panoda göster", üye/proje çıkarma, pano yerleşimi, "Space" kelimesi

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK).** Kaynak: kullanıcının telefon ekran görüntüleri ve şikâyetleri.

## 1. "Panoda göster" dosyada olmayan bir panoyu açıyordu; panoda silmek yüklü görseli de siliyordu
- Neden: 368'e göre dosyanın öğeleri dosyanın görünmez ana alanındadır, o alan pano DEĞİLDİR. Ama dosya sayfasındaki öğe çekmecesi "Panoda göster"i `?file=<dosya>&sub=board&focus=<öğe>` adresine bağlıyordu ve `BoardMode` bunu dosyanın ana alanını tam ekran tuval olarak açıyordu. O "pano" öğelerin kabıdır → tuvalde Sil = dosya öğesini silmek.
- Düzeltme: `AreaItemContext.onBoard`. Dosya sayfasında (ve eski proje geneli alanda) `false`: "Panoda göster" düğmesi ve ⋯ menü satırı çizilmez; gerçek (ek) panodaki öğede `true` ve davranış değişmez. Görüntüleyicide dosya öğesinin ⋯ menüsü artık boştur, hiç çizilmez.

## 2. Üye / projeden kişi çıkarma
- **Ekipten:** "Çıkar" düğmesi `hidden md:inline-flex` idi → telefonda hiç yoktu. Telefonda satıra ayrı bir çıkarma simgesi (`data-member-remove-phone`, `UserMinus`, 44 px) eklendi; aynı `RemoveMemberDialog` açılır.
- **Projeden:** kişi listesinde çıkarma yoktu (yalnız Erişimi düzenle → küçük ✕). `ProjectPeopleList` (yan sütun + bilgi penceresi ortak) lider için her açık girişin yanına çıkarma simgesi koyar: onay → `team_project_access` ile güncel girişler okunur, kişi çıkarılır, `team_set_project_access` yazılır. Örtük liderler (ekip sahibi/yöneticisi) ve kendin çıkarılamaz. "Tüm ekip" modunda erişim girişle değil moda bağlı olduğundan simge yerine açıklama gösterilir ("Yalnız seçilenler"e geç).

## 3. Pano yerleşimi (telefon)
- Pano genel bakışı artık akışta çizilir (`absolute inset-0` + iç `overflow-y-auto` kalktı): sayfa içerik kadar uzar, sayfanın kendisi kayar. Başlık telefonda tam genişlik, düğmeler altında (başlık dar sütuna sıkışıp satır satır kırılmıyordu).
- Tuval telefonda üst menü ile alt menü arasını `fixed` doldurur (`top-16`, `bottom-[calc(4rem+safe-area)]`); önceki `100dvh-10rem` hesabı Safari'de altta boşluk bırakıyordu. Masaüstü/tablet yüksekliği aynı.

## 4. "Space" kelimesi ekipte
- Space motorundan gelen ortak formlar (yeni dosya/pano/proje adı alanı: "Space adı"…) ekip sayfasında görünüyordu. `TeamPage` ve `TeamsPage` artık `LanguageTermScope(rewriteAreaTerms)` ile sarılı (ekip içinde "Space" → "alan"), ayrıca ad alanları kendi etiketini alır: `TitleField` `label`/`placeholder` prop'u, `tp.name.project|file|board` (+ `…Placeholder`) → "Proje adı / Dosya adı / Pano adı".

## Testler
- `run-team-projects` 44 senaryo (24/27/28 güncellendi; 24b, 40, 41, 42 yeni), `run-team-hub` 29 (telefon çıkarma simgesi), `run-team-board` 3b (telefon tuval + genel bakış akışı). Gerçek Supabase/cihaz DENENMEDİ.
- İngilizce karşılıklar eklendi (`tp.name.*`, `tp.people.remove*`, `tp.people.allModeNote`).
