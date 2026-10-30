# 277 — Kart başlığı ve "tür · araç" satırı her zaman görünür

**Durum:** uygulandı, yalnız istemci kodu (migration yok). Ağ taklitli Playwright'ta sınandı (`run-card-title` 4/4; kart gösteren 21 paket geçti: `run-home-motion` 10/10, `run-discover` 9/9, `run-feed-filters` 18/18, `run-pagination` 16/16, `run-detail-pages` 45/45, `run-quotes` 12/12, `run-community-posts` 36/36, `run-communities` 66/66, `run-profile-collections` 13/13, `run-reactions` 11/11, `run-interest` 12/12, `run-feed-scroll` 3/3, `run-spaces` 32/32, `run-space-posts` 8/8, `run-focus-feed` 34/34, `run-search-notifications` 14/14, `run-preset-try` 10/10, `run-shared-cards` 11/11, `run-create-destination` 16/16, `run-exchange` 38/38, `run-hscroll` 5/5). Gerçek telefona / iOS Safari'ye karşı denenmedi.

## Karar
Kullanıcı dört yerleşim (A–D mockup) arasından **A**'yı seçti: görselin alt kenarında koyu degrade, üstünde "GÖRSEL PROMPT · tavsiye edilen araç" ve büyük başlık — bugüne dek yalnız üzerine gelince/odaklanınca (telefonda hiç) görünen katman kalıcı oldu. **"@kullanıcı · zaman" satırı görsele yazılmaz** (yazar zaten altındaki satırda); `meta` ekran okuyucu için `sr-only` kaldı.

## Değişen
- `ContentCardPost` (`features/content/content-card.tsx`): katmandan `opacity-0` + `group-hover` / `group-focus-within` geçişi kalktı; `meta` `sr-only` paragraf. Kapsam: kartın kabuğu olduğu için PromptCard, RequestCard, WorkflowCard, PresetCard, QuoteCard, ApplicationCard, Spaces keşif kartı hepsi aynı davranır. `titleInArt` kartlar (başlığı sanatın içinde çizenler: metin yüzeyli istek/workflow/hazır ayar/alıntı) katmanı yine `sr-only` tutar — başlık iki kez çizilmez.
- Çok görselli promptun ve workflow kapağının "+N" çipi sol alttaydı ve hover'da gizleniyordu; artık başlıkla çakışacağı için SOL ÜSTE taşındı, hep görünür (`OutputThumbnailStrip`, `WorkflowCard`). Sağ üstte tür simgesi, sağ altta durum rozetleri (başlık satırı `pr-24` ile ona yer bırakır) değişmedi.
- Kart doküman yorumları (`ContentCardPost`, `PromptCard`, `RequestCard`) güncellendi; CLAUDE.md §4 kart tarifi güncellendi.

## Doğrulama
`tests/messaging-ui/run-card-title.mjs` (4): telefonda katman hover olmadan tam görünür (`opacity` 1), başlık görselin içinde ve beyaz, kicker "Görsel Prompt · GPT Image 1", "@kullanıcı" görünür değil; "+N" çipi sol üstte ve başlıkla çakışmıyor; masaüstünde hover düzeni oynatmıyor, yatay taşma yok; İngilizce. Yeni kullanıcıya görünür metin yok (İngilizce karşılık gerekmedi; mevcut `ContentTypePill` etiketleri zaten çevrili).

## Bilinçli sınırlar
- Başlık görselin alt ~%25'ini kalıcı olarak örter; çok açık renkli ya da yazılı görsellerde okunurluk degradeye bağlıdır (degrade B/C seçeneklerine göre daha koyu tutuldu: `black/75 → /45 → şeffaf`).
- Uzun başlık iki satıra iner ve katman yükselir (kart yüksekliği değişmez); kicker uzun araç adında tek satırda kesilir.
- Video/ses kartında köşedeki yuvarlak tür simgesi ve kicker aynı bilgiyi iki kez söyler (simge görsel biçim, kicker etiket); kaldırılmadı.
