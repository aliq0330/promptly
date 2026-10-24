# 224 — Güvenlik ve sosyal mantık sertleştirmesi

**Durum:** uygulandı (repo). `20260923100000_safety_hardening.sql` + `20260923100100_notifications_prune_cron.sql` yerel PostgreSQL'de sınandı; **canlıya UYGULANMADI** — ÖNCE migration, SONRA istemci (yeni istemci `profiles.is_demo` sütununu seçer; migration yoksa her profil sorgusu hata verir). Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.

Kaynak: sitenin genel incelemesi (kod + canlı şema + Supabase uyarıları). Bu belge incelemenin 1–9. maddelerini kapatır.

## 1. Engelleme tek yerde uygulanır
- Eskiden engel yalnız mesajlaşma/topluluk daveti/hikâye/alıntı/Space'teydi; Ana Sayfa, Keşfet, arama, yorumlar, beğeni, takip engelden habersizdi (engellenen kişi engelleyenin gönderisine yorum yazıp bildirim üretebiliyordu, engellenen yeniden takip edebiliyordu).
- Çözüm: `prompts / prompt_requests / workflows / presets / prompt_comments / community_posts` üzerinde **RESTRICTIVE SELECT politikası** (`*_hide_blocked`): iki yönde engel varsa satır okunamaz. `feed_page`, `for_you_page`, `search_content`, detay, profil sorguları INVOKER olduğu için fonksiyonları DEĞİŞTİRMEDEN kapsanır. Moderatör muafiyeti yok (`is_moderator` anon'a kapalı; politikada çağrılırsa ziyaretçi sorguları patlar); moderasyon ekranları DEFINER RPC'dir.
- `enforce_no_block_interaction` (INSERT öncesi): takip, yoruma yanıt, yorum beğenisi. `enforce_like_rules`: içerik/gönderi/Space/alıntı beğenisinde engel (beğeni INSERT politikası hedef okunabilirliğine bakmıyordu).
- Hata kodu `interaction_blocked`.

## 2. Askı / paylaşım engeli
- `_assert_can_act(p_content)` ortak denetim; `enforce_can_post` artık onu çağırır (iletiler aynı).
- Yeni INSERT tetikleyicileri: `spaces`, `chat_groups`, `community_posts`, `content_quotes`, `space_items`, `chat_group_join_requests`. (İnceleme sırasında `create_community`/`request_join_community` zaten `_group_actor` ile askıyı denetliyordu; gerçek boşluklar Space ve alıntı [askı] idi.)
- Yeni UPDATE tetikleyicisi `enforce_can_edit` (prompt/istek/workflow/hazır ayar/yorum/mesaj): askıdaki ya da paylaşım engelli kullanıcı KENDİ içeriğini düzenleyemez. Yalnız sahibin kendi eyleminde ve yalnız sayaç (`*_count`) / `updated_at` / `deleted_at` / `edited_at` dışı bir alan değiştiyse devreye girer — başkasının beğenisiyle sayaç güncellenmesi ve soft-delete engellenmez.

## 3 + 4. Hız sınırı ve rapor tekilliği
- `rate_limit_events` (yalnız-ekleyen olay günlüğü, RLS politikasız) + `_rate_limit(action, max, window)` (DEFINER, kullanıcı başına advisory kilit). Geri alınabilen eylemler (beğeni/takip aç-kapa) satır sayarak sınırlanamadığı için ayrı günlük.
- Sınırlar (INSERT öncesi, tablo → eylem, adet/pencere): prompts 30/sa · istekler 20/sa · workflow 20/sa · hazır ayar 30/sa · yorum 60/10 dk · beğeni 150/10 dk · yorum beğenisi 150/10 dk · takip 60/sa · mesaj 300/10 dk · konuşma başlatma 30/sa · kaydetme 200/10 dk · rapor 20/gün. Hata kodu `rate_limit`. Sunucu/seed (oturumsuz) etkilenmez. Topluluk/hikâye/alıntı sınırları kendi RPC'lerinde kalır.
- Rapor: açık bir rapor varken aynı kişi aynı hedefi tekrar raporlayamaz (`report_duplicate`, tetikleyici + kısmi unique indeks); çözülünce yeniden raporlayabilir. **Bilinçli olarak otomatik gizleme YOK:** N rapora göre içeriği gizlemek, sahte hesaplarla kolayca kötüye kullanılır; moderatör kararı kalır.

## 5. Metin uzunlukları (CHECK, `not valid` + `validate`)
Yorum 2000 · mesaj 32000 (canlıda 20851'lik paylaşım bloğu var) · prompt başlığı 200 / açıklaması 5000 / metni 50000 · istek başlığı 200 / açıklaması 5000 / yaratıcı yön 5000 · bio 500 · görünen ad 80 · web sitesi 300. (Workflow/hazır ayar başlık/açıklama sınırları zaten vardı.) İstemci: yorum kutuları `maxLength 2000`, mesaj yazma alanı `4000`.

## 6. Kendi içeriğini beğenme
Yeni beğeniler `self_like_not_allowed` ile reddedilir (yedi hedef türü). **Canlıdaki 2 eski kendi-beğeni satırına dokunulmadı** (silmek veri değişikliği; kullanıcı kararı). Arayüz: beğeni düğmesi sahibini bilmediği için hata toast olarak görünür (`error.selfLike`); sahibe özel pasif düğme yapılmadı.

## 7. Örnek (demo) hesaplar + bildirimler
- `profiles.is_demo` (yalnız sunucu yazar: `protect_profile_demo_flag`; migration `5eed0000-0000-4000-8000-%` kimliklerini işaretler). Profil bandında ve detay yazar satırında "Örnek hesap" rozeti (`DemoAccountBadge`, TR+EN). Kartlardaki küçük yazar satırına rozet konmadı.
- `prune_old_notifications()` (90 gün okunmuş / 180 gün tümü) + `pg_cron` varsa günlük iş (`20260923100100`).
- `supabase/seed/close-unanswered-demo-requests.sql`: ELLE çalıştırılan betik (migration değil) — yanıtsız demo isteklerini kapatır. Çalıştırılmadı.

## 8. Görselsiz prompt kartı
`PromptPreviewBox variant="art"`: kenarda marka şeridi + "PROMPT" başlık satırı (terminal) + uzun metinde sönen alt kenar. Yalnız token'lar, yeni renk yok.

## 9. Güvenlik uyarıları
- Tüm `public` tetikleyici fonksiyonlarından `anon/authenticated/public` EXECUTE kaldırıldı (`/rest/v1/rpc` ile çağrılamaz; `CREATE TRIGGER` dışında EXECUTE gerekmez).
- `protect_collection_follower_count` search_path sabitlendi.
- Dokunulmadı (bilinçli): RLS yardımcılarının (`can_read_*`, `is_blocked`…) anon/authenticated EXECUTE'ı — politikalarda çağrıldıkları için kapatmak ziyaretçi sorgularını bozar. `is_blocked(a, b)` ikisi de kendin değilken başkasının engel ilişkisini sızdırır; ayrı iş.

## İstemci
`src/lib/supabase/server-errors.ts`: Supabase `fetch`'i sarar; `/rest/v1/` 4xx gövdesindeki `rate_limit | interaction_blocked | self_like_not_allowed | report_duplicate` kodlarını kullanıcı dilinde cümleye çevirir (`error.*` anahtarları, TR+EN) ve `NoticeHost` (AppShell) ile toast gösterir (rapor penceresi kendi hatasını gösterdiği için rapor isteklerinde toast yok).

## Doğrulama
- `supabase/tests/safety-hardening.sql` 29 kontrol `FAILED=0`; eski SQL testleri `FAILED=0` (self-like / hız sınırı ile çakışan 4 test düzeltildi: `community-post-engagement`, `engagement-privacy`, `community-content`, `chat-features` — beğenileri başka kullanıcıya taşıdı / toplu kurulumu oturumsuz yaptı).
- `tests/messaging-ui/run-safety.mjs` (ağ taklitli): kodların TR/EN toast'u, bilinmeyen kodda toast yok, demo rozeti TR/EN, yorum `maxLength`. Mevcut paketler yeniden: `run-shared-cards` 11/11, `run-detail-pages` 45/45, `run-home-motion` 10/10, `run-profile-collections` 6/6, `run-feed-filters` 16/16.
- `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` 407/407, `npm run build` temiz.

## Bilinçli sınırlar
- Hız sınırı değerleri elle seçildi, gerçek kullanımla ayarlanmadı.
- Engelleme RLS ile çözüldüğü için engelli kişinin PROFİLİ hâlâ görünür (yalnız içeriği/yorumu gizlenir); engellenen kişinin sayaçları (beğeni sayısı vb.) değişmez.
- Restrictive politika her satırda `is_blocked` çağırır (oturumlu kullanıcıda); veri büyürse `blocks` için önbellekli bir küme fonksiyonu düşünülebilir.
- Mesaj DB sınırı (32000) istemci sınırından (4000) bilerek geniştir: paylaşım blokları programatik uzun olabilir.
