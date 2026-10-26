# 239 — Odak: Albüm A (özet + Bilgi sayfası) ve bölümler

> **Güncelleme (`245-*`):** "dikey kaydırma = bölüm" kaldırıldı; tür + kaynak üstteki tek süzgeç çipinde, yukarı kaydırma Bilgi'yi açar. Aşağıdaki bölüm hareketi/nokta anlatımı eskidir.

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 30 senaryo, birim testleri `focus-feed.test.ts`). **Gerçek Supabase'e / gerçek telefona (iOS Safari dokunmatik dikey/yatay kaydırma) / gerçek fare-trackpad'e karşı denenmedi.** İngilizce karşılıklar eklendi (`focusFeed.info`, `infoClose`, `channels`; `mediaOnlyTitle` ve `keyboardHint` güncellendi).

## Neden
238'den sonra telefonda yapısı olan gönderilerde (hazır ayar, workflow, istek) yazı bloğu ekranı doldurup görseli ~48 px'e sıkıştırıyordu. Kullanıcı tuvaldeki beş çözümden **A (katlanır bilgi)** yönünü seçti; ek olarak Odak'ı bölümlere ayırmak, Medya süzgecini varsayılan açık yapmak ve görselsiz istek/hazır ayar için kendi kartını istedi. Özellik eksiltilmedi (açıklama, parametreler, Promptu incele, Ayrıntıları aç, Space'e ekle Bilgi sayfasında).

## Yapılan
- **Slayt yüzü** (`AlbumSlide`): yazar (+ Takip Et), başlık, tek satır tür · araç (· workflow'da adım sayısı), simge satırı (beğeni · yorum · kaydet · paylaş, sayılarıyla — `FocusFeedRail layout="compact"`) + "Bilgi ⌃" düğmesi, altında tek tam genişlikte büyük eylem (Kopyala / açık istekte Yanıtla [`/create?answerRequest=`; kendi isteğin değil] / Ayrıntıları aç).
- **Bilgi sayfası** (`FocusInfoSheet`): yorum sayfasıyla aynı davranış — telefonda alttan açılır, gönderi üstte küçülür, üst çubuk/şerit/bölüm noktaları çekilir; `md`+'da sağ panel. İçinde tür satırı, başlık, tam açıklama, gönderinin yapısı (`StructureBlock`: workflow adımları, hazır ayar parametreleri, istek yönü, prompt metni), Promptu incele, Ayrıntıları aç, Space'e ekle. Kabuk `FocusSheetFrame`'e çıkarıldı, yorum sayfası da onu kullanır (`data-focus-sheet` ortak, `data-focus-comments` / `data-focus-info` ayrı). Aynı anda tek sayfa açılır.
- **Bölümler** (`lib/focus-feed.ts` `FOCUS_CHANNELS`, `focusChannelStep`): Tümü · Prompt · İstek · Workflow · Hazır ayar. Dikey kaydırma (dokunmatik: baskın dikey hareket, > 60 px ya da hızlı; masaüstü: tekerlek, bir hareket = bir adım; klavye ↑ ↓ / k j) bölüm değiştirir, yatay (← → / h l / yana kaydırma) o bölümün gönderileri arasında gezer. Her bölüm kendi `feed_page` `kind` sorgusudur (Tümü = hepsi). Uçlarda sarma yok. Solda dikey **yazısız noktalar** (`FocusChannelRail`, etkin olan uzun hap, her nokta ad etiketli düğme); geçişte ad ortada kısa süre görünür (`ChannelToast`); yeni içerik kaydırma yönünden girer (`animate-channel-down/up`).
- **Medya süzgeci varsayılan AÇIK** (`focusFeedShown`): yalnız görselsiz/oynamayan prompt ve kapak görselsiz workflow'u eler; istek ve hazır ayar süzgeçten etkilenmez. Kapatılınca eskisi gibi hepsi gelir. ⋮ menüsündeki nokta yalnız ses açıkken yanar.
- **Görselsiz istek / hazır ayar** (`AlbumArtCard`): görselin yerinde istek kartı (İstek etiketi + durum + istek metni + yaratıcı yön) ya da hazır ayar kartı (ilk 4 parametre + "+N"); başlık, yazar ve eylemler altta aynı. Prompt (kendi metni) ve görselsiz workflow (adımlar) eskisi gibi kart olur (Medya kapalıyken).
- Yorum/Bilgi sayfası açılırken küçülen alan artık görselsiz gönderilerde sanat kartıdır (`mediaBox` `[data-album-art]` arar; yazar avatarını görsel sanmaz).

## Bilinçli sınırlar
- Bölüm geçişi parmağı izlemez (eşik aşılınca animasyonla geçer); mouse sürüklemesi bölüm değiştirmez.
- Tümü/Prompt vb. için gönderi sayısı gösterilmez (sunucudan toplam gelmiyor).
- Bölüm değişince küçük resim şeridi anında yeni listeye döner, animasyonlanmaz.

## Düzeltme (`240-*`)
Telefonda slayt yüzündeki büyük düğme (Kopyala / Ayrıntıları aç / Yanıtla) kaldırıldı; bunlar Bilgi sayfasında: Kopyala prompt bloğunda ve "Promptu incele"de, Ayrıntıları aç bağlantıda, açık istekte **Yanıtla** (kendi isteğin değilse) bilgi sayfasının eylem satırının başında. Bölüm noktaları: boyut geçişi kaldırıldı (hızlı bölüm değişiminde komşu noktalar yarı büyümüş kalıyordu), noktalar sabit yuvada anında değişir; bölüm değişimi 350 ms içinde ikinci kez tetiklenmez.
