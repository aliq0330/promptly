# 320 — Oturum dayanıklılığı: Safari'de kendiliğinden çıkış, içerik gelmemesi, yenileyince girememe

> **Durum:** repoda, testli (birim + ağ taklitli Chromium). **Gerçek Safari / iPhone'a KARŞI DENENMEDİ.** Kök neden canlı Supabase günlüklerinden ve veritabanından kanıtlandı (aşağıda); "depolama neden dolu/yazılamıyor" sorusunun cevabı hâlâ BİLİNMİYOR (düzeltme nedenden bağımsızdır, ve uyarı bunu ortaya çıkaracaktır).

## Belirti (kullanıcı)
iPhone Safari'de bazen kendiliğinden çıkış, içerikler gelmiyor; sayfa yenilenince çıkış yapılıyor ve tekrar girilemiyor — ta ki Safari önbelleği/web sitesi verisi silinene ya da başka tarayıcıdan girilene kadar.

## Canlıda kanıtlananlar (2026-11-02, Supabase `auth_logs` + `auth.refresh_tokens`)
- Tek hesap için 24 saatte **209 başarılı** `refresh_token` isteği (normal: saatte ~1) ve **11 adet 429 `over_request_rate_limit`** (hepsi 07:58'den sonra), sonrasında **`refresh_token_not_found`** (400) — kullanıcıyı atan hata — ve hemen ardından yeni parola girişi.
- İstekler **art arda ~4/sn** (08:08:55–08:09:27'de ~50, 08:14:27–38'de ~14), hepsi aynı iPhone'dan.
- Bir oturumun `refresh_tokens` satırı yalnız **2** (740 iptal, 741 aktif, `parent`=740) ve **741 hiç kullanılmamış**: yani istemci yenilenen oturumu (741) KAYDETMİYOR, her seferinde eski ebeveyn belirteci (740) yolluyor; GoTrue çocuk kullanılmadığı sürece 740'ı kabul edip aynı oturumu döndürüyor (200, yeni satır yok). Fırtına bu yüzden hiç yeni satır üretmedi.
- Sonuç zinciri: **yenilenen oturum kaydedilemiyor → her API çağrısı yine "süresi dolmuş" görüp tekrar yeniliyor → IP başına yenileme sınırı (429) → auth-js (2.116) erişim belirteci dolmuşsa 429'u kalıcı hata sayıp oturumu SİLİYOR (`_removeSession`) → çıkış; sayfa yenilenince eski/bayat oturum → `refresh_token_not_found` → giriş yok.**

## Elenenler
- İkinci bir `createClient` yok (tek istemci); `server-errors.ts` sarmalayıcıları yalnız `/rest/v1`'e dokunuyor.
- Uygulama `localStorage`'a büyük bir şey yazmıyor (tema, dil, son aramalar… küçük anahtarlar); ama kaynak adresi `aliq0330.github.io` aynı kullanıcının TÜM GitHub Pages sitelerince paylaşılır — komşu bir uygulama 5 MB'lık Safari kotasını doldurmuş olabilir. Doğrulanmadı.
- Tarayıcı saati kayması, JWT ömrü: `refresh_tokens` kalıbı (yeni satır yok) bunları dışlıyor.

## Ne yapıldı
- **`lib/supabase/resilient-storage.ts`** (oturum depolaması, `createClient({ auth: { storage } })`): yazma `localStorage`'a; başarısız olursa eski değer silinip bir kez daha denenir, olmazsa `sessionStorage`'a + belleğe yazılır. Yazma başarısızken o anahtarın doğruluk kaynağı bellektir (bayat `localStorage` değeri okunmaz → kütüphane eski belirteci yeniden göndermez); yeniden yüklemede iki depodan `expires_at`'i en yeni olan seçilir. Hata `onPersistFailure` ile bir kez bildirilir (ham değer verilmez): 12 sn'lik uyarı + konsol; uyarıda hata adı ve depolama özeti (anahtar adları + boyutlar, değer YOK) var — komşu uygulamanın dolduruyor olup olmadığı görülür.
- **`lib/supabase/auth-refresh-guard.ts`** (`global.fetch` zincirinin en dışı; yalnız `POST …/auth/v1/token?grant_type=refresh_token`): (1) aynı yenileme belirteci 10 sn içinde tekrar gelirse ağa gitmez, ilk yanıt yeniden kullanılır (eşzamanlı olanlar tek isteği paylaşır); (2) **429 → 503**: auth-js 5xx'i geçici ağ hatası sayar ve oturumu silmez; hız sınırı 30 sn önbelleğe alınır ki geri çekilmeli yeniden denemeler sınırı zorlamasın. Gerçek geçersiz belirteç (400) olduğu gibi geçer — gerçek çıkışlar gizlenmez. Parola girişi/REST/başka istekler değişmez.
- `announceNotice(mesaj, süre?)` + `useToast().show(mesaj, süre?)`: uzun uyarılar için isteğe bağlı süre (varsayılan 3,2 sn aynı).
- Çeviri (TR+EN): `error.authStorage`.

## Testler
- Birim `src/lib/supabase/resilient-storage.test.ts` (10) + `auth-refresh-guard.test.ts` (8): üretim hatasının birebir tekrarı (yazma başarısızken `getItem` yeni oturumu verir), tek bildirim + ham değer yok, yeniden yüklemede en yeni kopya, kota dolu/engelli depolama, bellek tablosu sınırı, 429→503 + önbellek, diğer hatalar/istekler dokunulmaz.
- Arayüz `tests/messaging-ui/run-auth-storage.mjs`: sağlıklı tarayıcıda tek yenileme + normal kayıt; `localStorage` yazması `QuotaExceededError` verirken yenileme fırtınası yok + girişli kalır + uyarı + yenilemeden sonra oturum korunur; 429 oturumu silmez ve ağa art arda gitmez; gerçek geçersiz belirteç hâlâ çıkış yaptırır; İngilizce uyarı.

## Bilinen sınırlar / sonraki adım
- Düzeltme "yazılamayan depolama"yı güvenli hâle getirir ama nedenini ortadan kaldırmaz: komşu bir `aliq0330.github.io` uygulaması depoyu dolduruyorsa Safari'de Web Sitesi Verileri silinmeli (uyarı bunu söyler). Kullanıcıdan uyarı metnindeki "Ayrıntı"yı iletmesi istenir.
- Oturum bellek/`sessionStorage` önceliğindeyken sekme kapanırsa oturum kaybolabilir (kalıcı depo yazılamıyordu zaten); bu durumda kullanıcı bilgilendirilmiştir.
- Çapraz sekme senkronu: bellek öncelikli iken başka sekmenin `localStorage` yazması bu sekmeye yansımaz (yalnız yazma başarısızken geçerli).
