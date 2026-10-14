# 9.157 — Keşfet sunucu sayfalaması ve altyapı sertleştirme

Durum: kod + migration dosyaları repoda; **migration'lar ve Edge Function değişikliği canlıda uygulanmadı** (aşağıda tablo).

## Keşfet karma akışı → `public.feed_page`

Eskiden `discover-feed.tsx`, RealPrompts/Requests/Workflows/Presets önbelleğinin ilk sayfasını (PAGE_SIZE 60, `created_at` azalan) tarayıcıda süzüp sıralıyordu; `loadMore` çağrılmıyordu. "En çok beğenilen" bu yüzden en yeni 60'ın içindeydi. Şimdi:

- Yeni RPC YOK: `feed_page` genişledi (`20260919820000_feed_page_oldest_open_only.sql`). `p_order = 'oldest'` → `(sort_rank, created_at, id)` ARTAN; imleç karşılaştırması `>` (azalan sıralarda `<`); imleç yine son HAM satırdan. `p_open_only` yalnızca request kolunu `status = 'open'` ile süzer. Limit ≤ 50, security invoker, `search_path = public`, anon+authenticated grant, görünürlük koşulları aynen.
- **İmza kararı (DROP yok):** parametre eklemek yeni (11 argümanlı) imza demektir. Eski 10 argümanlı imzayı `drop function` ile silmek bu işte onaylı değildi; bırakıp `p_open_only`e varsayılan vermek iki aşırı yüklemeyi belirsiz yapar (`function is not unique`) ve Ana sayfayı bozar. Bu yüzden 11 argümanlı fonksiyon tüm mantığı taşır (`p_open_only` varsayılansız), eski imza aynı imzayla `create or replace` edilip `p_open_only := false` ile ona yönlenen ince sarmalayıcıya dönüştü. Ana sayfa parametreyi hiç geçmez. Sarmalayıcıyı kaldırıp `p_open_only boolean default false` vermek ayrı, onaylı bir `drop function` migration'ı ister.
- İstemci: `src/lib/feed-cursor.ts` (saf: `isAfterCursor`, `compareFeedRows`, `nextFeedCursor`, `feedOrderForSort`; Keşfet sıralaması most-liked→popular, newest→newest, oldest→oldest). `fetchFeedPage` `openOnly` alır (yalnızca true ise `p_open_only` gönderir). Keşfet, Ana sayfayla AYNI `useFeedPages` hook'unu kullanır (ilk sayfa, "Daha fazla yükle", geç yanıt eski sekmeyi yazmaz, hatada yeniden dene). Bölüm → `p_kinds`; taksonomi mevcut `p_content_type/category/subcategory`; "Açık istekler" çipi `p_open_only`. Boş/hata metinleri mevcut i18n anahtarları (`discover.noMatch*`, `feed.loadFailed`, `common.retry/loadMore`).
- Davranış farkı: Keşfet "En çok beğenilen" artık tüm türlerde `like_count`'tur (eskiden istek için `responseCount × 15` sezgisi).
- Yaratıcılar sekmesi `feed_page` değildir: `fetchCreatorsPage` (`follower_count desc, id desc` keyset, hatada fırlatır) + `useCreatorPages` + "Daha fazla yükle". `fetchTopCreators(12)` ve sessiz tavanı kaldırıldı. Trend etiket şeridi (`fetchPopularTags(14)`) çip satırı olarak kaldı.
- Liste sayfaları (`/prompts` …) kendi provider `loadMore`'larını kullanmaya devam eder; Ana sayfa ve arama (`search_content`) dokunulmadı.

Doğrulama: oldest/popular/newest imleç karşılaştırması `src/lib/feed-cursor.test.ts` ile test edildi (`npm test`); SQL yerel PostgreSQL 16'da sentetik tablolarla denendi (her sıra için sayfa sayfa gezme eksiksiz/tekrarsız/sıralı, `p_open_only` yalnızca request kolunu süzer, Ana sayfanın 10 argümanlı çağrısı belirsiz değil). Gerçek Supabase'e / tarayıcıda gerçek veriyle DENENMEDİ.

## CI

`deploy.yml`'e "Unit tests" (`npm test`) adımı eklendi (Build'den önce; başarısızlıkta Pages'e basılmaz). Testler ağ/sır gerektirmez. Yeni test çerçevesi kurulmadı; `feed-cursor.test.ts` `npm test` komutuna eklendi.

## Edge Function deploy aracı

`supabase/config.toml` (yalnızca dört fonksiyonun `verify_jwt`'si), `scripts/deploy-functions.sh`, `.github/workflows/deploy-functions.yml` (yalnız `workflow_dispatch`; `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` yoksa fail; Pages deploy'una bağlı değil). Fonksiyon gövdeleri bu başlıkta değişmedi. README'de anlatıldı. Workflow henüz çalıştırılmadı.

## `username-login` sertleştirme

`20260919830000_auth_login_attempts.sql`: `auth_login_attempts` (RLS açık, policy yok) + `auth_login_attempt(p_ip text)` (security definer, `search_path = public`, yalnız `service_role`; ham IP saklanmaz, SHA-256 hex içeride üretilir; satırı ekler, son 60 sn'de > 10 ise true; 1 günden eski satırlar silinir). Parametre ham IP'yi aldığı için `p_ip` adlıdır (`p_ip_hash` yanıltıcı olurdu). Fonksiyon: bellek içi Map silindi, önce RPC'ye sorar; RPC hata verirse (ör. migration uygulanmamış) hata loglanır ve fail-open çalışır. CORS `*` kalktı: `https://aliq0330.github.io`, `http://localhost:3000`, `chrome-extension://…` yansıtılır; Origin yoksa başlık eklenmeden işlenir; diğerleri 403. `verify_jwt` kapalı kalır; `promptly-extension` değişmedi. Yerel PostgreSQL'de RPC denendi (10 serbest/sonrası sınırlı, eski satır silinir, ham IP yok, anon/authenticated çalıştıramaz). Deno kodu çalıştırılmadı, canlıya DEPLOY EDİLMEDİ.

## `prompt_saves` ve Generator kalıntıları

Kodda `.from("prompt_saves")` yoktu (yalnızca yorumlar). `20260919840000_drop_prompt_saves.sql` yalnızca `prompt_saves`'in policy/indeksini ve tablosunu atar (`cascade` yok; tablo yoksa no-op). Canlıda salt okunur kontrol: 0 satır, 3 policy, 2 indeks, trigger/view/fonksiyon bağımlılığı yok. Seed'lerdeki `delete from public.prompt_saves` tablo yoksa no-op oldu. `notification-message.ts`'ten Generator kalıpları ve yalnız onlara ait `notifMsg.*Generator` anahtarları silindi (eski Generator bildirimleri artık ham mesaj olarak görünür). Yorumlar güncellendi.

## Canlı durum

| Değişiklik | Canlıda |
|---|---|
| `20260919710000 content_relations` geçmiş kaydı | uygulandı (tek INSERT; önce iki doğrulama SELECT'i beklenen sonucu verdi) |
| `20260919820000_feed_page_oldest_open_only.sql` | **uygulanmadı** |
| `20260919830000_auth_login_attempts.sql` | **uygulanmadı** |
| `20260919840000_drop_prompt_saves.sql` | **uygulanmadı** (canlı DROP için ayrıca istenmedi) |
| `username-login` yeni sürümü | **deploy edilmedi** |
| `deploy-functions` workflow'u | çalıştırılmadı |

Uygulama sırası: 820000 (Keşfet bu olmadan `oldest`/`open only` çağrılarında hata gösterir), 830000, sonra `username-login` deploy.
