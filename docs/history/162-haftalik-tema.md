# 9.162 — Haftalık tema ("Haftanın teması")

Durum: uygulandı. Migration `20260919870000_weekly_challenges.sql` **canlıda uygulandı** (kayıt dosya sürümüyle düşüldü); arayüz kodu `main`'e birleşince yayınlanır (migration önce, kod sonra). Canlıda şu an hiç tema yok → bant hiçbir yerde görünmez; moderatör `/moderation → Temalar` sekmesinden ilk temayı oluşturunca belirir.

## Ne

Moderatörün belirlediği, **etiket tabanlı** topluluk teması. Katılım = o etiketle içerik paylaşmak; ayrı bir "katılım" tablosu yok, mevcut etiket sistemi kullanılır. Aktif tema `starts_at <= şimdi < ends_at` olan, arşivlenmemiş en yeni temadır. Ana sayfada (sekmelerin üstünde) ve Keşfet'te (boşta içeriğin başında) bir bant olarak görünür: başlık, açıklama, "N gün sonra sona eriyor", **Katıl** ve **Katılımları gör · #etiket**.

## Veritabanı

- `weekly_challenges`: TR + EN başlık (1–80) ve açıklama (≤300), `tag_slug` → `tags` (cascade), `starts_at/ends_at` (`ends_at > starts_at` CHECK), `archived`, `created_by`. RLS: herkes yalnızca `not archived` satırları OKUR; **yazma politikası yok**.
- Yazma yalnızca `admin_save_challenge(...)` ve `admin_archive_challenge(p_id)` (SECURITY DEFINER, `search_path = public`, `_admin_guard()` → yalnız moderatör). Etiket adla verilir ve `get_or_create_tag` ile oluşturulur/eşlenir. Silme yok, **arşivleme** var (geçmiş korunur). İşlemler `admin_audit_log`'a (`save_challenge` / `archive_challenge`) düşer.
- Yalnızca ekleyici: mevcut tablo/fonksiyon değişmedi, `drop` yok.

## Arayüz

- `lib/challenge.ts` (saf, `node --test`): durum (canlı/yaklaşan/bitmiş), aktif temayı seçme, dile göre metin, varsayılan pencere (7 gün), `datetime-local` ↔ ISO (saat dilimi farkıyla), form doğrulaması. `lib/supabase/challenges.ts`: `fetchActiveChallenge` (hata → bant yok; Ana sayfa asla bunun yüzünden bozulmaz), `fetchChallenges`, `saveChallenge`, `archiveChallenge`.
- `features/challenges/`: `useActiveChallenge` (60 sn modül önbelleği; Ana sayfa ↔ Keşfet arası ek istek yok), `WeeklyChallengeBanner`, `usePrefillTag`.
- Moderasyon → 4. sekme **Temalar** (`challenges-panel.tsx`): durum rozetli liste, oluştur/düzenle formu (TR+EN alanlar, etiket adı, başlangıç/bitiş), arşivle (onaylı). Doğrulama hataları RPC'ye gitmeden gösterilir.
- **Katıl → her türde:** bant `/create?tag=<slug>` açar; tür seçici (`CreateChoice`) `tag`'i seçilen türe taşır (Prompt `?mode=prompt&tag=`, İstek, Workflow, Hazır ayar) ve dört form da `usePrefillTag` ile etiketi seçili açar. Düzenleme (`?edit=`) ve kopya (`?duplicate=`) kendi etiketlerini korur, `?tag` yok sayılır; bilinmeyen etiket sessizce yok sayılır.
- Metinler TR+EN (`challenge.*`, `admin.challenge.*`, `admin.tabChallenges`, `admin.audit.*`).

## Etki alanı taraması

Ana sayfa ✔, Keşfet ✔, moderasyon ✔, oluşturma formları (4 tür) ✔, etiket sayfası (bant "Katılımları gör" ile oraya gider; sayfanın kendisi değişmedi). **Yapılmadı (bilinçli):** tema başlayınca bildirim (bildirimler yalnızca sunucu trigger'larıyla üretilir; toplu bildirim ayrı karar), etiket sayfasında bant, kartlarda rozet.

## Doğrulama

Yerel PostgreSQL 16: bütün migration'lar baştan oynatıldı; RPC senaryoları (moderatör olmayan reddi, doğrulama hataları, etiket oluşturma/eşleme, düzenleme, arşivleme, RLS'te arşivlenmişin okunamaması, denetim kaydı). Canlıda yapı/RLS/yetki/kayıt doğrulandı. Birim testleri (`challenge.test.ts`, 6; toplam 216). Tarayıcı (Playwright, durumlu sahte Supabase): Ana sayfa TR/EN (gelecek/biten tema görünmez), tema yoksa bant yok, Keşfet bandı, Katıl → seçici → form ve etiketin eklenmesi (4 tür ayrı ayrı), düzenlemede yok sayma, bilinmeyen etiket, moderatör paneli (liste, doğrulama, kaydet/düzenle/arşivle parametreleri, hata, moderatör olmayan erişemez). Gerçek Supabase'e karşı gerçek oturumla DENENMEDİ; dar ekranda (360px) bant ayrıca elle ölçülmedi.
