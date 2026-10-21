# 208 — Alt menü ve sabit eylem satırı kaydırınca yarı saydam kalır

**Durum:** uygulandı (yalnız istemci; migration yok). 204'teki "alt menü aşağı kayıp kaybolur" davranışının yerini alır.

Kullanıcı isteği: aşağı kaydırınca alt menü tamamen kapanmasın, şeffaf olsun; "local" (detay) sayfalarındaki beğeni/yorum çubuğu da aynı olsun.

- **Alt menü** (`[data-app-nav]`): `html[data-chrome-hidden]` iken artık aşağı kaymaz, `pointer-events` kapanmaz; yalnız `opacity: 0.5` olur (320ms geçiş). Odaklı kontrol varsa (`:focus-within`) opak kalır. Yukarı kaydırınca opak.
- **Detay eylem satırı** (`[data-detail-dock]`, yalnız telefon): alt menüyle birlikte en alta inmez, menünün üstünde (`translateY(-4rem)`) kalır; aynı `opacity: 0.5`. `animate-fade-in`'e `animation-fill-mode: backwards` eklendi — `both` animasyon sonrası opaklığı sabitleyip CSS kuralının üstünü örtüyordu.
- **Üst menü** eskisi gibi (yalnız `lg` altı) yukarı kayıp kaybolur; Ana Sayfa/Keşfet'in daralan şeridi (207) onun yerine çıkar.
- Tablet/masaüstünde alt menü yok; sabit eylem satırı da orada yarı saydamlaşmaz (yalnız telefon).

Doğrulama: `run-detail-pages` 45/45 (4c yeni davranışı doğrular: üst menü kayar, alt menü yerinde `0.5`, sabit satır menünün hemen üstünde `0.5`, tıklanabilir; yukarıda ikisi de `1`); Keşfet'te kaydırınca alt menü %50 görüntüsü ekran görüntüsüyle bakıldı. **Denenmedi:** gerçek cihaz / iOS Safari. Yeni metin yok (İngilizce karşılık gerekmedi).
