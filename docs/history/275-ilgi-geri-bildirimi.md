# 275 — "İlgimi çekiyor / çekmiyor": Sana özel için açık geri bildirim

**Durum:** uygulandı. `20261006100000_content_interest.sql` (yalnızca ekleyici/değiştirici: yeni tablo + yeni RPC + `for_you_page` aynı imzayla `create or replace`; `drop` yok) yerel PostgreSQL'de sınandı (`content-interest.sql`, mutasyonlu; `for-you`, `feed-filters`, `safety-hardening`, `topic-pages`, `related-prompts` `FAILED=0`), arayüz ağ taklitli Playwright'ta (`run-interest` 12/12; `run-home-motion` 10/10, `run-feed-filters` 18/18, `run-discover` 9/9, `run-pagination` 16/16, `run-detail-pages` 45/45, `run-reactions` 11/11). Canlı durumu için CLAUDE.md §9'a bak.

## Neden
Sana özel yalnız olumlu sinyal biliyordu (beğeni, kaydetme, kopyalama, takip, ilgi alanı). Kişinin ilgisini çekmeyen bir gönderiyi "çekmiyor" diye işaretleyecek bir yol yoktu; yalnız yok saymak zorundaydı. Açık geri bildirim bu boşluğu kapatır (Instagram'ın "Bu gönderi ilgini çekiyor mu?" kartı gibi).

## Karar (kullanıcı, seçenek 3)
Cevaplar YALNIZ **Sana özel** sıralamasını etkiler. Keşfet'in sıralaması ve içeriği (`feed_page`, "Önerilen" kişiselleştirilmemiş — 221) DEĞİŞMEDİ; Keşfet'te "çekmiyor" dediğin gönderi listeden kalkmaz, yalnız işaretlenir ve Sana özel'e öğretir. (Seçenekler: 1 = Keşfet "Önerilen"de gizle, 2 = Önerilen'i kişiselleştir, 3 = Keşfet'e dokunma.)

## Veri
- `content_interest`: kişi başına içerik başına tek cevap (`interested` | `not_interested`); prompt/istek/workflow/hazır ayar sütunlarından TAM biri dolu (`content_interest_exactly_one_target`), her biri kişi başına tekil dizinli; hedef silinince cevap CASCADE. Yalnız sahibi okur (RLS); istemci insert/update/delete politikası YOK.
- `set_content_interest(kind, id, value)` (SECURITY DEFINER, `search_path` sabit, anon EXECUTE kapalı): oturum ister (`not_authenticated`), geçersiz tür/değer `invalid_interest`, yalnız yayında + herkese açık + topluluğa ait olmayan + BAŞKASININ içeriği (`content_not_found`; topluluk içeriği ve kendi içeriğin cevaplanamaz), saatte ≤200 cevap (`_rate_limit`, geri almalar dahil), `value` null = geri al. Dönüş = saklanan değer.

## Sana özel (`for_you_page`, aynı imza)
- Cevaplanan gönderi (iki değer de) bir daha çıkmaz.
- "İlgimi çekiyor" gönderisinin etiketleri beğenilen etiket gibi artı sinyaldir (+50 × en çok 3); neden = `liked_tag` (metin "İlgilendiğin #x gönderilerine benziyor" olarak genişletildi).
- "İlgimi çekmiyor" gönderisinin etiketleri eşleşen etiket başına −60 (en çok 3). Aynı yazarın en az 2 gönderisine "çekmiyor" dediysen o yazarın kalan gönderileri −200. Tek bir "hayır" bir etiketi ya da kişiyi öldürmez.
- Son 300 cevap sinyal olur (`my_likes` gibi); elenme ise tüm cevaplara bakar (`not exists`). Diğer kurallar 223 ile aynı.

## Arayüz
- `useInterestFeedback` (`features/feed/interest-feedback.tsx`): bir listenin cevaplarını tutur (iyimser güncelleme, hatada geri alma + `interest.failed` uyarısı; hız sınırı uyarısını istek katmanı zaten gösterir). `InterestCardFrame` her kartı sarar: ⋮ menüsüne iki satır (`PostMenuExtras`; `PostMenuExtra.selected` → `menuitemcheckbox`, işaretli görünür, seçiliye tekrar basmak geri alır), 7. gönderinin ve sonra her 15. gönderinin altında "Bu gönderi ilgini çekiyor mu?" şeridi (`lib/interest-feedback.ts`: dizin tabanlı, sayfa eklenince kaymaz), cevaptan sonra ~2 sn teşekkür.
- Sana özel'de "çekmiyor" gönderiyi "Bunun gibi gönderileri daha az göstereceğiz · Geri al" notuna çevirir. Keşfet'te gönderi yerinde kalır; daha önce cevaplanmışlar menüde seçili gelir (`fetchContentInterests`, 100'erli parçalar) ve onlara kart sorulmaz.
- ✕ kartı kapatır ve 6 saat hiçbir listede çıkmaz (`promptly-interest-card-paused-until`, localStorage).
- Yalnız oturumlu; kendi gönderinde, Takip Ettiklerim'de, Izgara görünümünde, aramada ve profilde YOK. TR + EN karşılıklar eklendi (`interest.*`).

## Doğrulama
- `supabase/tests/content-interest.sql`: anon erişimi yok; dört tür kaydı; geçersiz/kendi/gizli/taslak/olmayan içerik reddi; cevaplanan gönderi çıkar; tam −60 / +50; `liked_tag` nedeni; bir "çekmiyor" yazarı cezalandırmaz, ikincisi −200; değer değiştirme tek satır; geri alma gönderiyi döndürür; istemci doğrudan yazamaz; başka kullanıcı okuyamaz; CHECK; CASCADE; 200/saat hız sınırı. Cezayı sıfırlayıp elemeyi kaldıran mutasyonla 2 kontrol kırılır.
- `tests/messaging-ui/run-interest.mjs` (12): kart yalnız 7. gönderide, "çekiyor"/"çekmiyor" RPC gövdesi, teşekkür, Geri al, menü seçili durumu, kendi gönderi, RPC hatasında geri alma, ✕ + yenileme, Takip Ettiklerim'de yok, Keşfet (gizlemez, önceden cevaplanmış seçili), misafir, İngilizce + masaüstü taşma.
- `smoke-test.mjs`: `set_content_interest` ve `content_interest` (yumuşak, ziyaretçiye 401/403 "var ama kapalı").

## Bilinçli sınırlar
- Ağırlıklar (−60 / −200 / +50, ≥2 yazar eşiği, 7. + her 15. gönderi, 6 saat duraklatma) elle seçildi, gerçek veriyle ayarlanmadı; canlıda ~18 yazar / ~150 prompt olduğu için başta etki küçük olur.
- Cevap zamanla sönmez (eski bir "çekmiyor" hep geçerli); son 300 cevap sinyal olur.
- Alıntı ve Space için cevap yok (Sana özel bunları zaten almaz). Odak ve Izgara görünümünde yok.
- Keşfet'te "çekmiyor" dediğin gönderi Keşfet'te görünmeye devam eder (karar 3); yalnız Sana özel değişir.
- İstatistik/bildirim yok; cevap hiçbir yerde başkasına görünmez.
- Gerçek Supabase'e / oturuma / telefona / iOS Safari'ye karşı denenmedi.
