# 292 — Kartlarda video/ses kendiliğinden oynar; ortada durdur/başlat düğmesi; Odak'ta aynısı

**Durum:** uygulandı (yalnız istemci; migration yok). `npx tsc --noEmit`, `eslint` (0 hata), `npm test` (588/588), `npm run build` temiz.
Ağ taklitli Playwright: yeni `run-card-autoplay.mjs` 7/7, `run-focus-feed.mjs` 34/34 (6. senaryo yeni davranışa göre yazıldı), `run-card-title` 4/4,
`run-feed-scroll` 3/3, `run-community-posts` 36/36. **Gerçek tarayıcıda ses/video çözülmedi** (`play/pause` taslaklanır), gerçek Supabase'e, iOS Safari'ye ve
gerçek dokunmatik cihaza KARŞI DENENMEDİ.

## Ne
- **Gönderi kartları** (`PromptCard`, ayrıca prompt gösteren `QuoteCard` / `ApplicationCard`): video/ses promptunun kapağı artık oynar (`PlayableCardArt`). Yazarın
  çıktısı (`prompt_results`, detay sayfasının kuralı) yalnız kart görünür alanın 400 px yakınına gelince aranır. Ekranın dikey ortasına en yakın ve yarısından fazlası
  görünen **tek** kart oynar (`lib/card-playback.ts`, saf seçim `pickActiveCard` birim testli); diğerleri durur. Video **sessiz ve döngüde**, ses **sesle** oynar.
- **Resmin tam ortasında tek yuvarlak düğme** (`components/ui/media-play-button.tsx`): duraklıyken görünür, oynarken solar (üzerine gelince/klavye odağında döner). Dokunuşu
  kartın bağlantısını AÇMAZ (`z-10`, `preventDefault`); resmin geri kalanı ve başlık yine detaya götürür. **İlerleme çubuğu / sayaç / yerel kontrol yok.**
- **Odak**: aynı düğme; ilerleme çizgisi (`MediaProgress`) kaldırıldı; ses gönderisi etkin olunca kendiliğinden SESLE başlar ve başarılı olursa ses anahtarı açılır
  (eskiden sessizken ses gönderisi düğmeyi beklerdi). Ses anahtarı elle kapatılırsa çalan ses durur (düğmeyle geri gelir).

## Kararlar
- Aynı anda tek kart: bir akışta onlarca kartın aynı anda ses çalması/çözmesi hem kulağa hem pile zarar verir. Elle başlatılan kart ekranda kaldığı sürece sabit kalır
  (`pinPlaybackCard`); elle durdurulan kart ekranda kaldığı sürece kendiliğinden yeniden başlamaz.
- Tarayıcı sesli kendiliğinden oynatmayı ilk dokunuştan önce reddedebilir: ses kartı bu durumda düğmede bekler (düğme görünür). Bir kez dokunulduktan sonra (uygulama içi
  gezinme belgeyi korur) sonraki ses kartları kendiliğinden başlar.
- `prefers-reduced-motion` ya da veri tasarrufu açıksa kartlar kendiliğinden oynamaz; yalnız düğme.
- Kapak, ilk kareye/ses yüklenene kadar altta kalır; çıktısı olmayan video/ses kartı eskisi gibi yalnız kapaktır (düğme çıkmaz).

## Sınırlar
- **Izgara** görünümü (`FocusGrid` küçük kareleri) değişmedi: onlarca küçük karede oynatma ağır olurdu.
- Çıktı aramak kart başına iki istektir (`fetchResultsForPrompt` + `fetchResultById`) ve yalnız video/ses kartları için, oturum boyunca önbellekli (Odak'la ortak).
- Kendi özel (`result-media`) çıktısı imzalı adresle gelir; oynatıcı metadata gelince hazır sayılır (`ready`) — gerçek imzalı adresle denenmedi.
- Ses kartında oynarken görsel bir gösterge yok (yalnız düğme); ses seviyesi/sessize alma kartta yok (Odak'ta ses anahtarı var).
