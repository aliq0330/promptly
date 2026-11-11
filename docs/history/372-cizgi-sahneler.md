# 372 — Çizgi sahneler (line-art): Meydan · Kayıp prompt · Paylaşma anı

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Birim `src/lib/line-art/line-art.test.ts` 4/4, ağ taklitli `run-line-art` (10 senaryo); gerçek cihazda/performans ölçümüyle DENENMEDİ.**

Kullanıcı `github.com/JDhruv14/line-art-animation` deposunu araştırmamı istedi; önerdiğim "Promptly meydanı" fikrini üç örnekle prototipledim (artifact), kullanıcı "merge et" dedi.

## Ne
Canlı SVG çizgi sahneler: mürekkep = `--color-text`, kâğıt = `--color-surface`, düz renkler marka mavisi + kalp turuncusu + sahneye özel sönük kumaş tonları. Koyu mod = gece (güneş batar, ay/yıldız, pencere ve lambalar tek tek yanar; geçiş ~1,5 sn).

| Sahne | Yer | Hikâye |
|---|---|---|
| Meydan | Giriş/kayıt panelinin altı (yalnız `lg`+ ve pencere ≥980 px yüksekse; coverflow aynen duruyor) | Saat kulesi, kafe, prompt panosu; biri panoya kart asar, turuncu "yeni" noktası + kalp; dokununca kişi el sallar, güvercinler kaçıp çatıya konar; imleç = rüzgâr (bayraklar, ağaç, kartlar). |
| Kayıp prompt | `NotFoundBlock` (detay sayfalarının "bulunamadı"sı) + sitenin 404 sayfası (`NotFoundForwarder`) | Rüzgâr bir prompt kartını sürükler, biri yakalayacakken kaçar, kafa kaşıma + "?"; kapı numarası 404; tabela okları Ana Sayfa (ev) / Keşfet (büyüteç). |
| Paylaşma anı | Karşılama turu (`WelcomeTour`) penceresinin başı, adımlar arasında yeniden kurulmaz | Parkta iki kişi; kart el değiştirir, kalp, okumak için kaldırma, şapka selamı, yollarına devam. |

## Nasıl
- **Kütüphane** `src/lib/line-art/{ink,gait,motion}.ts` — upstream'den kopya (MIT, `LICENSE` yanında, dosya başında atıf). `daynight.ts` ALINMADI (hex paletli; gece/gündüz token'lardan gelir). Saf kol yardımcıları `arm.ts` (birim testli).
- **Sahneler** `src/components/line-art/` — `figure.ts` (genelleştirilmiş yürüyen kişi: palto/elbise, saç/şapka/kasket, atkı, el hedefi, elde taşınan nesne), `scene-common.ts` (sahne kabı, gece yanan pencere, güvercin, gök), üç sahne, `loop.ts` (TEK rAF döngüsü; ekranda olmayan sahne çizilmez; sahne kalmayınca durur; hareketi azalt = tek dinlenme karesi, mod değişince yeniden çizilir; gece = sahnenin `.dark` içinde olması), `scenes.ts` (dinamik import ile yüklenen giriş).
- **React** `LineArtScene({ kind, className })` — çizim kodu yalnız gerektiğinde yüklenir (ayrı parça), boyut/kırpma className'in en-boy oranıyla (`preserveAspectRatio slice`). `components/ui/detail-skeleton.tsx` features'a bağlanmasın diye sahneler `components/line-art/` altında.
- **Renkler** `globals.css`: `--p-scene-glow`, `--p-scene-cloth-1..3`, `--p-scene-legs` (açık + `.dark`) ve `.line-art` üstünde `--la-*` takma adları. Bileşenlerde hex yok.
- **Metin**: `lineArt.*` anahtarları TR+EN (sahne etiketleri + Meydan ipucu). "404" sayıdır, çevrilmez. Telefonda ipucu satırı gizli.
- Upstream köy sahnesinden (Japon sokağı) hiçbir şey alınmadı; figürler/sahneler Promptly için yeni çizildi.

## Bilinçli sınırlar
- Mürekkep filtresi (`feTurbulence` + `feDisplacementMap`) her karede tüm sahneye uygulanıyor; zayıf telefonda maliyeti ÖLÇÜLMEDİ (§8.13). Gerekirse ilk adım filtreyi telefonda kapatmak.
- Meydan yalnız uzun masaüstü penceresinde görünür (çoğu dizüstünde görünmez); coverflow'un yerine geçmedi.
- Sahnede dokunuşlar yalnız süs: hiçbir şey açılmaz/kaydedilmez.
- Gerçek iPhone/Safari'de dokunma ve performans denenmedi.
