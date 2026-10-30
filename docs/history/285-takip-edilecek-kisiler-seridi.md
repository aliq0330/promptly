# 285 — "Takip edilecek kişiler" şeridi: Ana Sayfa'da gönderilerin arasında kişi önerisi

**Durum:** uygulandı (istemci + `20261009100000_suggest_creators.sql`, yalnızca ekleyici: yeni tablo + iki yeni RPC; `drop` yok). Yerel PostgreSQL'de sınandı (`creator-suggestions.sql` 16 kontrol, mutasyonlu), arayüz ağ taklitli Playwright'ta (`run-creator-suggestions` 15/15; `run-interest` 12/12, `run-home-motion` 10/10, `run-feed-filters` 18/18, `run-pagination` 16/16, `run-discover` 9/9, `run-feed-scroll` 3/3, `run-scale` 6/6), birim 563/563. **Canlıya UYGULANMADI**; gerçek Supabase'e / oturuma / telefona karşı denenmedi. Canlı durumu için CLAUDE.md §9'a bak.

## Neden
Ana Sayfa'da yeni kişi bulmanın tek yolu masaüstündeki sağ sütundu (kişiselleştirilmemiş "en çok takipçili 3 kişi"); telefonda hiç yoktu. Gönderilerin arasına giren kısa bir kişi şeridi (Instagram/Twitter'daki "Takip edilecek kişiler") hem telefonda hem masaüstünde keşfi açar.

## Kişiler neye göre gelir (`suggest_creators`, SECURITY INVOKER)
Sunucu sıralar, istemci sıralamaya karışmaz. Puan (yüksek önce):
- **Takip ettiklerimin takip ettiği kişi** — 300 + 100 × ortak sayısı (en çok 4); neden `mutual`, kartta "X takip ediyor" / "X ve N kişi daha takip ediyor" (son takip ettiğim 500 kişiye bakılır).
- **Beğendiğim gönderilerin yazarı** (son 300 beğeni) — 150 + 30 × beğeni (en çok 5); `liked`.
- **Takip ettiğim etiketle** (son 90 gün, prompt) üreten — 120 × eşleşen etiket (en çok 3); `tag`.
- **Takip ettiğim AI aracıyla** üreten — 100; `tool`.
- **Yedek** (herkese) — 30 × ln(1 + takipçi) (en çok 120) + 100 × exp(−son gönderiden gün / 30); `active`. Sinyali olmayan hesap için tek başına sıralar.
Hariç: kendisi, zaten takip edilenler, engel ilişkisi olanlar (iki yönlü), askıdakiler, ✕ ile kapatılanlar, son 90 günde herkese açık (yayında, topluluğa ait olmayan) gönderisi olmayanlar. Anon çağıramaz. Dönüş yalnız kimlik + neden; profil alanları istemcide `profiles`'tan okunur.

## Ne sıklıkla (`lib/creator-suggestions.ts`)
12. gönderiden sonra, sonra her 30 gönderide bir (12., 42., 72. …). Dizin tabanlı: sonraki sayfa yüklenince önceki şerit kaymaz. "İlgini çekiyor mu?" kartıyla (7., 22., 37. …) aynı gönderiye düşmez (testle sabit). Havuz 30 kişi, şerit 10 kişi: her şeridin kendi dilimi vardır, ikinci şeritte birincidekiler tekrar etmez. Son 7 günde gösterilen kişiler havuzun sonuna alınır (`reduceRepeatedSuggestions`, tarayıcıda tutulur). Yalnız oturumlu; Sana özel ve Takip Ettiklerim sekmelerinde; Keşfet'te, Izgara görünümünde ve misafirde yok. Öneri yoksa/istek hata verirse şerit hiç çizilmez.

## Kapatma
- **Karttaki ✕**: o kişi bir daha önerilmez, kalıcı (`creator_suggestion_dismissals`, kişi başına en yeni 500; yazma yalnız `dismiss_creator_suggestion` RPC'si, saatte ≤120). Sunucu hata verirse kişi geri gelir ve uyarı çıkar.
- **Başlıktaki ✕**: tüm şeritler 6 saat gelmez (yalnız bu cihazda, `promptly-creator-strip-paused-until`); duraklatılmışken sunucuya sorulmaz.
- "Takip Et" düğmesi mevcut `FollowButton`'dır (takip edince kart yerinde kalır, "Takip Ediliyor" olur).

## Arayüz
- `useCreatorStrips` (`features/feed/creator-suggestions.tsx`): bir listenin havuzunu tutar (iki sekme tek istek; 3 dk modül önbelleği), `CreatorStripSlot` bir şeridi çizer. `FeedGrid` şeridi gönderilerle AYNI sütun kapsayıcısına `column-span: all` bir yuva olarak koyar: kartlar yeniden kurulmaz, şerit tam genişlikte olur. **Yuva şerit boşken de vardır** (öneriler sonradan gelse bile kartlar yeniden sütun değiştirmez).
- Kart: avatar, ad (örnek hesapsa `DemoAccountBadge`), neden cümlesi, tam genişlik Takip Et; `ScrollRow` (parmak, tekerlek, sürükleme, oklar).
- "Tümünü gör" → `/discover?section=creators` (Keşfet Yaratıcılar bölümünde açılır; `useSearchParams`, sayfa `Suspense` içinde).
- TR + EN çeviriler eklendi (`creators.*`).

## Doğrulama
- `supabase/tests/creator-suggestions.sql`: anon erişimi yok; aday kümesi tam (carol, dave, gina, hank, ivy, erin) ve elenenler yok (takip edilen, engelleyen/engellenen, askıdaki, yalnız taslak, 90 günden eski, topluluğa özgü gönderi); sıra mutual > liked > tag > tool > active; neden türü + ayrıntısı (ortak takip eden adı + sayı, etiket, araç); `p_limit` sınırı; dismiss kuralları + tekrarı sessiz; kapatılan bir daha gelmez; istemci doğrudan yazamaz, başkasının kapatmasını okuyamaz; takip edilen çıkar; engel/askı kalkınca döner; kapatma kişiye özel; kimliksiz çağrı boş; 120/saat hız sınırı. Mutasyonlarla (askı, gönderi şartı, 90 gün, kapatma, topluluk filtresi) kontroller kırılır. **Engel koşulunu kaldıran mutasyon yakalanmaz**: engelli yazarın gönderilerini içerik RLS'i (`*_hide_blocked`) zaten gizler, açık `is_blocked` kontrolü ikinci savunmadır.
- `tests/messaging-ui/run-creator-suggestions.mjs` (15): konum + kart içeriği + her neden cümlesi, "ilgini çekiyor mu?" ile birlikte, iki sekme tek istek, ✕ (RPC gövdesi, kalıcı), ✕ hata → geri gelir, başlıktaki ✕ + yenileme (istek yok) + süre dolması, iki şerit/tekrarsız, boş/hata/az gönderi, misafir, İngilizce + masaüstü taşma, tablet genişliği, `?section=creators`.
- `smoke-test.mjs`: iki RPC + tablo (yumuşak, ziyaretçiye "var ama kapalı").

## Bilinçli sınırlar
- Sinyal ağırlıkları elle seçildi, gerçek veriyle ayarlanmadı. Canlıda 20 profilin 17'si demo hesap: "takip ettiklerimin takip ettikleri" sinyali başta zayıf kalır, yedek (`active`) sıralar.
- Profil ilgi alanı (`INTEREST_OPTIONS` → tür/kategori) ve ortak topluluk sinyali YOK (ilgi haritası yalnız `for_you_page`'de; ortak topluluk üye listesi sızıntısı riski taşır). Etiket/araç sinyali yalnız prompt gönderilerine bakar (istek/workflow/hazır ayar etiketi sayılmaz).
- Masaüstünde sağ sütundaki eski "Takip edilecek kişiler" kartı (`home-rail.tsx`, kişiselleştirilmemiş en çok takipçililer) yerinde duruyor — şerit ile birlikte aynı sayfada iki kişi önerisi olur; hangisinin kalacağı ayrı karar.
- Cihazlar arası duraklama/tekrar azaltma yok (tarayıcıda); kişi kapatma sunucuda olduğu için cihazlar arasıdır.
- `suggest_creators` her çağrıda son 90 günün herkese açık gönderilerini toplar (üç dakikalık istemci önbelleği var); gönderi sayısı çok büyürse özet tablo/önbellek gerekir.
- Gerçek Supabase'e / oturuma / telefona / iOS Safari'ye karşı denenmedi.
