# 287 — "Contract" temizliği: `reports` doğrudan insert kapandı, `is_blocked` ziyaretçiye kapandı, ölü RPC'ler ve eski beğeniler gitti

**Durum:** uygulandı (üç migration: `20261031100000_reports_insert_via_rpc_only.sql`, `20261031100100_is_blocked_closed_to_anon.sql`,
`20261031100200_drop_saved_everywhere_and_self_likes.sql` [`-- ci:allow-destructive`]). Yerel PostgreSQL'de sınandı (`report-reasons.sql` 25 kontrol,
`contract-cleanup.sql` 4 kontrol, mutasyonlu: migration'lar çıkarılınca yeni kontroller kırılıyor; bütün diğer SQL dosyaları `FAILED=0`).
Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.

## Neden
286'daki canlı doğrulama, 284/241/224 notlarında "ayrı iş / onay bekliyor" diye kalan "contract" maddelerini listeledi. Bu belge onların
hangisinin yapıldığını, hangisinin neden yapılmadığını ve bir düzeltmeyi kaydeder.

## Yapılanlar
1. **`reports` doğrudan insert'i kapandı.** `submit_report` SECURITY INVOKER olduğu için insert'i `reports`'un INSERT politikasından geçirir; politikayı
   SİLMEK şikâyeti tümden bozardı. Bunun yerine politika `alter policy` ile daraltıldı: `auth.uid() = reporter_id` **ve**
   `current_setting('promptly.submit_report', true) = '1'`. `submit_report` insert'ten hemen önce bu işlem-yerel işareti koyar (`set_config(…, true)`)
   ve sonra temizler. İstemci bu işareti koyamaz (PostgREST yalnız `public` fonksiyonlarını açar, `set_config` açık değildir), yani eski
   "serbest metin, neden/hedef doğrulamasız" yol kapandı; yinelenme / günlük 20 sınırı / engel / askı tetikleyicileri aynen sürer. Eski
   (`reason_code` boş) satırlar olduğu gibi; kuyruk onları göstermeye devam eder. Bu bir **contract**tır: `reports`'a doğrudan yazan eski bir istemci
   artık reddedilir (yeni istemci 284'ten beri canlıda).
2. **`is_blocked` ziyaretçiye kapandı.** SECURITY DEFINER olduğu için `/rest/v1/rpc/is_blocked` ile iki kimlik verip "aralarında engel var mı" öğrenmek
   oturumsuz ziyaretçiye bile açıktı. Ziyaretçi (`auth.role() = 'anon'`) için artık her zaman `false`. **Davranış değişmez**: ziyaretçinin engeli yoktur ve
   politikalar onu zaten `auth.uid() is null or …` ile dışarıda tutar.
3. **`remove_prompt|workflow|preset_from_saved_everywhere` silindi.** Toplu "tüm koleksiyonlardan çıkar" RPC'leri; arayüz 168'de bilerek kaldırdı,
   istemci/Edge Function/betikler çağırmıyor.
4. **Sahibin kendi içeriğini beğendiği satırlar silindi** (canlıda 2: `aliq`'in kendi iki promptu, beğeniler 2026-10-16 ve 2026-10-21; her ikisinde beğeni anı
   promptun `updated_at` değeriyle birebir aynı). Beğeni sayacı ve tepki sayıları mevcut tetikleyicilerle düşer (`contract-cleanup.sql` bunu sınar);
   migration yeniden oynatılabilir. **Neden oluştuğu KANITLANMADI:** `enforce_like_rules` canlıda etkin ve yerelde sınanıyor (`safety-hardening.sql`), ama
   kuralın canlıya hangi tarihte girdiği `schema_migrations`'ta yok. Bu satırlar silindikten sonra yeniden belirirse bir delik vardır ve araştırılmalıdır:
   `select … from prompt_likes l join prompts t on t.id = l.prompt_id where t.author_id = l.user_id`.

## Bilerek YAPILMAYANLAR (ve neden)
- **`is_blocked`'ı "yalnız kendi engel ilişkim"e daraltmak.** Çağrı noktaları tarandı: 60'tan fazla yerde (grup/topluluk daveti, Space daveti, bildirim
  tetikleyicileri, `_group_*` yardımcıları) fonksiyon ÜÇÜNCÜ kişilerin ilişkisini sorgular (ör. topluluk sahibi ↔ davet edilen). Daraltmak `false` döndürüp
  engeli sessizce kapatırdı. Oturumlu tarafın tam kapatılması: iç çağrılar için ayrı bir (yalnız DEFINER gövdelerden çağrılan) yardımcı + politikaların
  ve INVOKER fonksiyonların ona taşınması gerekir — ayrı, geniş iş.
- **`spaces.shared_at`, `spaces.like_count`, `spaces_guard_shared`, `prompt_likes.space_id`.** `feed_page`'in 17 argümanlı gövdesinde `shared_at` 43 kez geçer
  (Space kolu); `content_engagers`, `handle_prompt_like_change`, `enforce_space_engagement`, `moderate_report`, `notify_comment_mentions` gövdelerinde de
  başvuru var. `prompt_likes.target_id` üretilmiş sütundur ve `space_id`'yi içerir: sütunu silmek onu yeniden kurmayı (tablo yeniden yazımı, iki dizin) ve
  istemci `likes.ts`'i değiştirmeyi gerektirir. Paylaşılan akış RPC'sini yeniden yazmak hiçbir kullanıcı kazancı olmadan her akışı riske atar; `feed_page`
  başka bir nedenle yeniden yazılırken bu kalıntılar da temizlenmeli.
- **`close-unanswered-demo-requests.sql` çalıştırılmadı.** Canlıda 44 açık istekten **41**'ini kapatırdı (İstekler bölümü boşalır): bir içerik kararı.
- **6 görselin `dominant_color`'ı.** Görsel tarayıcıda çözülerek hesaplanır (`lib/image-appearance.ts`); SQL ile doldurulamaz, moderatör düğmesi gerekir.

## Düzeltme (286 sonrası yanlış sınıflandırma)
Önceki durum notunda "ölü" sayılan iki nesne ÖLÜ DEĞİLDİR: `spaces.comment_count` (242'de geri açılan Space yorumlarının sayacı, `handle_prompt_comment_change`
yazar, istemci `spaces.ts` okur) ve `space_feed_cards` (alıntı kartındaki Space önizlemesi `spaces.ts`/`communities.ts` çağırır). İkisi de silinmemeli.
