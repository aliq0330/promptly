# 9.169 — Sayaç sütunlarını istemciden koruma

Durum: kod ve migration repoda, yerelde sınandı; **migration canlıya uygulanmadı** (`20260919920000_protect_counter_columns.sql`). Uygulanana kadar canlıda açık sürer.

## Sorun

İçeriğin sahibi kendi satırını güncelleyebildiği için (RLS "sahibi" der, `authenticated` için tablo düzeyinde UPDATE yetkisi var) istemci `like_count` / `save_count` / `comment_count` gibi sayaçları doğrudan yazabiliyordu; "Popüler" sıralaması buna bakar. Yalnız `prompts.copy_count` (160) ve `collections.follower_count` (166) korunuyordu.

## Doğrulama (düzeltmeden önce)

- Yerel: 87 migration temiz PostgreSQL 16'ya oynatıldı; sahip olarak `authenticated` rolüyle 8 tabloda sayaçlara 9999 yazıldı ve yeni satır eklerken (INSERT) sayaç verildi — hepsi kabul edildi (16 FAIL).
- Canlı (yalnız salt okunur sorgu): aynı 8 tabloda sahibine UPDATE politikası + `authenticated` UPDATE yetkisi var; koruma trigger'ı yalnız `copy_count` ve `collections.follower_count` için; `handle_collection_item_change` SECURITY INVOKER. Canlıda yazma denemesi yapılmadı.

## Çözüm

`protect_counter_columns()` — SECURITY INVOKER (aksi hâlde `current_user` hep fonksiyon sahibi olurdu); `current_user in ('anon','authenticated')` ise UPDATE'te korunan sütunlar eski değere, INSERT'te 0'a döner (`jsonb_populate_record`). Trigger'lar `UPDATE OF <sütunlar>` ile yalnız ilgili yazımlarda çalışır:

| Tablo | Korunan sütunlar |
|---|---|
| prompts | like, save, comment (copy zaten korunuyordu) |
| prompt_requests | like, comment, response |
| workflows | like, comment, save |
| presets | like, comment, save, use |
| prompt_results | like, comment |
| prompt_comments | like |
| profiles | follower, following |
| collections | item (follower zaten korunuyordu) |

Sayaçları güncelleyen trigger'lar SECURITY DEFINER olduğundan `current_user` orada sahiptir ve etkilenmez; migration/seed/Dashboard (postgres) ve service_role de etkilenmez.

**Bağımlılık:** `handle_collection_item_change` (collections.item_count) SECURITY INVOKER'dı; korunan sütuna yazdığı için SECURITY DEFINER + `search_path = public` yapıldı, yoksa koleksiyon sayısı sessizce güncellenmezdi.

**Kapsam dışı (bilinçli):** `conversation_members.unread_count` (istemci "okundu" için kendi satırında 0 yazar, yalnız kendini etkiler); `tags.*_count` (UPDATE politikası yok).

## Test

`supabase/tests/counter-protection.sql`: düzeltme sonrası 0 FAIL — sahip yazma denemeleri yok sayılır ama aynı UPDATE'teki `title`/`name` değişir; INSERT'te sayaç 0; beğeni/kaydet/yorum/takip/koleksiyon öğesi (istemci tarafı insert dahil) sayaçları hâlâ doğru artırıp azaltır; postgres hâlâ yazabilir. `saved-collections.sql` yeniden: 0 FAIL. İstemci kodunda sayaç yazan yer yok (yalnız `unread_count: 0`).

## Canlıya uygularken

Yalnızca ekleyici/değiştirici (`create or replace`, `alter function`; `drop` yok). Uygulamadan önce Dashboard → Backups kontrol edilmeli; sonra kaydı dosya sürümüyle düş. Doğrulama: sahibi bir hesapla `update prompts set like_count = 999` denemesi sessizce eski değeri bırakmalı.
