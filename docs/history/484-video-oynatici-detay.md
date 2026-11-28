# 9.484 — Detay sayfası video oynatıcısı (Minimal)

Kullanıcı mockup'ta iki düzen gördü (çubuk altta / Minimal) ve **Minimal**'i seçti: tarayıcının kendi `controls` çubuğu yerine detay ("local") sayfalarındaki videolar sitenin kendi oynatıcısıyla oynar.

## Yer

- `components/ui/media-player.tsx` → `MediaPlayer` (`src`, `poster`, `fill`, `className`). Kullanıldığı yerler: prompt detay sayfasındaki video çıktı (`PromptPlayableOutput` → `ResultTypePreview size="detail"`) ve sonuç detay sayfasının kapağı (`result-detail-view.tsx`, `fill`). Ses (audio) detayı bilerek yerel çubukta KALDI; kart ve Odak'a konmaz (orada ilerleme çubuğu yok, `MediaPlayButton` + `card-playback`).
- Kurallar saf `lib/media-player.ts` (birim testli, `media-player.test.ts`): süre metni, çizgi/işaretçi hesabı, hız metni (TR virgül), klavye tablosu.

## Davranış (Minimal)

- Resmin kendisi oynat/duraklat hedefidir (çift dokunma tam ekran); ortadaki yuvarlak düğme kartlardaki AYNI `MediaPlayButton`'dır.
- Altta TEK ince ilerleme çizgisi (3 px; üstüne gelince/odakta/sürüklerken 6 px), 36 px yüksekliğinde dokunma alanı, süre balonu, `role="slider"`. Çizginin dolgusu doğrudan `<video>`'dan boyanır (rAF; her karede React yeniden çizmez).
- Çizginin üstünde küçük satır: süre · hız (0,5×–2×, `PopoverMenu`, seçili satırda işaret) · ses (yalnız bu oynatıcıyı sessize alır) · tam ekran (iPhone'da `webkitEnterFullscreen`). Satır duraklatılmışken hep görünür; oynarken 2,4 sn hareketsizlikten sonra çekilir, fare/odak/tuş getirir.
- Klavye: Boşluk/K oynat, ←/→ 5 sn, J/L 10 sn, Home/End, 0–9 (onda biri), M ses, F tam ekran. Odaktaki düğme Boşluk/Enter'ı kendine alır.
- **Ses**: bu sayfada kişi oynat'a bastığı için video SESLİ başlar; site geneli otomatik oynatma tercihi (`lib/media-sound.ts`, 483-*) bu oynatıcıyı etkilemez.

## Ortak bileşen değişikliği

`PopoverMenu`: `icon` artık isteğe bağlı (yoksa 16 px boş yuva, etiketler hizalı kalır) ve menü tam ekran öğesi varsa ONUN içine taşınır (`document.fullscreenElement ?? document.body`); aksi hâlde tam ekranda menü görünmezdi.

## Doğrulama

`media-player.test.ts` (8 test) + `tsc`, `lint`, `design-metrics`, `npm test`, `npm run build`. Ağ taklitli Playwright `run-media-player.mjs` (CI `ui` kesitine eklendi): 10 senaryo — yerel çubuk yok, ortada düğme + 3 px çizgi, oynat/duraklat/sarma/sürükleme, klavye, hız menüsü, kontrollerin çekilmesi, sona gelme, 390 px, İngilizce, prompt detay sayfası. `HTMLMediaElement` taklitlidir (süre 24 sn; gerçek video çözülmez); gerçek tarayıcıda gerçek videoyla, iOS Safari tam ekranı ve fiziksel cihaz DENENMEDİ.

İngilizce karşılıklar eklendi (`mediaPlayer.*`; ses/oynat etiketleri mevcut `focusFeed.*` anahtarlarını kullanır).
