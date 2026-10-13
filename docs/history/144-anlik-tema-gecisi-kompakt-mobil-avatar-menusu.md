### 9.144 Anlık tema geçişi + kompakt mobil avatar menüsü

- **Tema:** Bölüm 9.113'ün `.theme-transition` (300 ms renk geçişi) kaldırıldı; birçok öğenin kendi `transition-colors`'ı yüzünden her biri ayrı saatte soluyor, sayfa takılıyor gibi görünüyordu. Artık mod/palet değişiminde `withInstantSwitch()` (`theme-provider.tsx`) `<html>`'e kısa süre `.theme-instant` (`transition: none !important`) ekler, değişikliği uygular, reflow zorlar ve iki karede sınıfı kaldırır → geçiş anlık, hover/odak geri bildirimi etkilenmez.
- **Avatar menüsü (`account-menu.tsx`):** mobilde panel 15rem (`md`+ 18.5rem), satırlar `min-h-9` (`md`+ 11), grup başlıkları yalnız `md`+; kimlik bloğu artık tek bir profil bağlantısı (ayrı "Profilim" hapı ve grup içindeki yinelenen "Profilim" satırı kalktı), avatar 36px. Menü içeriği/davranışı aynı.
- Migration yok, yeni metin yok. tsc/lint temiz; tarayıcıda denenmedi.
