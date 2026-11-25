# 458 — Yorum bölümü: avatar sütunu + tek çizgi (Threads düzeni)

Kullanıcı isteği (Threads ekran görüntüsü + onaylı mockup): yorumlar kutusuz akar; avatar sütunu, isim satırı, metin ve tek eylem satırı; yanıtlar üst yorumun avatarından inen çizgiye kavisli kancayla bağlanır.

Değişen (`src/features/prompts/comment-node.tsx` `ThreadCommentNode`, `comment-section.tsx`):
- `BUBBLE_CLASS` kutusu kalktı. Avatar + gövde grid'i HER genişlikte (telefonda da) aynı; üst yorum avatarı 36 px, yanıtlarda 28 px (eski 24).
- Çizgi 2 px `border-strong`: üst yorumun avatarının altında `data-comment-rail`, her yanıt sarmalayıcısında `replyWrapClass(last, parentDepth)` kancası (üst yorum 36 px → x=17, yanıt 28 px → x=13). Girinti sınırı `MAX_INDENT_DEPTH = 2` ve "@kime" ipucu aynı.
- İsim satırı: isim (`text-body` yarı kalın) · Yazar rozeti · Sabitlenmiş · Çalıştı · zaman · düzenlendi, sağda ⋮ menüsü (`CommentMenu` kendi negatif boşluğunu taşır, ek boşluk verme).
- Eylem satırı: `CommentReactions` (altı tepkili beğeni + tepki yığını, 20 px) + ikonlu "Yanıtla". "Yanıtları göster/gizle" artık kendi satırında (`data-comment-fold`, sol sütundaki ok kalktı). Menüsüz kullanımda (sabitle/şikâyet/düzenle/sil satır içi düğmeleri) ve silme onayı aynı.
- Yanıt kutusu girintili düzeylerde (0, 1) yanıtların SON satırı olarak kancayla açılır (`data-comment-reply-row`, yazanın 28 px avatarıyla; üst yorumun çizgisi ona kadar uzar, yanıtsız yorumda da); daha derinde yorumun altında satır içi kalır. Düzenleme (satır içi / telefonda alttan kart) aynı.
- Üst düzey yorumlar arasında `divide-y border-soft` ayırıcı (`comment-section.tsx`).
- Odak'ın yorum sayfası (`layout="sheet"`) değişmedi.

Test: `tests/messaging-ui/run-comment-redesign.mjs` 10 ve 13 yeni yapıya göre güncellendi, 16 (yanıt kutusu kancası + çizgi) eklendi (17/17). `run-comment-order` 9/9, `run-comment-reactions` 4/4, `run-works-badges` 14/14, `run-detail-pages` 47/47. `run-space-comments` 8 ve `run-focus-feed` 27 bu değişiklikten ÖNCE de kırmızı (değişiklik geri alınıp aynı testler koşuldu; yorum düzeniyle ilgisiz). Gerçek cihaza karşı denenmedi. Çeviri anahtarı eklenmedi (mevcutlar kullanıldı), İngilizce karşılıklar zaten var.
