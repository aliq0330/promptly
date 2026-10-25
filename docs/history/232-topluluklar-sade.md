# 232 — Topluluklar: sade düzen (özellik eksiltmeden)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright: `run-communities` 66, `run-community-home` 38, `run-community-shelf` 7, `run-community-posts` 36, `run-groups` 36, `run-stories` 24, `run-focus-feed` 25 geçti; `run-spaces` 32 geçti (paylaşılan menü). **Gerçek Supabase'e / gerçek telefona karşı denenmedi.** İngilizce karşılık eklendi (`communities.page.searchOpen`; diğer metinler mevcut anahtarlar). Tasarım önce tuvalde çizildi (Spaces ile aynı kalıp, 231); kullanıcı "aynısını yap ama özellik eksiltme" dedi. **231'in (Spaces sade düzeni) üstüne kuruludur** — önce o birleşmeli.

## Ne değişti
- **Ortak `SectionMenu`** (`features/content/section-menu.tsx`, 231'deki `SpacesSectionMenu`'nün genel hâli): telefonda alt sayfa, masaüstünde açılır kutu; sayaçlı satır, bekleyen sayı varken düğmede nokta. Spaces, Topluluklar ve topluluk sayfası aynı bileşeni kullanır; `CONTROL_ICON_BUTTON` ortak simge düğmesi, `CompactViewToggle` tek Kart/Izgara simgesi (`useViewMode` — `ViewModeControls` ile aynı durum).
- **Topluluklar ana sayfası** (`communities-page.tsx`): büyük görünür başlık; tek kontrol satırı: **"Gönderiler ▾"** menüsü (Gönderiler · Keşfet · [Yönettiklerim] · Davet ve başvurular [sayaç]; eski balonların yerine, aynı bölümler ve adresler) · arama simgesi (alanı açar, ✕ kapatır; gönderince yine `/communities/all?q=`) · Kart/Izgara (Gönderiler ve Keşfet'te; listenin içindeki anahtar kalktı) · "+" (topluluk oluştur). Bekleyen davet kartı kontrol satırının hemen altında; "Topluluklarım" rafı daha büyük 4:3 kapaklarla (ad, üye sayısı, "N yeni" rozeti, "Tümünü gör" aynı). Ziyaretçi: menü/arama yok, yalnız "Topluluk oluştur" düğmesi + Keşfet listesi (aynı).
- **Topluluk sayfası** (`community-page.tsx`, `feed-tab.tsx`): hap sekmeler yerine **"Akış ▾"** menüsü (Akış · Etkinlikler · Üyeler [bekleyen istek sayacı] · Hakkında ve kurallar · Yönetim [yetkiye göre] — `accessibleTabs` aynı); aynı satırda sekmenin eylem yuvası: Akış'ta Kart/Izgara + "Gönderi oluştur" simgesi (`data-create-post`, `createPortal` ile `actionsEl` yuvasına; diğer sekmeler yuvayı kullanmaz). Bant, Sohbeti aç / Katıldın, bekleyen istek kısayolu, hikâye şeridi, "Tüm üyeler içerik paylaşabilir" notu, sabit gönderiler, aside aynı.

## Eksiltilmeyenler (kasıtlı)
Tüm bölümler ve erişim kuralları, davet/başvuru sayaçları, bekleyen istek kısayolu, davet kartı, Topluluklarım rafı + "N yeni", arama → Tüm topluluklar, ziyaretçi akışı, Kart/Izgara tercihi, gönderi oluşturma (iki yol), tüm sekme içerikleri.

## Notlar
- Taslakta topluluk içi için arama düğmesi de çizilmişti; böyle bir arama olmadığı için eklenmedi.
- Testlerde üst düzey sekme seçicileri (`getByRole("tab")`) menü yardımcılarına (`pickTab`/`hasTab`/`tabNames`…) taşındı; içteki alt sekmeler (Üyeler/Yönetim bölümleri) aynı kaldı, yalnız `tablist` sırası kaydı.
