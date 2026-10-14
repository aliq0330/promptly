# 9.158 — Migration geçmişi uzlaştırması (canlı şema ↔ repo ↔ `schema_migrations`)

Durum: uygulandı (yalnızca geçmiş tablosuna EKLEME; şema değişmedi). `supabase db push` hâlâ önerilmez (aşağıda "Kalan").

## Sorun

Canlıda `supabase_migrations.schema_migrations` 49 satırdı ve sürümleri repo dosya adlarıyla eşleşmiyordu (MCP `apply_migration` kendi zaman damgasını yazar: `2026093…`–`2026101…`; repo dosyaları `20260919…`). İlk şema ve çok sayıda dosya SQL Editor ile uygulandığı için hiç kayıt yoktu. Riskler: `db push --include-all` kayıtsız 49 dosyayı **yeniden uygulamaya** kalkardı (çoğu idempotent değil), sıra/atlama hatası, "neyin uygulandığı" sorusunun kayıttan yanıtlanamaması.

## Yöntem (hiçbir migration yeniden çalıştırılmadı)

1. Repodaki tüm migration'ları **temiz yerel PostgreSQL 16'da baştan oynattım** (Supabase stub'larıyla: `auth`, `storage`, roller, `supabase_realtime`, varsayılan yetkiler).
2. Aynı parmak izi sorgularını yerelde ve canlıda (MCP, salt okunur) çalıştırıp karşılaştırdım: 43 tablo (kolon, kısıt, indeks, policy, trigger, RLS), 114 fonksiyon (tanım + EXECUTE yetkileri), Realtime yayını, storage bucket'ları ve 17 storage policy, `auth.users` trigger'ı, sekanslar, tablo yetkileri (903 satır), view/tip.
3. Sonuç: **canlı şema = repo oynatması.** Kalan farklar yalnızca kozmetik: 21 fonksiyon gövdesinde CRLF satır sonu (SQL Editor'den yapıştırılmış), `search_content` ve `start_direct_conversation`'da canlıda yorum satırı yok, `admin_conversation_messages`'ta canlıda `cm.` alias'ı (yorum/boşluk/CR temizlenince hash'ler birebir eşit).
4. Veri tohumları (şema karşılaştırması görmez) örnekle doğrulandı: 39 etiket, 32 kategori / 310 alt kategori, 19/19 varsayılan koleksiyon, `workflow_media` backfill'i (11). Her veri migration'ı tek tek doğrulanmadı.

## Repoda bulunan ve düzeltilen iki boşluk

- **Eksik dosya:** canlıdaki `20261002110844 multi_image_media` (`prompt_request_media`, `generator_media`, `workflow_media`) repoda hiç yoktu; bu yüzden repo temiz kurulumda `…660000`'da kırılıyordu. Canlı kayıttaki SQL'den birebir geri yazıldı: `20260919545000_multi_image_media.sql`.
- **Sıra çatışması:** `…740000_remove_generators` `studio_sessions`'a dokunuyor, ama `…640000_remove_studio` tabloyu ondan önce düşürüyor (canlıda `remove_studio` 740000'dan sonra uygulanmıştı). Üç ifade `to_regclass` korumasına alındı; tablo varsa davranış aynı, canlıya etkisi yok.
- `…690000_admin_console`'daki `admin_conversation_messages` canlıdaki `cm.` alias'lı sorguya hizalandı (mantık aynı).
- Sonuç: 80 dosyanın tamamı temiz DB'de baştan hatasız çalışıyor ve canlıyla aynı şemayı üretiyor.

## Yapılan canlı değişiklik (yalnız geçmiş tablosu)

Önceki durum: 49 satır, parmak izi `b94aaf69140fd63628a093aefb07bf7f` (`md5` of `version|name|md5(statements)`), sürüm aralığı `20260919710000` – `20261014104715`.

Repoda olup kaydı olmayan **79** dosya, repo sürümü + adıyla, `statements` boş olarak eklendi (aşağıdaki `INSERT`; `where not exists` ile idempotent). Mevcut 49 satıra dokunulmadı (sonrasında aynı parmak izi doğrulandı). Sonuç: 128 satır, 80 repo sürümünün hepsi kayıtlı, kopya sürüm yok.

> Bu, tam bir veritabanı yedeği DEĞİLDİR (bu ortamdan `pg_dump`/Dashboard yedeği alınamaz); yalnızca geçmiş tablosuna ekleme yapıldığı için geri dönüş yolu aşağıdaki `DELETE`'tir. Şema/veri değişikliği olmadığından ek yedek gerekmedi; yine de bir sonraki gerçek şema değişikliğinden önce Dashboard → Database → Backups kontrol edilmeli.

### Geri dönüş (yalnız bu uzlaştırmayı geri alır)

```sql
delete from supabase_migrations.schema_migrations
where statements is null and created_by is null
  and version in ('20260919120000', '20260919120100', '20260919120200', '20260919120300', '20260919120400', '20260919120500', '20260919120600', '20260919130000', '20260919140000', '20260919150000', '20260919160000', '20260919170000', '20260919180000', '20260919190000', '20260919200000', '20260919210000', '20260919220000', '20260919230000', '20260919240000', '20260919250000', '20260919260000', '20260919270000', '20260919280000', '20260919290000', '20260919300000', '20260919310000', '20260919320000', '20260919330000', '20260919340000', '20260919350000', '20260919360000', '20260919370000', '20260919380000', '20260919390000', '20260919400000', '20260919410000', '20260919420000', '20260919430000', '20260919440000', '20260919450000', '20260919460000', '20260919470000', '20260919480000', '20260919490000', '20260919500000', '20260919510000', '20260919520000', '20260919530000', '20260919540000', '20260919545000', '20260919550000', '20260919560000', '20260919570000', '20260919580000', '20260919590000', '20260919600000', '20260919610000', '20260919620000', '20260919630000', '20260919640000', '20260919650000', '20260919660000', '20260919670000', '20260919680000', '20260919690000', '20260919700000', '20260919720000', '20260919730000', '20260919740000', '20260919750000', '20260919760000', '20260919770000', '20260919780000', '20260919790000', '20260919800000', '20260919810000', '20260919820000', '20260919830000', '20260919840000');
```

### Uygulanan INSERT

```sql
insert into supabase_migrations.schema_migrations (version, name)
select v.version, v.name
from (values
  ('20260919120000', 'extensions_and_helpers'),
  ('20260919120100', 'profiles'),
  ('20260919120200', 'prompts_and_requests'),
  ('20260919120300', 'engagement'),
  ('20260919120400', 'messaging_and_notifications'),
  ('20260919120500', 'moderation'),
  ('20260919120600', 'seed_tags'),
  ('20260919130000', 'rls_policies'),
  ('20260919140000', 'storage'),
  ('20260919150000', 'request_response_workflow'),
  ('20260919160000', 'comment_likes_and_notifications'),
  ('20260919170000', 'comment_edit_delete'),
  ('20260919180000', 'notification_system_completion'),
  ('20260919190000', 'prompt_safe_delete'),
  ('20260919200000', 'messaging_content_and_edit'),
  ('20260919210000', 'messaging_requests_privacy_blocking'),
  ('20260919220000', 'messaging_realtime'),
  ('20260919230000', 'notification_targeting_and_previews'),
  ('20260919240000', 'message_reactions'),
  ('20260919250000', 'remix_merge_system'),
  ('20260919260000', 'collections'),
  ('20260919270000', 'default_collections'),
  ('20260919280000', 'smart_tags'),
  ('20260919290000', 'prompt_variables_and_edit_tracking'),
  ('20260919300000', 'generators'),
  ('20260919310000', 'generator_social_integration'),
  ('20260919320000', 'generator_parity'),
  ('20260919330000', 'remove_remix_system'),
  ('20260919340000', 'message_share_delete_fix'),
  ('20260919350000', 'request_safe_delete'),
  ('20260919360000', 'generator_comment_notification_fix'),
  ('20260919370000', 'request_like_support'),
  ('20260919380000', 'request_comment_count'),
  ('20260919390000', 'prompt_edit_suggestions'),
  ('20260919400000', 'edit_suggestion_public_credit'),
  ('20260919410000', 'prompt_results'),
  ('20260919420000', 'generator_prompt_results'),
  ('20260919430000', 'result_edit'),
  ('20260919440000', 'profile_preferences'),
  ('20260919450000', 'content_taxonomy'),
  ('20260919460000', 'ai_tool_metadata'),
  ('20260919470000', 'workflows'),
  ('20260919480000', 'workflow_social'),
  ('20260919490000', 'workflow_tags'),
  ('20260919500000', 'moderation'),
  ('20260919510000', 'direct_conversation_lock'),
  ('20260919520000', 'drafts'),
  ('20260919530000', 'notification_realtime'),
  ('20260919540000', 'engagement_counts_and_realtime'),
  ('20260919545000', 'multi_image_media'),
  ('20260919550000', 'content_statistics'),
  ('20260919560000', 'presets'),
  ('20260919570000', 'taxonomy_and_preset_fields'),
  ('20260919580000', 'content_visibility'),
  ('20260919590000', 'workflow_subcategory'),
  ('20260919600000', 'workflow_no_request_steps'),
  ('20260919610000', 'prompt_dna'),
  ('20260919620000', 'studio_sessions'),
  ('20260919630000', 'mono_palette'),
  ('20260919640000', 'remove_studio'),
  ('20260919650000', 'message_attachments'),
  ('20260919660000', 'orphan_storage_objects'),
  ('20260919670000', 'prompt_requires_reference'),
  ('20260919680000', 'reference_requirements'),
  ('20260919690000', 'admin_console'),
  ('20260919700000', 'admin_delete_user'),
  ('20260919720000', 'admin_dna_backfill'),
  ('20260919730000', 'prompt_variable_types'),
  ('20260919740000', 'remove_generators'),
  ('20260919750000', 'security_hardening'),
  ('20260919760000', 'private_media_buckets'),
  ('20260919770000', 'feed_page'),
  ('20260919780000', 'search_content'),
  ('20260919790000', 'related_content'),
  ('20260919800000', 'delete_account_data'),
  ('20260919810000', 'oauth_display_name'),
  ('20260919820000', 'feed_page_oldest_open_only'),
  ('20260919830000', 'auth_login_attempts'),
  ('20260919840000', 'drop_prompt_saves')
) as v(version, name)
where not exists (select 1 from supabase_migrations.schema_migrations s where s.version = v.version);
```

## Kalan ve kural

- Canlıda hâlâ **48 "MCP sürümlü" satır** var (`2026093…`–`2026101…`, repo dosyasıyla aynı etkiyi temsil eder). `supabase db push`/`migration list` onları "yerelde yok" diye raporlar ve durur — artık kör yeniden-uygulama değil, güvenli hata. Geçmişi tek-sürümlü (yalnız repo sürümleri) yapmak için bu 48 satırın `supabase migration repair --status reverted` ile (ya da `delete`) kaldırılması gerekir; bu, mevcut kayıtları siler, bu yüzden **ayrı onay** ister ve yapılmadı.
- **Kural (bundan sonra):** yeni migration dosyası `supabase/migrations/` altına eklenir; canlıya uygulanınca `schema_migrations`'a **dosyanın kendi sürümüyle** kayıt düşülür (MCP `apply_migration` ayrı bir zaman damgası yazar ve aynı sorunu yeniden üretir — onu kullanıyorsan ardından yukarıdaki INSERT kalıbıyla repo sürümünü de ekle ya da SQL'i `execute_sql` ile çalıştırıp yalnız repo sürümünü kaydet). `db push` bu depoda hâlâ güvenilir değildir.
- Bu oturumdan sonraki `820000`/`830000` migration'ları canlıya MCP ile uygulandığı için iki kez kayıtlıdır (MCP sürümü + repo sürümü); zararsız.
