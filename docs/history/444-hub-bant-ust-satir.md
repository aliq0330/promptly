# 444 — Hub detay bandı: üst satır (geri oku sola, ⋮ sağ üste)

**Sorun (telefon, topluluk sayfası):** ⋮ menüsü eylem düğmelerinin altında, bandın SOL altında duruyordu; menü paneli `right-0` ile sola açıldığı için ekran dışına taşıp kırpılıyordu ("yala" görünümü). Geri oku ve "Topluluk · Alan" etiketleri de başlık sütununa girintili duruyordu.

**Çözüm (`HubDetailBand`, `features/hub/hub-kit.tsx`):** bandın tam genişlikli bir ÜST SATIRI var — solda geri oku + kicker etiketleri (bandın soluna dayalı), sağ üst köşede `menu` (`data-hub-band-top` / `data-hub-band-menu`). `menu` artık eylem satırında değil; sağa hizalı olduğundan panel ekran içinde açılır. `actions` içine menüyü koyan Space/Ekip bantları değişmedi (yalnız geri oku/etiketler sola hizalandı).

**Test:** `run-community-home.mjs` senaryo 28 — geri oku sola, ⋮ sağ üste dayalı, menü paneli 390 px içinde.
Gerçek cihazda denenmedi (ağ taklitli Chromium, 390 px).

İngilizce karşılık: yeni metin yok.

**Ek (Ekip bandı):** Ekip bandının ⋯ menüsü de `actions`'tan çıkarılıp `menu` prop'una taşındı (`features/teams/team-band.tsx`); artık o da sağ üst köşede. Davet/yüz yığını yoksa boş eylem satırı çizilmez. Test: `run-team-hub.mjs` senaryo 38.
