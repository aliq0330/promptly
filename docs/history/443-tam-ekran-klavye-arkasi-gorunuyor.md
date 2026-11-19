# 443 — Tam ekran editörde klavye açılınca arkadaki formun görünmesi (iOS)

**Durum:** uygulandı (yalnız istemci; migration/çeviri yok). Ekran görüntüsüyle bildirildi: klavye açıkken editörün altında (klavyenin hemen üstünde) arkadaki formun değişken kartları görünüyordu.

## Neden
Katman zaten `fixed inset-0 bg-background`; 288'deki düzeltme (her zaman tüm ekran + düz zemin) Chromium'da ve taklitli `visualViewport` ile doğru çalışıyor. Gerçek iOS Safari'de klavye açılınca fixed katman bazen yalnız
ilk boyandığı alana çizilir (layout/visual viewport kayar) ve açılan şeridi arkadaki sayfa doldurur. Katmanın kendi kaplamasına güvenmek yetmedi.

## Çözüm (kesin: kaplamaya bağımlı değil)
Katman açıkken sayfanın kendisi görünmez olur:
- `PromptFullscreenEditor` açılışta `<html data-prompt-fullscreen-open>` koyar, kapanınca kaldırır.
- `globals.css`: bu özniteliğin altında `#main-content` ve `[data-app-chrome]` `visibility: hidden` (düzen ve kaydırma konumu yerinde kalır; form durumu bozulmaz) ve `html` zemini `--color-background`
  (katmanla aynı). Katman ve üstüne açılan pencereler (`Modal`) `body` portalıdır → etkilenmez. Katman kısa boyansa bile altta yalnız katmanla aynı düz zemin görünür, içerik değil.
- Test: `run-prompt-fullscreen.mjs` senaryo 11 (390 px): açıkken `#main-content` `hidden`, öznitelik var, `html` zemini = katman zemini; Ayar paketleri penceresi yine görünür; kapanınca her şey geri.

## Kural
Tam ekran bir yüzey, "katman tüm ekranı kaplar" varsayımına tek başına güvenmez (iOS klavyesi); altındaki sayfayı da görünmez yapar (`data-story-open` ile aynı yaklaşım).

## Sınırlar
Gerçek iOS Safari'de denenmedi (ortamda yalnız Chromium). Katman iOS'ta kısa boyanıyorsa altta artık yalnız düz zemin görünür; metin alanının klavyenin üstünde bitmesi (görünür alana oturma) 288'deki gibi sürer.
