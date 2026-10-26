# 240 — Odak: slayt yüzünde büyük eylem yok, bölüm noktaları düzeltmesi

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed`). Gerçek telefona (iOS Safari) karşı denenmedi: noktalardaki bozukluğun kök nedeni cihazda görülemedi, ekran görüntüsünden (iki komşu nokta uzamış hâlde) yarıda kalmış boyut geçişi olarak yorumlandı. İngilizce: yeni metin yok.

- `AlbumSlide`'ta tek büyük düğme (Kopyala / Ayrıntıları aç / Yanıtla) kaldırıldı; yüzde yazar, başlık, tür satırı, simge satırı ve "Bilgi" kalır.
- Bilgi sayfasında: prompt bloğundaki Kopyala + "Promptu incele" (Kopyala), "Ayrıntıları aç", ve açık istekte (kendi isteğin değil) `/create?answerRequest=` bağlantılı **Yanıtla** (birincil renkli, eylem satırının başında).
- `FocusChannelRail`: sabit yuva, anında boyut değişimi (geçiş yok), dokunma vurgusu kapalı; `changeChannel` 350 ms içinde tekrar çalışmaz (bir hareket = bir bölüm).

## Ek: noktalar neredeyse görünmez
Kullanıcı bölüm noktalarının durgunken neredeyse görünmez, kaydırırken görünür olmasını istedi (önceki bozukluğun animasyon kaynaklı olduğu doğrulandı, şimdi sorun yok). Rail durgunken `opacity-[0.12]`, dikey kaydırma sürerken ve bölüm değişiminden sonra ~1,1 sn (adın göründüğü süre) tam görünür; üstüne gelince/odaklanınca da görünür (masaüstünde tıklanabilsin). Yalnız opaklık 300 ms geçer, boyut geçişi yok.
