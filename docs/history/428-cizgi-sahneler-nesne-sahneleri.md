# 428 — Çizgi sahneler 45'e çıktı: nesne sahneleri ve sahnesiz kalan yerler

Önceki durum (`374-*`): 20 çizgi sahne, `EmptyState scene` yalnız ana boş durumlarda; yükleme hatası, "bulunamadı" ve birçok boş liste
ikon karosunda kalmıştı (~55 yer). Bu iş mockup üzerinde onaylanan 25 yeni sahneyi çizdi ve hepsini bağladı.

## Yeni sahneler (25)

Kimlikler `kinds.ts`'te, çizimler `components/line-art/scene-<ad>.ts`'te. Aria-label çevirisi `lineArt.<ad>Label` (TR+EN).

| Grup | Sahne → nerede |
|---|---|
| Yükleme hatası | `feedStalled` (bant: Ana Sayfa, Keşfet, konu, misafir akışı) · `focusJam` (projeksiyon: Odak) · `fishing` (olta: Skill/Space keşfi, profil alıntıları) · `cutString` (kopuk teneke telefon: ekip sohbeti/kanalları) · `halfBridge` (yarım köprü: ekip ve proje sayfası) |
| Bulunamadı | `invite` (yırtık bilet: topluluk/ekip daveti) · `locked` (kilitli kapı: Space bağlantısı) · `story` (sönmüş mum: hikâye) · `emptyFrame` (boş çerçeve: prompt içgörüleri) · `files` (dosya dolabı: ekip öğe/dosya/pano) · `mailbox` (posta kutusu: mesaj merkezleri) |
| Boş liste | `following` (teleskop) · `shelf` (kitaplık: konu sayfası, aramada prompt listesi) · `talk` (koltuklar: dock/ekip kanalı) · `stars` (kavanoz: yıldızlı mesajlar) · `filter` (süzgeç: İçeriklerim, Space sekmeleri, AI araçları) · `members` (kamp ateşi: üye/istek) · `archive` (çamaşır ipi: hikâye arşivi) · `sprout` (fide: etkileşim listesi, profil Beğenilenler) · `params` (mikser: hazır ayar parametreleri) |
| Profil sekmeleri | `notebook` (Promptlar) · `bottle` (İstekler) · `dominoes` (Workflow'lar) · `quoteBoard` (Alıntılar) · `toolbox` (Skill'ler); Ayar paketi mevcut `preset` sahnesinde kaldı |

Hata/bulunamadı ekranlarında mevcut başlık ve açıklamalar korundu (hepsi o durumu zaten doğru anlatıyor); yalnız ikon karosunun yerine sahne
geldi. `workflow` sahnesi hâlâ hiçbir yerde kullanılmıyor (profil Workflow sekmesi `dominoes` aldı).

## Nasıl çizildi — `scene-parts.ts`

Bu sahneler insan değil NESNE sahnesidir. Her biri 400 × 200'lük küçük bir SVG metni olarak yazılır (`ink(parent, markup)`): sınıflar
(`k` mürekkep çizgi, `p` kâğıt dolgu, `b/bf` mavi, `h/hf` turuncu, `gl/gb` ışık, `t` ince, `dash`) kitin ink/paper/`--la-*` yollarına çevrilir
(mürekkep filtresi, gece kâğıdı, tokenlar), iç stroke genişlikleri ×0,28 ölçeklenir ve grup `scale(2)` ile 800 × 400 uzayına oturur. Hareket
edecek parça `data-n` ile adlandırılır ve ortak döngüden `pose(parça, { x, y, r, s, ox, oy })` ile oynatılır — ikinci bir animasyon döngüsü ya da
CSS animasyonu YOKTUR. Hareketi azalt tek karesi `t = 3`'tür (`loop.ts`): düşen yıldız, sıçrayan balık, devrilen dominolar o anda anlamlı
bir konumda olacak şekilde periyotlar seçildi.

## Kurallar

- Yeni bir nesne sahnesi = `scene-<ad>.ts` (`defineScene` + `ink`) + `kinds.ts` + `scenes.ts` + `lineArt.<ad>Label` (`registry.test.ts` üçünü denetler).
- Sahneye hex renk yazılmaz; renk sınıfları `--la-*`'a çevrilir. Sahnede görünür metin yok.
- Ekrana sahne koymak: `EmptyState scene="…"`, `ProfileEmptyState scene="…"` (profil sekmeleri), `FeedGrid emptyScene="…"`.
- Bilerek ikon karosunda kalanlar: moderasyon/admin panelleri, tepki penceresi, "yalnız lider" satırı, Odak "akışın sonu".

## Doğrulama

`tsc` temiz; `registry.test.ts` + `i18n-dictionary.test.ts` geçti; 25 sahne bağımsız bir sayfada (kitle aynı kod, derlenmiş) açık ve koyu
modda çizildi ve gözle denetlendi, konsol hatası yok. Gerçek cihazda/gerçek sayfa akışında (yükleme hatası ekranlarını tetikleyerek)
DENENMEDİ. `tests/messaging-ui/run-line-art.mjs`'e 15–16 eklendi (geçersiz davet sayfasında `invite`: TR/EN etiket, 2:1, telefonda taşmaz, koyu + hareketi azalt tek kare). Aynı dosyadaki 11–12 bu çalıştırmada kırmızıydı: `/prompts/` ve `/workflows/` artık Keşfet'e yönleniyor (`419-*`), eski senaryo o adreslerde sahne arıyor. Bu işten önce de kırmızı olduğu ana dalda ayrıca DENENMEDİ; senaryolar güncellenmedi.
