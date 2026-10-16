# 9.182 — Topluluk demo tohumu (15 topluluk, aliq sahip)

Durum: **canlıya UYGULANDI** (Supabase MCP, 5 parça halinde; bu oturum). Yerel PostgreSQL'de önce tam migration setiyle sınandı (idempotency dahil). Gerçek tarayıcı oturumuyla arayüzden gezilmedi.

## Ne eklendi

`supabase/seed/community-demo-content.mjs` (içerik verisi) → `node supabase/seed/build-community-seed.mjs` → `supabase/seed/community-demo.sql` (+ `community-demo/NN.sql`, üçer topluluk).

14 yeni topluluk (canlıda mevcut "Tasarımcılar" ile 15; `aliq` hepsinin **sahibi** = üye + yönetici): Midjourney Atölyesi, Sinematik Video Lab, Copywriting Kulübü, Ses ve Müzik Üretimi, Workflow Mimarları, Prompt Okulu, Portre ve Karakter Tasarımı, Ürün Fotoğrafı ve E-ticaret, Kod Asistanı Promptları, Mimari ve İç Mekân (Kapalı), Oyun Sanatı ve Konsept, Öğretmen Prompt Kütüphanesi, Hikâye Anlatıcıları (Kapalı), Haftanın Meydan Okuması. 12 herkese açık, 2 "Kapalı" (`restricted`).

Her toplulukta: 8 demo üye (5eed… hesapları; ilki yönetici, ikincisi moderatör), kurallar; topluluğa özgü **3 prompt + 1 istek + 1 workflow (adımları kendi promptlarına bağlı) + 1 hazır ayar**; mevcut herkese açık içeriklerden **3–4 başvuru gönderisi** (görselli/videolu/sesli gerçek içerikler); 1–2 duyuru, 1–2 etkinlik + katılım yanıtları; sabitlenmiş gönderi; beğeni ve yorumlar.

Toplam (canlı, doğrulandı): 15 topluluk · 43 yerel prompt · 14 istek · 14 workflow · 14 hazır ayar · 55 başvuru gönderisi · 14 sabit gönderi · 103 etkinlik yanıtı · 287 gönderi beğenisi · 90 gönderi yorumu. Yerel içeriğin hiçbiri `private` dışında değil (0 sızıntı); profiller (20) ve normal prompt sayısı değişmedi.

## Nasıl yapıldı (önemli)

Tohum tablolara doğrudan satır yazmaz. Her adım ilgili kullanıcıya bürünerek (`request.jwt.claims` + `set local role authenticated`) **gerçek RPC ve tetikleyicilerle** yapılır: `create_community`, `respond_community_invitation`, `set_chat_group_member_role`, topluluğa özgü içerik `insert`'i (sunucu görünürlüğü private'a zorlar, akış gönderisini ekler), `share_to_community`, `publish_community_announcement`, `create_community_event`, `set_community_event_rsvp`, beğeni/yorum. Böylece sayaçlar, RLS, üyelik ve sınır kuralları normal kullanımdaki gibi çalışır. Bildirimler (`notify=false` ile duyuru/etkinlik kapalı; beğeni/yorum bildirimleri tetikleyiciyle oluşur) normal akışta üretilir.

Tekrar çalıştırmak güvenlidir: `aliq`'in aynı adlı topluluğu varsa atlanır (yerelde ikinci çalıştırma 0 yeni topluluk). İçerik kimlikleri topluluk kimliğinden türetilir.

## Sınırlar

- Yerel içeriklerin görseli yoktur (medya yüklemesi gerekir); görsel zenginlik başvuru gönderilerindeki mevcut içeriklerden gelir.
- Demo hesaplar (5eed…) gerçek kişi değildir; yorumlar sabit bir havuzdan belirleyici seçilir.
- Bildirim kutusu: `aliq` bu içeriklere gelen beğeni/yorum bildirimlerini alır.
- Geri almak için: `aliq`'in bu 14 topluluğu uygulamadan "Topluluğu sil" ile silinebilir (içerik de gider). Bu oturumda silme yapılmadı.
