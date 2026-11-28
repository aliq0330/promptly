# 9.483 — Video ve ses için tek, cihazda tutulan ses tercihi

Kullanıcı Keşfet'te gezerken videoların sesinin tek yerden yönetilmesini istedi (mockup üzerinde onaylandı): videolar kendiliğinden SESSİZ oynar; herhangi bir videodaki ses düğmesine basınca sitedeki TÜM videoların sesi açılır, başka bir videoda tekrar basınca TÜMÜ kapanır. Karar: **Odak ve ses (audio) gönderileri de aynı tercihi kullanır; tercih cihazda tutulur** (hesapta/Supabase'te değil).

## Tek kaynak: `lib/media-sound.ts`

- Tercih `localStorage` `promptly-media-sound` (`on` | yok = KAPALI). Kartlar, Odak ve ses gönderileri yalnız bunu okur/yazar; ikinci bir ses durumu YAZILMAZ. Diğer sekmede değişince `storage` olayıyla eşitlenir.
- **Üç durum** (`soundState`): `off` · `pending` (tercih açık ama tarayıcı bu ziyarette henüz dokunuş görmedi → ses yok) · `on`. Medya yalnız `audible` = tercih AÇIK VE dokunuş alınmış iken sesle oynar (`isAudible`). Dokunuş bilgisi: yükte `navigator.userActivation.hasBeenActive`, sonra belgedeki ilk `click` (capture'da yakalanır — `stopPropagation` eden yuvarlak oynat düğmesi de sayılsın —, bir tik sonra uygulanır ki ses düğmesinin kendi işleyicisi hâlâ `pending` görsün).
- **`nextSound`**: `pending` iken ilk basış tercihi KAPATMAZ, yalnız sesi getirir (kullanıcı duymak istiyor); aksi hâlde tercihi çevirir. Tarayıcı sesli `play()`'i reddederse (`reportSoundBlocked`) tercih silinmez, yeniden `pending` olur.
- Depo `createMediaSoundStore(storage, startsUnlocked)` fabrikasıdır (tarayıcısız birim testli: `media-sound.test.ts`); tarayıcı tekili ve `useMediaSound()` (`lib/use-media-sound.ts`, `useSyncExternalStore`) üstte.

## Yüzeyler

- **Kart (`PlayableCardArt`)**: video kartında sağ altta küçük ses düğmesi (`bg-art-chip`; açıkken `bg-primary`; `pending`'de "Dokun, ses gelsin" ipucu; tıklaması gönderiyi AÇMAZ). Basınca `ToastBar` (`useToast`): "Tüm videoların sesi açıldı" / "Tüm videolar sessize alındı". Video `muted`'ı tercihi CANLI izler; ses kartı yalnız tercih açıkken kendiliğinden çalar (kapatınca her yerde susar), oynat düğmesine dokunmak tercihi açar (jest). Ses kartında ayrı düğme yok (oynat düğmesi zaten kontroldür).
- **Odak**: `FocusPlaybackContext` şekli aynı kaldı (`muted`, `setMuted`) ama `useState(true)` yerine bu depoya bağlı (`muted = !audible`, `setMuted(false)` tercihi açar). Eski "video sesli oynatamazsa anahtarı kapat" ve "ses gönderisi kendiliğinden sesle başlar ve anahtarı açar" davranışları KALKTI: tarayıcı reddederse tercih `pending` olur, ses gönderisi tercih kapalıyken düğmesinde bekler. Elle durdurulan gönderi, ses anahtarı değişince yeniden başlamaz.
- Kapsam dışı: detay/sonuç sayfalarındaki tarayıcı `controls`'lu oynatıcılar (kendi ses düğmesi var), hikâye videoları, mesajlaşma.

## Davranış değişikliği (bilerek)

Varsayılan KAPALI olduğundan ses gönderileri Keşfet/Odak'ta artık kendiliğinden sesle çalmaz; kullanıcı bir kez ses açınca (video kartındaki düğme, Odak anahtarı ya da ses kartının oynat düğmesi) hepsi çalar.

## Doğrulama

`media-sound.test.ts` (9 test) + `tsc`, `lint` (0 hata), `npm test` (1604/1604), `npm run build`. Ağ taklitli Playwright: `run-card-autoplay.mjs` 10/10 (yeni senaryolar 8–10: varsayılan kapalı, düğme tüm videoları açar/kapatır + cihazda saklanır + bildirim, yenileme sonrası "bekliyor", reddedilen sesli oynatma tercihi silmez) ve `run-focus-feed.mjs` 38/38 (6 yeniden yazıldı, 6b/6c yeni). Gerçek tarayıcıda otomatik oynatma/ses reddi (iOS Safari dahil) ve fiziksel cihaz DENENMEDİ.

İngilizce karşılıklar eklendi (`mediaSound.*`, `translations.ts` + `build-i18n`).
