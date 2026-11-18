# 437 — Odak prompt kartı: yerden kopuk yüzen alt pencere

**Durum:** uygulandı (yalnız istemci; migration YOK). Ağ taklitli Playwright'ta (`run-focus-feed` 36/36, `run-skills-social` senaryo 31) ve birim testlerinde (`focus-sheet.test.ts`) sınandı.
**Gerçek telefonda (iOS Safari dokunmatik sürükleme, klavye, güvenli alan, kaydırma ivmesi) DENENMEDİ.** İngilizce karşılık eklenmedi çünkü yeni metin yok (✕ `common.close`); kullanılmayan `focusSheet.collapse` anahtarı silindi.

## Neden
Kullanıcı, Odak'taki kartın "Odak Alt Kart" taslağındaki gibi (artifact) olmasını istedi: diğer alt pencerelerle (`Modal` sheet) aynı davranış, tek fark alttaki boşluk %3.

## Davranış
- Kart yerden **%3 yukarıda**, yanlardan **10 px içeride**, dört köşesi yuvarlak (`rounded-xl`, `card-flat`, `shadow-pop`); arkada `bg-scrim` karartısı (açıklığa göre soluklaşır). Sahne artık küçülmez (eski "görsel üstte küçülür" CSS'i kalktı).
- Yükseklik **yarım %75 / büyük %90** (sahnenin yüksekliğine göre, `lib/focus-sheet.ts` `FOCUS_SHEET_*`). Kapalıyken yalnız alttaki prompt şeridi görünür.
- Başlık satırı: avatar · başlık · "@kullanıcı · araç · zaman" · ✕; altında **sekmeler yarımda da** görünür (Prompt · Yorumlar · Sonuçlar · [Sürümler]). Küçük başlık (`CompactHeader`) ve "Kartı küçült" düğmesi kalktı. "Çalıştı mı?" oyu yarımda da açıktır; "Kanıtlanmış · %93" satırı prompt metninin üstündedir.
- **Sürükleme:** tutamak (28 px, tam genişlik), başlık, sekmeler, alt çubuk ve içerik kartı sürükler; sekmeye dokunmak seçer, 6 px'ten fazla çekmek sürükler (ardından gelen tıklama bastırılır). Yarımdayken yukarı çekmek büyütür, içerik kaymaz; %90'da içerik kayar, en üstteyken aşağı çekmek küçültür (`focusSheetDrag`). Metin alanı/kaydırıcı/seçim üzerinde sürükleme başlamaz.
- **Bırakma** (`focusSheetRelease`): hız 200 ms ileri izdüşürülür; yarımın %70'inin altı → kapat, yarımdan büyüğe giden yolun üçte birinin üstü → büyük, aksi → yarım.
- Karartıya dokunmak, Esc ve ✕ kartı kapatır (340 ms aşağı kayarak). Klavye açıkken kart klavyenin hemen üstünde durur, kalan yüksekliği aşmaz.
- Yükseklik/konum sürükleme sırasında DOM'a doğrudan yazılır (her harekette yeniden çizim yok); `state` prop'u yerleşen boyuttur, dışarıdan değişirse (rayda yorum düğmesi) kart onu izler.

## Kod
`features/focus/focus-post-card.tsx` (`FocusPostSheet` yeniden yazıldı; `CardBody` modu `sheet|side`), `focus-feed.tsx` (`onStep` → `onSnap`), `focus-scene.tsx` (sahne küçültme kuralları kalktı), `lib/focus-sheet.ts` (+ testler).

## Bilinçli sınırlar
- Kartın içi `touch-action: none` ve kaydırma JS ile yapılır (artifact'taki gibi): dokunmatikte içerik kaydırma **ivmesi yok**. Gerçek cihazda elle denenmeli.
- Masaüstü yan paneli değişmedi.
