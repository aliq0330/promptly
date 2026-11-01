# 303 — Silinen etkinlik hatırlatması geri gelmesin

**Durum:** uygulandı (repoda; migration canlıya UYGULANMADI — bekliyor).

## Sorun
Kullanıcı bir topluluk bildirimini ("… topluluğunda "…" etkinliği 24 saat içinde başlıyor.") silse de bildirim geri geliyordu.

## Neden
`dispatch_my_event_reminders` (`175-*`; istemci uygulama açılışında `NotificationsProvider`'dan çağırır) "bu hatırlatma daha önce gönderildi mi" kararını
bildirim satırının KENDİSİNDEN veriyordu (`dedupe_key = 'evtrem:<etkinlik>:<kişi>'`). Bildirim silinince iz de silindi; etkinlik hâlâ
24 saat penceresindeyse bir sonraki açılışta aynı hatırlatma yeniden üretildi (silinen bildirim = "hiç gönderilmedi").

## Ne yapıldı
Migration `20261101150000_event_reminder_sent_log.sql` (yalnız ekleyici/değiştirici; `drop` yok):
- Yeni `community_event_reminders_sent (event_id, user_id)` — istemciye kapalı (RLS açık, yetki yok), etkinlik/profil silinince kaskad.
- `dispatch_my_event_reminders` (aynı imza) "gönderildi" kararını bu tablodan verir; bildirim gerçekten yazıldıysa kayıt düşer.
  Tercih "none" ise bildirim yazılmaz ve kayıt düşmez (kişi sonradan açarsa hatırlatma yine gelebilir — önceki davranış).
- Pencerede hâlâ duran eski bildirimler ilk çağrıda kendiliğinden kayda alınır (yeni bildirim üretilmez).
- `supabase/tests/communities.sql` kontrol 61: bildirim silindikten sonra yeniden çağrı 0 üretir ve bildirim geri gelmez.

İstemci değişmedi.

## Sınırlar
- Migration'dan ÖNCE silinmiş bir hatırlatmanın izi yok: o bildirim canlıya inince bir kez daha gelebilir, sonra kalıcı olarak susar.
- Aynı kalıp (silinebilen bir satırı "gönderildi" kaydı yapmak) başka yerde yoksa taranmadı; yalnız `evtrem:` yolu düzeltildi.
