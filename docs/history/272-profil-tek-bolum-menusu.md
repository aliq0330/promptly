# 272 — Profil: tek bölüm menüsü (Sade, ikinci adım)

**Durum: uygulandı (repoda), yalnız istemci kodu, migration yok.** Kullanıcı Mesajlar/Topluluklar/Spaces'teki "Gönderiler ▾ + arama" kontrol satırını profile de istedi; Artifact mockup'ı (3 ekran: başkasının profili, menü açık, kendi profilim) onaylandı, sonra uygulandı. 243'teki Sade başlık korunur; değişen bölüm gezinmesidir.

## Kullanıcı gözüyle
- **Sekme çubuğu + "Daha fazla ▾" + bölüm başlığı satırı KALKTI.** Yerine tek kontrol satırı: solda `SectionMenu` hapı (etkin bölümün adı + ▾; dokununca telefonda alttan sayfa, masaüstünde açılır kutu — tüm bölümler, sayılarıyla, iki ayırıcı: yaptıkları · kütüphane [Spaces / kendi profilde Taslaklar · Kaydedilenler · Beğeniler / ziyaretçide Koleksiyonlar] · Hakkında), sağda arama · filtre · Kart/Izgara simgeleri; kendi profilde son simge "+" (Oluştur).
- **Arama simgesi** (Promptlar/Beğeniler): hapın altında yuvarlak arama alanı açar (yazı Filtre rozetini sayar); × ile temizlenir. Eski Filtre penceresinden arama alanı çıktı (`ProfileFilterControl showSearch={false}`).
- **Eylemler:** Takip Et / Profili düzenle 44 px büyük hap; Mesaj, Paylaş, ⋮ (ve kendi profilde Ayarlar) yumuşak dolgulu yuvarlak düğmeler, kenarlıksız (`ProfileMoreMenu triggerClassName`).

## Kodda
`features/profile/profile-view.tsx` (`menuItems`, `data-profile-controls`, `data-profile-search`, `data-profile-search-field`, `data-profile-create`), `profile-actions.tsx`, `profile-more-menu.tsx`, `messages/message-button.tsx` (compact: yumuşak dolgu). Çeviri: yeni metin yok (`profile.searchPlaceholder`, `profile.sectionsAriaLabel` yeniden kullanıldı; `profile.moreSections` artık kullanılmıyor).
Test: `run-profile-collections` 7 ve 12 yeniden yazıldı; `run-hscroll` 4, `run-pagination` 1 ve 11 menüden seçer.

## Bilinçli sınırlar
- Başkasının profilinde Paylaş simgesi ayrı kalır (mockup'ta ⋮ menüsüne alınmıştı); kendi profilde ⋮ yerine Ayarlar dişlisi korundu — işlevi kaybetmemek için.
- Gerçek Supabase'e / oturuma / iOS Safari'ye karşı denenmedi.
