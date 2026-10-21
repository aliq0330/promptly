# 206 — Ana Sayfa görünüm sekmeleri sabitlenir

**Durum:** uygulandı (yalnız istemci; migration yok).

Ana Sayfa'daki "En yeni · Popüler · Takip · Etiketlerim" sekme satırı akış kaydırılırken ekranda kalır:

- Üst menü görünürken (`lg+`'da her zaman, `lg` altında yukarı kaydırırken) satır menünün hemen altında durur (`top: 4rem`).
- `lg` altında aşağı kaydırınca üst menü kayıp gider (`html[data-chrome-hidden]`, bkz. 204) ve satır onun yerine, en üste (`top: 0`) çıkar; geçiş üst menüyle aynı 320ms.
- Üst menüde odak varsa (menü ekranda kalır) satır da altında kalır.

Uygulama: `FeedTabs` (`layout="home"`) sekmeleri `ListToolbar` içinden çıkarıp doğrudan `<section>`'a koyar — `sticky` öğenin kapsayıcısı tüm akış olmalı; `data-sticky-under-header` özniteliği + `globals.css` kuralı. Arka plan yarı saydam + bulanık (üst menüyle aynı dil). Filtre/Kart·Izgara satırı sabitlenmez.

Yeni bir sayfada "üst menünün altına sabitlenen" öğe gerekirse aynı özniteliği kullan (el ile `top-16` yazma — menü kayınca boşluk kalır).

**Denendi:** ağ taklitli Playwright, 390px ve 1280px (kaydırınca/yukarı dönünce sekme `top` değeri: telefonda 0 → 64, masaüstünde hep 64). Gerçek Supabase/cihazda (iOS Safari) DENENMEDİ. i18n: yeni metin yok.
