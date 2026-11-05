# 335 — Hareketli ikonlar ve çıkış animasyonları (silme, kaydet, alt menü, küçük anlar)

**İstek (kullanıcı):** Tepki emojilerini kendimiz yaptığımız gibi (dış bağımlılık yok) silme, kaydetme ve mobil alt menü ikonları için de animasyon
olsun; sitede başka nerelerde olabileceği tartışıldı, `Promptly Hareket Atölyesi` mockup'ı (artifact) onaylandı, "hepsini yap".

**İlke (mevcut hareket dili korundu):** hareket bir durum değişimini ya da bir varışı anlatır, bir kez oynar, içerik yüzeyinde döngü yoktur;
sayfa açılışında hiçbir şey oynamaz; hareketi azalt açıkken süreler ≈ 0'dır ve son kare dinlenme karesidir; harici kütüphane yok.

## Parçalar
- **`components/ui/motion-icons.tsx`** — kendi SVG ikonları (lucide çizgi diliyle): `TrashIcon` (üzerine gelince kapak kalkar; `seq` artınca kapak açılır,
  içindekiler düşer, kapak kapanır), `BookmarkIcon` (alttan dolar + sıçrama + beş kıvılcım), `CheckDrawIcon` (çizilen tik), `PinIcon`, `BellIcon`, `SendIcon`,
  `SendArrowIcon`, `FollowIcon` (kişi+ → tik), alt menü: `HomeIcon`, `CompassIcon`, `CommunityIcon`, `FocusIcon`, `PlusIcon` (`open` → 135° ✕).
  Oynatma sözleşmesi: `seq` (0/verilmedi = dinlenme) her artışta svg `key` ile yeniden kurulur ve bir kez oynar.
- **`globals.css`** — `.mi-*` kuralları + keyframe'ler (`--mi-ease`/`--mi-spring`); `.mi *` `transform-box: view-box`.
- **`components/ui/exit-motion.tsx`** — `ExitMotion` (önce sağa kayıp solar 200 ms, sonra yükseklik kapanır 260 ms; `space-y-*` aralığı da kapanır; dinlenmede
  kırpma yok) + `useExitMotion().exit(id, commit)`: gerçek kaldırmayı `EXIT_MS` (460) sonra yapar, hareketi azalt açıkken anında; sökülürse bekleyen kaldırma yine yapılır.
- **`features/content/content-card.tsx`** — `useCardExit()`: kart önce küçülüp solar (260 ms), sonra `commit`; `commit` hata atarsa kart geri gelir; sağlayıcı yoksa anında.
- **`lib/dust.ts`** (`poofElement`), **`lib/use-motion-seq.ts`** (`useCompletionSeq`), **`lib/publish-celebration.ts`**, **`features/prompts/copy-events.ts`**,
  **`features/content/publish-attempt.ts`**.

## Nerede kullanıldı
- **Silme:** 30 dosyadaki `<Trash2>` → `TrashIcon` (menüler, düğmeler); yorum silme (yanıtı yoksa kayıp solar, yer tutucu bırakılmaz; yanıtlı yorum eskisi gibi yer tutucu olur),
  taslak listeleri (profil + çekmece), bildirim kartları/satırları (`use-notification-cards`: kart `EXIT_MS` listede kalır; "Geri al" çıkışı iptal eder), "Benden sil" mesajı,
  kart ⋮ menüsünden silme + koleksiyondan kaldırma (kart küçülür; başarısızsa geri gelir), Space panosu nesneleri toz olup dağılır (başarısızsa geri gelir).
- **Kaydet:** `SaveButton` → `BookmarkIcon` (kaydedilince sıçrar/kıvılcım; kayıt kalkınca dolgu boşalır).
- **Alt menü:** `MobileNav` — aktif çizgi TEK öğe ve sekmeler arasında kayar (`[data-nav-indicator]`; "+" yuvasını atlar), her sekmenin kendi ikonu YALNIZ aktif olunca oynar
  (render sırasında önceki aktif ile karşılaştırılır → ilk boyamada oynamaz), "+" menü açılınca ✕.
- **Küçük anlar:** Kopyala (çizilen tik + kopyalanan metni gösteren `ScrollablePrompt` bir kez renk alıp söner), bildirim zili (Realtime `incoming` artınca sallanır),
  gönder (mesaj/Odak yorumu = ok aşağıdan yeniden girer; bildirim yanıtı = kâğıt uçak), Takip Et (kişi+ → tik), form titremesi (`FormField` hata belirince ve her "Paylaş" denemesinde),
  "Paylaşıldı" kutlaması (4 oluşturma formu `announcePublished()`; yeni sayfada `PublishCelebration` halka+tik, yönlendirmeyi geciktirmez; yalnız yeni paylaşım, düzenleme/taslak değil),
  "Çalıştı mı?" (başparmak sıçrar, rozet oturum içinde Kanıtlanmış'a geçince büyüyüp parlar), Space "Sabitle" (raptiye düşer; liste açılışında oynamaz), `EmptyState` (ikon karosu yaylanır + üç pırıltı).
- **Zaten vardı, değişmedi:** `Tabs` kayan çizgisi (`data-tab-indicator`).

## Mockup'tan farkları (dürüst)
- Kartın küçük hâlinin yer imine UÇMASI yapılmadı: kaydetme kart üzerinde değil, "Kaydet" penceresinde tamamlanıyor (kaynak konum o anda bilinmiyor).
- Mesaj "Benden sil" yüksekliği kapanmaz (yalnız kayıp solar): balon aralığı `first:mt-0` gibi kurallara bağlı, sarmalayıcı yerleşimi bozardı.
- Mockup'taki yorum "toz" efekti yalnız Space panosunda; yorum/liste satırlarında çökme.

## Sınanan / sınanmayan
- `tsc`, `lint` (0 hata; 15 uyarının hepsi önceden vardı, `src`'de yok), `npm test` 933/933, `build` temiz.
- `tests/messaging-ui/run-motion.mjs` (ağ taklitli): alt menü çizgisi/ikon oynatma/"+" dönüşü/hareketi azalt.
- Silme, kaydetme, kopyalama vb. animasyonların görünümü gerçek cihazda/Safari'de DENENMEDİ; yalnız yapısal sözleşme sınandı.
- İngilizce: yeni kullanıcı metni yalnız "Paylaşıldı" (`motion.published`, TR+EN); diğerleri görsel.
- Migration yok.
