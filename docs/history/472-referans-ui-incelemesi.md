# 472 — Referans arayüz incelemesi (substack.com) ve uyarlama tuvali

**Durum:** inceleme + öneri; uygulama kodu değişmedi.

Kullanıcı isteği: substack.com'un ekranlarını, bileşenlerini ve tasarım dilini (boşluk, başlık boyutu, açılır menü, alan, mobil/masaüstü) incelemek, Promptly'deki karşılıklarıyla kıyaslamak, tasarım dilini A'dan Z'ye bir yere kaydetmek ve her bileşeni tuvalde ayrı ayrı mockup olarak göstermek.

## Ne yapıldı
- Herkese açık sayfalar 390/820/1440 px'te Playwright ile açıldı; hesaplanmış stiller ve CSS değişkenleri okundu (betikler `docs/design-references/olcum/`).
- Yazılı rehber: `docs/design-references/substack-tasarim-dili.md` (renk, tipografi, köşe, gölge, boşluk, bileşen kataloğu, duyarlı davranış, Promptly karşılaştırması, uyarlama önerileri).
- Tuval (Design türü, 18 pano): referans ölçümleri (R1–R9), karşılaştırma (K1–K2), Promptly uyarlamaları (U1–U7). Kaynak: `docs/mockups/referans-tuval/`.

## Sınırlar
Giriş gerektiren ayarlar, gerçek bildirim listesi, sohbet balonları, hover durumları ve karanlık mod ölçülemedi; U3 (bildirimler) ve U4 (ayarlar) bu yüzden öneridir. Ekran görüntüleri üçüncü taraf içerik olduğu için depoya konmadı.

## Karar bekleyenler
Önerilen beş fikir (pencere köşesi 20 + odak halkası, Mesajlar listesi segmenti, bildirim düz satırları, detay hapları, ayarlar sütunu) için uygulama kararı kullanıcıdadır; Promptly'nin bilinçli farkları (hap düğme, ≥3:1 alan kenarlığı, mavi eylem/turuncu "senin olan", etiketli ray/alt menü) korunur.

## Ek: oluşturma akışları (G1–G5)
Kullanıcı bir referans ekran görüntüsü paylaştı (yeni grup sohbeti alt kartı) ve Ekip / Topluluk / Space oluşturmanın telefonda modal değil ayrı tam ekran sayfa, tablet/masaüstünde modal olmasını istedi. Tuvale G satırı eklendi (referans, telefon sayfaları, telefon durumları, masaüstü pencereleri, tablet pencere); karar ve alan listesi `docs/design-references/substack-tasarim-dili.md` Bölüm 10'da. Öneri; kod değişmedi.
