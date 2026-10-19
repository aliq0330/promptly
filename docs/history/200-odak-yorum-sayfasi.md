# 200 — Odak: alttan açılan yorum sayfası (Instagram tarzı)

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e, gerçek telefona (özellikle iOS Safari klavyesi) karşı denenmedi.

## Neden
Kullanıcı Instagram'ın yorum ekranını örnek gösterdi: "yorumlara tıklayınca hikâye alanı yukarı gitsin, yorumlar alttan açılsın". Önceden Odak'taki yorum düğmesi detay sayfasının `#comments` bölümüne gidiyordu (Odak'tan çıkılıyordu).

## Yapılan
- **Tek yorum mantığı, iki yerleşim:** `CommentSection`'ın bütün mantığı (yükleme, beğeni + geri alma, her derinlikte yanıt, düzenleme, silme, bildirimden vurgulama, sayaç deposu) `features/prompts/use-comment-thread.ts` hook'una taşındı; detay sayfaları aynı görünür (yalnız taşındı). `CommentNode`'a `layout: "sheet"` eklendi (`SheetCommentNode`): avatar · kullanıcı adı + zaman · metin · "Yanıtla" (+ düzenle / sil / şikâyet), kalp ve sayısı sağda, "— N yanıtı göster"; yanıtlar bir kez girintilenir, daha derini "@üst" ile gösterilir.
- **`FocusCommentsSheet`** (`features/focus/focus-comments-sheet.tsx`): telefonda ekranın alt ~%65'i (yuvarlak üst köşeler, tutamaç), `md`+ sağda 420px panel. Başlık "Yorumlar · N", X; liste; **hızlı emoji satırı** (❤️ 🙌 🔥 👏 😢 😍 😮 😂 — yazma kutusuna ekler); **tek yazma kutusu** ("Bunun hakkında ne düşünüyorsun?", @bahsetme önerileri kutunun ÜSTÜNDE açılır — `MentionInput suggestionsPlacement="above"`), gönder düğmesi yazı varken görünür. "Yanıtla" kutuyu yanıta çevirir (`@ad ` hazır yazılır, "@ad kişisine yanıt veriyorsun ×" çipi, satır vurgulanır). Misafir okur; yazma/yanıt/emoji ortak giriş penceresini açar. Kapatma: X, Esc (önce yanıt modu kapanır), tutamacı aşağı sürükleme (mesafe ya da hızlı fiske), üstteki gönderiye dokunma. Klavye açılınca (`visualViewport`) sayfa yukarı kayar. Odak açılınca odak sayfaya, kapanınca yorum düğmesine döner.
- **Gönderi yukarı gider** (`FocusScreen`): telefonda sayfa açıkken gönderinin MEDYASI (`object-contain` ile gerçekten boyanan kutusu ölçülerek) sayfanın üstündeki alana sığdırılıp ortalanır (`transform`, 300ms); yazılar, eylem rayı ve üst çubuk çekilir (`data-comments-open` + `HIDE_WHILE_COMMENTS`), kaydırma kilitlenir, video oynamaya devam eder. `md`+ gönderi panelin solunda kalır (`mr-[420px]`).
- Raydaki yorum düğmesi (`FocusCommentButton`) aynı canlı sayacı (`useCommentCountDelta`) gösterir; yeni yorum sayacı hem sayfada hem rayda artırır.
- Küçük ortak değişiklikler: `MentionInput` dış `ref` + `suggestionsPlacement`; `MentionSuggestions` `placement`.
- Çeviri: `focusComments.*` — TR + EN.

## Sınırlar
- Yorumlar Odak'ta yalnız normal içerikte (dört tür); topluluk başvuru gönderileri Odak'ta yok.
- iOS Safari'de klavye ve sürükleyerek kapatma gerçek cihazda denenmedi.
- Şikâyet düğmesi satırda metinli (`ReportButton`'un mevcut görünümü).

## Sınama
`tsc`, `lint` (0 hata), `npm test`, `next build --webpack`; `run-focus-feed.mjs` 23 senaryo (18–23 yorum sayfası: açılış + küçülme + menülerin çekilmesi + liste düzeni, emoji + gönderme + sayaç, yanıt modu + üst yoruma bağlanma + yanıtları açma, yorum beğenisi + üç kapatma yolu, misafir, masaüstü panel + İngilizce); detay sayfaları `run-detail-pages` (yorumlar dahil) değişmeden geçer.
