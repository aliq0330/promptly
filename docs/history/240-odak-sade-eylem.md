# 240 — Odak: slayt yüzünde büyük eylem yok, bölüm noktaları düzeltmesi

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed`). Gerçek telefona (iOS Safari) karşı denenmedi: noktalardaki bozukluğun kök nedeni cihazda görülemedi, ekran görüntüsünden (iki komşu nokta uzamış hâlde) yarıda kalmış boyut geçişi olarak yorumlandı. İngilizce: yeni metin yok.

- `AlbumSlide`'ta tek büyük düğme (Kopyala / Ayrıntıları aç / Yanıtla) kaldırıldı; yüzde yazar, başlık, tür satırı, simge satırı ve "Bilgi" kalır.
- Bilgi sayfasında: prompt bloğundaki Kopyala + "Promptu incele" (Kopyala), "Ayrıntıları aç", ve açık istekte (kendi isteğin değil) `/create?answerRequest=` bağlantılı **Yanıtla** (birincil renkli, eylem satırının başında).
- `FocusChannelRail`: sabit yuva, anında boyut değişimi (geçiş yok), dokunma vurgusu kapalı; `changeChannel` 350 ms içinde tekrar çalışmaz (bir hareket = bir bölüm).
