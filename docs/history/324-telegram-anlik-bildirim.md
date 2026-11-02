# 324 — Telegram botu: anlık bildirim

**Durum:** repoda (migration + Edge değişikliği + testler); canlıya UYGULANMADI. Canlıda yalnız `pg_net` eklentisi AÇILDI (kullanıcı izniyle, 2026-11-02; `net.http_post` var).

## Sorun
323'te bildirimler GitHub Actions zamanlayıcısıyla (~15 dk, en iyi çaba) gidiyordu; kullanıcı anlık istedi.

## Çözüm
`notifications`'a etkinlik türünde (yorum, yanıt, istek yanıtı, alıntı, düzenleme önerisi, sonuç) satır girince tetikleyici (`_telegram_push_on_notification`, AFTER INSERT, `WHEN` ile yalnız bu türler) alıcının **bağlı + etkinlik bildirimi açık** Telegram bağlantısı varsa `pg_net` ile Edge `telegram`'ın `/notify?user=<kişi>` ucunu çağırır. İstek işlem COMMIT olunca gider (geri alınan işlem hiçbir şey yollamaz). Edge yalnız o kişinin bekleyen bildirimlerini yollar (`_telegram_notify_links_for`); haftalık özet bu yolda GİTMEZ.

- **Yedek:** 15 dk'lık zamanlayıcı aynen duruyor (anlık çağrı kaçarsa yakalar) ve haftalık özeti o yollar. İmleç bildirim kimliğiyle ilerlediği için aynı bildirim iki kez gitmez.
- **Eşzamanlılık:** art arda bildirimler aynı kişi için iki geçiş başlatabilir → `_telegram_claim`/`_telegram_release` (`telegram_links.notify_claimed_at`, 60 sn, çökerse kendiliğinden düşer). Başka geçiş işliyorsa o bağlantı atlanır; yedek zamanlayıcı yakalar.
- **Asla bildirimi engellemez:** `pg_net`/Vault yoksa, sır/adres yoksa, adres `https://` değilse ya da çağrı hata verirse tetikleyici sessizce geçer (`exception when others`). Bildirim satırı her zaman yazılır.
- **Yetki:** yeni yardımcılar anon/authenticated'a kapalı; `/notify?user=` yine `X-Cron-Secret` ister (sır önce denetlenir); `user` uuid değilse ya da `/setup`'ta verilirse 400.

## Kurulum (elle; sırlar depoda YOK)
1. `pg_net` açık olmalı (canlıda açıldı). Başka ortamda: Dashboard → Database → Extensions → `pg_net`.
2. Supabase SQL Editor'da, **kendi değerlerinle** (Edge secret'ındakiyle AYNI cron sırrı):
   ```sql
   select vault.create_secret('https://<proje-ref>.supabase.co/functions/v1/telegram', 'telegram_push_url');
   select vault.create_secret('<TELEGRAM_CRON_SECRET değeri>', 'telegram_cron_secret');
   ```
   Değiştirmek için `vault.update_secret(id, yeni_değer)` ya da Dashboard → Vault.
3. Edge Function `telegram`'ı yeniden deploy et (Actions → Deploy Edge Functions → `telegram`).
4. Denemek için: Telegram'dan `/bildirim` ile etkinlik bildirimini aç, başka hesapla yorum yaptır; mesaj saniyeler içinde gelmeli.

## Sınırlar / denenmedi
- Gerçek Telegram'a, gerçek `pg_net`'e ve Vault'a karşı DENENMEDİ (sandbox `*.supabase.co`/`api.telegram.org`'a erişemez). Güvence: yerel PostgreSQL'de sahte `net`/`vault` ile `supabase/tests/telegram-bot.sql` (42 madde; tetikleyicinin çağrısı, türler, kapalı bildirim, https olmayan adres, ağ hatası, eksik sır) ve ağ taklitli birim testleri.
- `pg_net` isteği asenkron ve en iyi çabadır; Edge soğuk başlarsa birkaç saniye gecikebilir. Telegram `429` verirse o geçiş başarısız sayılır, imleç ilerlemez, yedek zamanlayıcı yeniden dener.
- Her etkinlik bildirimi bağlı + açık kişi için bir HTTP çağrısıdır (diğer herkes için tetikleyici ilk `exists` kontrolünde çıkar).
