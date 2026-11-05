# 9.337 — Kart | Izgara görünüm seçicisi ve Ana Sayfa yazma çubuğu kaldırıldı

Durum: kodlandı ve yerelde sınandı (migration YOK, yalnız istemci). Gerçek Supabase'e/cihaza karşı DENENMEDİ.

## İstenen davranış

- Ana Sayfa'daki "Bugün ne ürettin? Promptunu paylaş…" satırı (avatar + hap biçimli kutu) kalkar. Oluşturma girişi alt menüdeki "+" ve masaüstündeki "Oluştur"da durur.
- Kart | Izgara görünüm değiştirici sitenin HİÇBİR yerinde olmaz; her listede yalnız varsayılan, normal geniş kart (`ContentGrid`/`FeedGrid`) görünür.

## Ne değişti

- Silindi: `features/content/view-mode-store.ts` (`useViewMode`, `promptly-view-mode`, `?view=focus`), `view-mode-switcher.tsx` (`ViewModeSwitcher`/`ViewModeControls`/`CompactViewToggle`/`MobileViewToggle`), `features/focus/focus-grid.tsx` (`FocusGrid`), `features/feed/feed-items-view.tsx` (yalnız iki görünüm arasında seçiyordu; çağıranlar doğrudan `FeedGrid` kullanır).
- Seçici bağlı olan her yer sadeleşti: Ana Sayfa/Keşfet/konu sayfaları (`SectionNav`, `ListToolbar` + Filtre penceresindeki "Görünüm" bölümü), tür listeleri (`ContentListPage` `focusKind` prop'u kalktı), profil, İçeriklerim (`entry.item` alanı kalktı), arama, koleksiyon/Kaydedilenler, Takip Ettiklerim, Topluluklar ana sayfası + topluluk akışı, profil Hazır ayarlar. `ListControlRow` `showView` prop'u kalktı.
- `postFeedItem` (`communities/content-summary.ts`) yalnız Izgara içindi, silindi.
- Ana Sayfa: `HomeIntro` oturumlu kullanıcıda hiçbir şey çizmez; misafir vitrini (`GuestShowcase`) ve kompakt tanıtım aynen kalır.
- Çeviri anahtarları silindi: `home.composerPlaceholder`, `view.*` (7), `toolbar.view` (hepsi TR+EN çifti; yeni metin eklenmedi, bu yüzden yeni İngilizce karşılık gerekmedi).
- Kayıtlı eski `promptly-view-mode` değeri artık okunmaz; localStorage'da zararsız kalır.

## Dokunulmayanlar

- Odak (`/focus`) ayrı bir tam ekran sayfadır, etkilenmedi.
- Spaces ana sayfasının kendi Izgara/Liste görünümü (`spaces.home.viewGrid`) ayrı bir özelliktir, kalır.

## Testler

`run-focus-feed` (1: seçici ve yazma çubuğu yok), `run-profile-collections` (8), `run-communities` (34) güncellendi; `run-profile-collections` 13/13, `run-communities` 68/68, `run-focus-feed` 34/35. Düşen 9. senaryo (Odak'ta Kaydet → pencere) bu değişiklikten ÖNCEKİ sürümde de aynı şekilde düşüyor: 336 yer imini tek dokunuşluk kaydetmeye çevirdi, test hâlâ pencere bekliyor — bu işte düzeltilmedi.
