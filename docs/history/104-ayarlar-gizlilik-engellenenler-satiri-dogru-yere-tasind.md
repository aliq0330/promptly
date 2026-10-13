### 9.104 Ayarlar > Gizlilik: Engellenenler satırı doğru yere taşındı

Bölüm 9.103'te "Engellenenler" bağlantısı yanlışlıkla giriş yapılmamış görünüme eklenmişti, bu yüzden giriş yapmış kullanıcı Ayarlar'da görmüyordu. Artık "Gizlilik" başlığı altında, mesaj gizliliği kutusunun hemen altında (giriş yapmış görünüm); giriş yapmamış görünümden kaldırıldı (engeller hesap gerektirir). Migration yok. tsc/lint/build temiz; tarayıcıda denenmedi.

---

**Sonraki adım:** Mesajlaşma genişletmesinin 3 fazı da (Faz A — Bölüm
9.8, Faz B — Bölüm 9.9, Faz C — Bölüm 9.10) TAMAMLANDI. Bunun ardından
Bölüm 9.12 (Bildirim Merkezi tasarımı ve akıllı yönlendirme) de
TAMAMLANDI. **Kullanıcının yapması gereken manuel adım (Dashboard →
SQL Editor), sırayla:**
1. `supabase/migrations/20260919210000_messaging_requests_privacy_
   blocking.sql` (uygulandı — bkz. Bölüm 9.9).
2. `supabase/migrations/20260919220000_messaging_realtime.sql` (uygulandı
   — bkz. Bölüm 9.10; bu olmadan Realtime abonelikleri sessizce hiç olay
   almaz, hiçbir hata vermeden; mesajlaşma yalnızca Faz A/B'nin
   sayfa-yüklemede-çek davranışıyla çalışmaya devam eder).
3. `supabase/migrations/20260919230000_notification_targeting_and_
   previews.sql` (YENİ — bkz. Bölüm 9.12; bu olmadan bildirimler eskisi
   gibi çalışmaya devam eder ama içerik önizlemesi/kesin hedef bilgisi
   (`hl=`) taşımaz, bu yüzden bildirim merkezindeki ikonlar ve "ilgili
   içeriğe akıllı yönlendirme" gerçek veriyle çalışmaz).
4. `supabase/migrations/20260919240000_message_reactions.sql` (YENİ —
   bkz. Bölüm 9.13; bu olmadan emoji tepkileri hiç yüklenmez/yazılmaz —
   frontend RLS reddiyle sessizce başarısız olur).
