### 9.43 Demo hesap seed'i

Kullanıcı isteğiyle, siteyi 15-20 gerçek insan kullanıyormuş gibi göstermek için
`supabase/seed/` altında tekrar çalıştırılabilir bir seed eklendi (migration
değil): `demo-content.mjs` (18 persona — bio, ilgi alanı, promptlar, istekler,
generatorlar, yorum havuzu), `build-demo-seed.mjs` (sabit tohumlu, deterministik
üretici) ve çıktısı `demo-users.sql`. Hesaplar `<ad>@msn.com` / `ac8d5c55`,
doğrudan `auth.users` + `auth.identities`'e e-postası onaylı olarak yazılıyor
(hiç e-posta gönderilmiyor); profil ve "Genel" koleksiyonu mevcut
`handle_new_user` trigger'ıyla oluşuyor, sayaçlar/bildirimler mevcut
trigger'larla gerçekten üretiliyor. Tüm id'ler `5eed…` önekli; script başta
bu id'leri VE demo e-postalarıyla (ör. `veli@msn.com`) daha önce elle açılmış hesapları silip baştan kuruyor (kullanıcı onayıyla — ilk canlı denemede önceden var olan bir `veli@msn.com` `users_email_partial_key` çakışmasına yol açtı; o hesapların isteklerine başka kullanıcıların verdiği yanıtlar silinmiyor, `original` paylaşıma dönüştürülüyor) (silme sırasında soft-delete / varsayılan
koleksiyon koruma trigger'ları geçici olarak kapatılıyor). Görseller
picsum.photos (gerçek fotoğraf, seed ile sabit — ilk sürümdeki loremflickr.com canlıda
yüklenmedi; zaten seed'i çalıştırmış olanlar için `demo-images-fix.sql` yalnızca
URL'leri günceller), avatarlar randomuser.me — sandbox bu sitelere erişemediği için görsellerin
gerçekten yüklendiği burada doğrulanamadı. Yerel PostgreSQL 16'da tüm
migration'larla birlikte iki kez üst üste çalıştırıldı: 18 kullanıcı, 99 prompt
(66 görsel), 39 istek (9 yanıtlandı, 3 kapalı), 60 generator, 411 yorum, 872
beğeni, 142 takip, 184 koleksiyon öğesi; önceden var olan gerçek bir hesap
etkilenmedi, şifre hash'leri doğrulandı. GoTrue'nun bu kullanıcılarla gerçekten
giriş yaptırması canlı projede denenmeli.
