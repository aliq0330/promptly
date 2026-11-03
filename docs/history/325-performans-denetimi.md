# 325 — Kapsamlı performans denetimi, darboğaz tespiti ve ilk optimizasyonlar

Tarih: 2026-11-03 · Durum: **kodda uygulandı; migration canlıya UYGULANMADI** (`20261103100000_performance_indexes_and_rls.sql`, deploy hattı uygular).

## 0. Kanıt düzeyleri (her sayının yanında hangisi olduğu yazılıdır)

| Etiket | Anlamı |
|---|---|
| **[CANLI-ÖLÇÜM]** | Canlı Supabase projesinde (`xqxybhjcyrvaroknucdq`) yalnız OKUMA yapan sorgularla alındı: `pg_stat_statements` (2026-09-19'dan beri birikmiş), `pg_stat_user_tables`, `storage.objects`, advisör. Önce/sonra karşılaştırmaları **geri alınan işlemlerde** (`begin … rollback`) `authenticated` rolü + gerçek bir kullanıcı kimliğiyle (RLS açık) yapıldı; canlıda KALICI değişiklik yapılmadı. Süreler 5–7 tekrarın **medyanıdır** (tek atışlar gürültülü: aynı sorgu 329 ms/88 ms ölçülebildi). |
| **[YEREL-ÖLÇÜM]** | Bu sandbox'ta `next build` çıktısından (bundle boyutları, gzip), yerel PostgreSQL 16'da SQL testleri. |
| **[TAKLİT-AĞ]** | Playwright + `tests/messaging-ui/mock.mjs`: istemcinin KAÇ istek attığı/sırası/tekrarı. **Süre ve gövde boyutu ölçülmez.** |
| **[KOD]** | Kaynak okunarak saptandı, ölçülmedi. |
| **[TAHMİN]** | Gerekçeli beklenti; ölçülmedi. |
| **[ÖLÇÜLEMEDİ]** | Bu ortamda yapılamaz (aşağıda ne gerektiği yazılı). |

Sandbox `*.supabase.co` ve canlı siteye doğrudan erişemez: gerçek ağ şelalesi, Lighthouse/Web Vitals ve gerçek kullanıcı trafiği **ölçülemedi** (bkz. §9 ve §10 — araç hazır).

---

## 1. Özet (en önemli bulgular)

1. **Her `(app)` sayfası 4 liste sorgusu atıyordu** (60'ar prompt/istek/workflow/hazır ayar + medya/etiket/profil gömmeleri) — Ayarlar, Bildirimler, Mesajlar dahil, listeyi hiç göstermeyen sayfalarda da. [KOD + TAKLİT-AĞ: `/settings/` 16 → 10 istek]. Sunucu tarafı kanıtı: `prompts … ORDER BY created_at DESC` sorgusu 750 çağrı, ort. 216 ms [CANLI-ÖLÇÜM].
2. **RLS "engellenen yazarı gizle" politikası satır başına `is_blocked()` çağırıyordu** (SECURITY DEFINER, satır içine alınamaz). Altı içerik tablosunun hepsinin okumasını yavaşlatıyordu. Sorgu başına bir kez (InitPlan) hesaplanınca: feed 88,7→43,0 ms, Sana özel 159,7→100,6 ms, kişi önerisi 131,4→28,0 ms (medyan) [CANLI-ÖLÇÜM].
3. **`trending_tags` en pahalı uygulama sorgusu**: 1 182 çağrı × ort. 973 ms = 1 150 sn toplam [CANLI-ÖLÇÜM, pg_stat_statements]; medyan 456,8 → 13,9 ms.
4. **`related_prompts`**: her belirteç için ayrı GIN sayımı (157 202 buffer/çağrı); medyan 632 → 99,8 ms, 10 prompta eski sonuçla birebir aynı.
5. **i18n sözlüğü 160 KB gzip (565 KB ham) ve `/login` dahil HER sayfanın ilk JS'inde** [YEREL-ÖLÇÜM]; ilk yüklemenin en büyük tek kalemi. Bu turda DEĞİŞTİRİLMEDİ (mimari değişiklik, bkz. §7).
6. Medya: canlıdaki medya satırlarının **%97'si (354/365)** GitHub Pages'teki tohum dosyalarını gösteriyor, Supabase Storage'ı değil [CANLI-ÖLÇÜM]; gerçek kullanıcı yüklemeleri küçük (ort. 194–381 KB, JPEG).

## 2. Ölçülen önce/sonra

### 2.1 Veritabanı [CANLI-ÖLÇÜM, `authenticated`, RLS açık, medyan]

| Sorgu | Önce | Sonra | Neden |
|---|---:|---:|---|
| `trending_tags(12,7)` | 456,8 ms (125 204 buffer) | **13,9 ms** | tanımlayan yetkisiyle + açık herkese açık süzgeci (RLS satır başı maliyeti yok) |
| Herkese açık "beğeniye göre" liste (PostgREST şekli, gömmelerle) | 52,7 ms | 3,8 ms (politika) → **0,4 ms** (+indeks) | `blocked_user_ids()` InitPlan + `prompts_public_like_idx` |
| `feed_page('all','newest',18)` | 88,7 ms | **43,0 ms** | politika |
| `for_you_page` | 159,7 ms | **100,6 ms** | politika |
| `suggest_creators(8)` | 131,4 ms | **28,0 ms** | politika |
| `related_prompts(top-liked)` | 632,1 ms (ilk soğuk çalışma 1 437 ms / 157 202 buffer) | **99,8 ms** (8 660 buffer) | tek geçişte belirteç sıklığı |

Notlar/dürüstlük: (a) `pg_stat_statements` ortalamaları (ör. popüler liste 2 sn, `for_you_page` 964 ms) benim yalıtılmış ölçümlerimden çok daha yüksek; fark eşzamanlı yük, soğuk önbellek ve Eylül–Ekim'deki toplu yükleme dönemini içeren istatistik penceresinden gelir — mutlak üretim süresi **bu sayılardan çıkarılamaz**, yalnız göreli iyileşme güvenilirdir. (b) Tablolar küçük (3 457 prompt); maliyetler tabloyla **doğrusal** büyür, bu yüzden kazanç büyük tabloda artar. (c) Migration canlıya uygulanınca `pg_stat_statements_reset()` yapılmadan yeni ortalama eski birikimle karışır — §10'daki sorgular `calls` farkına bakar.

### 2.2 İstemci istek sayıları [TAKLİT-AĞ, `tests/perf/measure-requests.mjs`, 10 senaryo × (ilk + 2. yükleme)]

| Senaryo | Önce | Sonra |
|---|---:|---:|
| Ana sayfa (oturumlu) ilk / 2. yükleme | 24 / 24 | 19 / 15 |
| Ana sayfa (ziyaretçi) | 10 / 10 | 6 / 4 |
| Keşfet | 23 / 23 | 18 / 14 |
| Prompt detay | 16 / 16 | 11 / 7 |
| Prompt listesi (listeyi GÖSTEREN sayfa) | 15 / 15 | 11 / 7 |
| Ayarlar | 16 / 16 | 10 / 6 |
| Bildirimler | 15 / 15 | 10 / 6 |
| Topluluklar | 21 / 21 | 16 / 12 |
| Mesajlar | 15 / 15 | 10 / 6 |
| Profil | 25 / 25 | 20 / 16 |
| **Toplam (20 ölçüm)** | **360** | **224 (−%38)** |

"2. yükleme" = aynı bağlamda yeniden yükleme (localStorage korunur): dispatch RPC kısıtı + taksonomi önbelleği burada görünür. **Süre/bayt ölçülmedi**; Prompt listesi sayfası hâlâ 4 liste yerine 1 liste sorgusu atar (kendi listesi).

### 2.3 Bundle [YEREL-ÖLÇÜM, `next build`, değişmedi]

Tüm sayfaların ilk JS'i (ham / gzip): `/login` 1 430 / 415 KB · `/` 2 240 / 661 KB · `/discover` 2 345 / 690 KB · `/prompts/local` 2 254 / 662 KB · `/communities/local` 2 329 / 680 KB · `/messages` 1 826 / 534 KB · `/create` 2 372 / 711 KB · CSS 198 KB (gzip 30 KB, tek dosya). Derleme: ~65 sn soğuk, ~16 sn önbellekli. En büyük parçalar: i18n sözlüğü 565 KB (160 KB gz), `@supabase` (auth+realtime) 244 KB (65 KB gz), react-dom 224 KB (72 KB gz), lottie 164 KB (**tembel**, ilk yüklemede yok ✔).

---

## 3. A — Network Waterfall raporu

**Gerçek şelale ölçülemedi** [ÖLÇÜLEMEDİ] (ağ yok). Elimizde: istemcinin hangi istekleri, hangi sırayla, kaç kez attığı [TAKLİT-AĞ] ve bunu CANLI sitede gerçek süre/TTFB/boyutla ölçecek araç (`tests/perf/measure-requests.mjs --live=…`, §9).

**Ana sayfa, oturumlu — istek zinciri (sonra; sıra gerçek, süreler taklit):**
- t0 (paralel, auth'a bağlı DEĞİL): `taxonomy_categories`, `taxonomy_subcategories`, `weekly_challenges`, `rpc trending_tags`, `profiles` ×3 (öne çıkan yaratıcılar, kendi profil, tercihler).
- Oturum çözülünce (`auth/v1/user` → `AuthProvider.user`): `is_moderator`, `story_tray`, `tag_follows`, `tool_follows`, `for_you_page`, `suggest_creators`, `notifications` (GET + HEAD sayım), `dispatch_my_event_reminders`, `dispatch_my_weekly_digest`, `conversation_members`, `follows`. **Bunlar oturum çözülmeden başlamaz** (birbirini bekleyen zincir) — oturum zaten yerelde (localStorage) olduğundan beklenen gecikme küçük, ama `getSession()` sonucunu beklemeden önbellekten kimlik okunsa bu grup ilk gruba biner [KOD, kazanç ölçülemedi].
- Tekrarlananlar (önce): `is_moderator` 2–3× (ölçüldü, düzeltildi); 4 liste sorgusu hiçbir sayfa için gerekmeyen (düzeltildi).
- Hâlâ ayrı: `GET notifications` + `HEAD notifications` (liste + okunmamış sayım) tek RPC'ye birleşebilir; `profiles` ×3 farklı alan seti birleşebilir [KOD, düşük kazanç].
- Realtime: sayfa başına 3 kalıcı kanal (`engagement-counts`, `notifications:<uid>`, `conversation-members:<uid>`) + açık sohbette 4–5 (`messages`, `message_reactions`, `read`, `chat_group`, `pins`, `typing`). Sunucu tarafı yan etkisi [CANLI-ÖLÇÜM]: `pg_publication_tables` sorgusu 37 358 çağrı, `realtime.subscription` 31 911 seq-scan.

Bayt boyutları (istek/transfer): **taklitte ölçülmez**; gerçek değerler için canlı kip. Canlıdan türetilen tek bayt örneği [CANLI-ÖLÇÜM]: en yeni 60 prompt = 23,5 KB prompt metni + 17,4 KB açıklama + 9,2 KB medya JSON'u (+ etiket/profil gömmeleri) — kaldırılan 4 liste isteğinin yalnız prompt kısmı ≥ 50 KB.

## 4. B — Veritabanı sorgu haritası

Sayfa → erişilen tablo/RPC (istek sayıları §2.2'deki "sonra"; her satırdaki tekrar/gereksiz durumu belirtilmiştir). JOIN'ler PostgREST gömmeleridir (`profiles`, `prompt_media`, `prompt_tags→tags` lateral).

| Sayfa | Tablolar / RPC'ler | Notlar |
|---|---|---|
| Ana sayfa | `taxonomy_*`, `weekly_challenges`, `trending_tags`, `profiles`×3, `for_you_page`/`feed_page`, `suggest_creators`, `story_tray`, `tag_follows`, `tool_follows`, `follows`, `notifications`, `conversation_members`, `is_moderator` | `feed_page`/`for_you_page` sonrası `prompts`+gömmeler (id listesi, 18). Sıralama anahtarı CASE ifadesi olduğundan indeks kullanamaz → tüm herkese açık satırlar taranır (O(N)); bugün 3,4 bin satırda 43 ms. |
| Keşfet | + `tags`, `prompts` ×3 (popüler şeridi vb.), `feed_page` | Popüler şerit sorgusu için yeni kısmi indeks. |
| Prompt detay | `prompts`+gömmeler, `related_prompts`, yorumlar (`fetchCommentThreadPage`), `reaction_stats`, `prompt_works_state`, `list_public_spaces` | `related_prompts` düzeltildi; yorumlar 20'şerli sayfa ✔. |
| Profil | `profiles`, `profile_content_stats`, `prompts` (sayfalı), `collections`, `stories`, `story_highlights` | Sayaçlar sunucuda ✔. |
| Topluluklar | `list_my_communities`, `discover_*`/`recommend_communities`, `my_community_unseen_counts`, `member_feed_page` | `list_my_communities` ort. 48 ms, maks 2,9 sn [CANLI-ÖLÇÜM]. |
| Mesajlar | `conversation_members`+gömme, `conversation_last_messages` (4 525 çağrı, ort. 28 ms), `messages` (Realtime) | Toplu RPC ✔ (N+1 yok). |
| Bildirimler | `notifications` (8 097 çağrı × 17 ms) + `profiles` gömme (`actor`: bio/cover/website de çekiliyor) | Gereksiz sütun [KOD]. |

**İndeksler [CANLI-ÖLÇÜM]:** `prompts` 1,26 MB indeks / 3 457 satır; hepsi küçük. Kullanılmayan indeks: 47 (hepsi ≤312 KB, toplam <1,5 MB) → **kaldırılmadı** (bu ölçekte "kullanılmıyor" kanıt değildir; planlayıcı küçük tabloda seq-scan seçer). Kapsayıcı olmayan yabancı anahtar: 73 (INFO) — sıcak olanlar: `messages.sender_id/reply_to/shared_*`, `notifications.actor_id`, `community_posts.space_id`; tablolar büyüyünce eklenmeli (şimdi yazma maliyeti > kazanç). Bu turda eklenen tek indeks: `prompts_public_like_idx` (kısmi, `like_count desc, id`).

**Seq-scan istatistiği [CANLI-ÖLÇÜM]:** `prompts` 9 826 tarama / 12,9 M okunan satır (tablo 3,4 bin satır → ort. ~1 300 satır/tarama, feed/öneri RPC'lerinin O(N) doğası); `prompt_dna_sections` 1 315 tarama / 12 M satır (**`related_prompts` kaynaklı, düzeltildi**); `prompt_comments` 9 299 / 4,1 M (1 002 satır; küçük tabloda planlayıcı seçimi, sorun değil).

**Sayfalama:** keyset (cursor) ✔ (`feed_page`, `FeedCursor`); OFFSET kullanan yerler: PostgREST `range` ile liste sayfaları (`usePagedList`, 24'lük) — derinde yavaşlar, bilinen sınır (`257-*`). COUNT: ilk sayfada `count: exact` (tablo küçük); büyüyünce `estimated`.

**Birleştirilebilecek sorgular:** `notifications` GET + HEAD; `profiles` ×3; `tag_follows` + `tool_follows` (iki küçük okuma) [KOD, düşük kazanç — uygulanmadı].

## 5. C — Varlık ağırlık haritası

Dağıtılan dışa aktarım `out/`: **85,9 MB** (tohum medya 70,5 MB, `_next/static` 7,4 MB, 72 HTML 3,0 MB) [YEREL-ÖLÇÜM]. Tohum medya yalnız satırlar onu gösterdiğinde indirilir; ilk yüklemeye girmez.

**Tohum medya [YEREL-ÖLÇÜM + CANLI-ÖLÇÜM]:** `public/seed-media`: 255 JPEG (ort. 62 KB; 145× 512², 85× 480², 32× 1024²), 85 MP3 (30 MB, her biri ~352 KB, hepsi farklı), 85 MP4 (14 MB, ort. 165 KB, en büyük 568 KB). `public/viral-seed`: 72 JPEG (ort. 141 KB; 31× 853×1280, 8× 1280×853), toplam 14 MB. Canlı satırlar: 354/365 `prompt_media` ve 170/206 `prompt_results` bu dosyaları gösteriyor.

| Kaynak | Boyut | Kullanıldığı yer | Yükleme önceliği / lazy | Alternatif / tahmini tasarruf |
|---|---|---|---|---|
| `_next/static/chunks/20jepvd0i5wew.js` (i18n sözlüğü) | 565 KB (160 KB gz) | HER sayfa | render-engelleyici (`async` script) | dile göre bölme → kullanıcı başına ~80 KB gz [TAHMİN, §7] |
| `…/1f3l6x9pgin_x.js` (supabase-js: auth+realtime) | 244 KB (65 KB gz) | her sayfa | zorunlu | realtime'ı gerektiğinde yükleme ~25 KB gz [TAHMİN] |
| react-dom | 224 KB (72 KB gz) | her sayfa | zorunlu | — |
| lottie (tepki animasyonu) | 164 KB | yalnız tepki seçici | **tembel ✔** | — |
| CSS tek dosya | 190 KB (30 KB gz) | her sayfa | render-engelleyici | küçük; bölme kazancı düşük |
| `seed-media/*.mp3` ×85 | 30 MB | ses kartları (oynatma/Odak) | `preload="metadata"`, etkinse `auto` ✔; kart yalnız görünür alana yaklaşınca arar ✔ | 96 kbps'e yeniden kodlama ~%40 [TAHMİN] |
| `seed-media/*.mp4` ×85 | 14 MB | video kartları | aynı ✔ | — |
| `viral-seed/*.jpg` 853×1280 | ort. 190 KB | kart görseli (~360 css px) | `StorageAppearanceImage` ✔ (renk→bulanık→görsel), `loading=lazy` | 480–720 px genişlik varyantı + WebP: dosya başına ~%50–60 [TAHMİN]; satırlardaki URL'ler veri olduğundan canlı veri göçü gerekir |
| Supabase `result-media`/`prompt-media` | ort. 194–381 KB, maks 539 KB | detay/kart | imzalı URL, toplu imzalama ✔ (`createSignedUrls`) | yükleme zaten ≤1600 px JPEG; kart için 480 px küçük resim yalnız sonuçlarda var (`prompt-result-media.ts`), prompt görselinde YOK [KOD] |

**En büyük 50 dosya** (`out/`, boyuta göre): 47'si tohum MP3/MP4, 1'i i18n chunk'ı (aşağıda ayrıca): tohum dışı ilk 30 dosya:

| # | Dosya | Boyut |
|---|---|---:|
| 1 | `_next/static/chunks/20jepvd0i5wew.js` | 565 KB |
| 2 | `_next/static/chunks/1f3l6x9pgin_x.js` | 244 KB |
| 3 | `_next/static/chunks/3kmozkq6tgqnz.js` | 224 KB |
| 4 | `_next/static/chunks/2_d150v6319pr.css` | 190 KB |
| 5 | `_next/static/chunks/0stpraxlbcmso.js` | 164 KB |
| 6 | `_next/static/chunks/206y8635-6dlb.js` | 152 KB |
| 7 | `_next/static/chunks/42y8f4hmdjs0x.js` | 135 KB |
| 8 | `_next/static/chunks/0kiet-_8c-6ja.js` | 134 KB |
| 9 | `_next/static/chunks/2uwdrwg3u3olh.js` | 122 KB |
| 10 | `_next/static/chunks/0cz1d0mv5g_q7.js` | 110 KB |
| 11 | `_next/static/chunks/22cc5ofjk-zu-.js` | 109 KB |
| 12 | `_next/static/chunks/0zjy-r_kkuhlw.js` | 106 KB |
| 13 | `_next/static/chunks/1joarwpupaw0e.js` | 100 KB |
| 14 | `developers/index.html` | 90 KB |
| 15 | `_next/static/chunks/31c4p3j1bl7k9.js` | 90 KB |
| 16 | `_next/static/chunks/3kgxkz_0rica7.js` | 85 KB |
| 17 | `reactions/wow.svg` | 79 KB |
| 18 | `_next/static/chunks/2tqmndrqen_fh.js` | 74 KB |
| 19 | `_next/static/chunks/0no4q1ho5ahh4.js` | 73 KB |
| 20 | `_next/static/chunks/2439xfj67waqb.js` | 72 KB |
| 21 | `_next/static/chunks/0tnl5xnpgt7fh.js` | 66 KB |
| 22 | `reactions/clap-fx.tgs` | 64 KB |
| 23 | `_next/static/chunks/1ca0o8v9kcay1.js` | 63 KB |
| 24 | `_next/static/chunks/0wjmzfx0hsfbj.js` | 63 KB |
| 25 | `reactions/love-fx.tgs` | 63 KB |
| 26 | `_next/static/chunks/1i88_qwgd4dui.js` | 62 KB |
| 27 | `_next/static/chunks/11abx_4w15j_r.js` | 61 KB |
| 28 | `_next/static/media/5e3a2858f2997077-s.p.1t1ox7t-8xjh-.woff2` | 61 KB |
| 29 | `reactions/haha-fx.tgs` | 61 KB |
| 30 | `reactions/fire.svg` | 60 KB |

Tüm top-50 (ham liste): `v-026.mp4` 568 KB · `v-066.mp4` 504 KB · `v-022.mp4` 397 KB · `a-084.mp3` / `a-044.mp3` / `a-083…039.mp3` (44 adet, 352–353 KB) · i18n chunk 565 KB. Ayrıntılı döküm: `find out -type f -printf '%s %P\n' | sort -rn | head -50`.

**Görsel kuralları (kalite düşürmeden önerilen):** avatar ≤128 px (`avatars` ort. 25 KB ✔); kart görseli 480–720 px; detay ≤1600 px (mevcut); kapak responsive. `next/image` `unoptimized` (statik dışa aktarım) → `srcset`/`sizes` ÜRETİLMEZ; çözüm yükleme anında çoklu boyut üretmektir (`prompt-result-media` kalıbı). CLS: kart `StorageAppearanceImage` kayıtlı renk/oranla yer ayırır ✔; ölçülen CLS (taklit, yol gösterici değil) 0,001–0,12 (ana sayfa 0,12 → şerit/ilk gönderi yerleşimi, canlıda doğrulanmalı).

## 6. D — Ölçüm ve kanıt zorunluluğu

Bu belgedeki her tabloda etiketler §0'dadır. **Hiçbir değer uydurulmadı.** Yapılamayanlar:

| Alan | Neden | Ne gerekir |
|---|---|---|
| Gerçek şelale, TTFB, aktarım boyutu | ağ yok | `node tests/perf/measure-requests.mjs --live=https://aliq0330.github.io/promptly --har=perf-har --mobile` (ağı olan makine) |
| LCP/INP/CLS | gerçek ağ + cihaz | aynı araç (PerformanceObserver) + Lighthouse (`npx lighthouse https://aliq0330.github.io/promptly/ --preset=desktop`; mobil için varsayılan) |
| Canlı HTTP önbellek başlıkları | GitHub Pages dışarıdan | `curl -I https://aliq0330.github.io/promptly/_next/static/chunks/<dosya>.js` |
| Gerçek kullanıcı trafiği altında sorgu süreleri | trafik yok | Supabase Dashboard → Reports → Query Performance; metrikler §10 |
| Edge Function soğuk başlangıç/süre | erişim yok | Dashboard → Edge Functions → Invocations/Execution time |
| iOS Safari / gerçek cihaz | cihaz yok | elle |

## 7. Sorun listesi (öncelik sırasıyla)

Biçim: **Sorun · Kaynak · Etki · Öncelik · Kanıt · Çözüm · Risk · Kazanç.** "Tür": G = gerçekten yavaşlatan, R = potansiyel risk, K = kod kalitesi.

1. **(G, Kritik) `trending_tags` RLS altında satır başına maliyet** — `trending_tags()` (RPC) · Keşfet, Ana Sayfa rayı, Etiketler sayfaları her açılışta · kanıt: 1 182 çağrı × 973 ms; medyan 456,8 ms/125 k buffer · **UYGULANDI** (DEFINER + açık süzgeç) · risk: oturumlu kullanıcı artık kendi özel/topluluk içeriğini saymaz (gizlilik lehine) · 456,8 → 13,9 ms. [CANLI-ÖLÇÜM]
2. **(G, Kritik) 4 gereksiz liste isteği her sayfada** — `real-{prompts,requests,workflows,presets}-provider.tsx` · tüm `(app)` sayfaları · kanıt: §2.2, 750 çağrı × 216 ms · **UYGULANDI** (tembel `ensureLoaded` + `use…List`) · risk: bir ekran listeyi `getCached` ile okuyup tetiklemezse boş görür — `getCached`/`fetchById` listeye bağlı değildi (tüketiciler tarandı) · −4..−6 istek/sayfa, ≥50 KB JSON.
3. **(G, Yüksek) RLS `is_blocked()` satır başı** — `*_hide_blocked` politikaları (6 tablo) · tüm okuma · **UYGULANDI** (`blocked_user_ids()` InitPlan) · risk: güvenlik politikası değişti → `perf-rls.sql` 13/13 + `report-reasons.sql` (is_blocked) + 5 başka SQL testi geçti; iki yönlü engel, ziyaretçi ve NULL yazar eşdeğerliği her (kullanıcı, yazar) çiftinde doğrulandı · feed −%52, Sana özel −%37, öneri −%79.
4. **(G, Yüksek) `related_prompts` belirteç başına GIN sayımı** · prompt detay "Benzer promptlar" · 634 çağrı × 598 ms · **UYGULANDI** · risk: düşük (10 promptta birebir aynı sonuç) · 632 → 99,8 ms.
5. **(G, Orta) Herkese açık liste için sıralama indeksi yok** · `prompts` · "Bu hafta popüler", Keşfet "Popüler" · 473+235 çağrı × ~2 sn (pg_stats) · **UYGULANDI** (`prompts_public_like_idx`) · risk: yazma maliyeti ihmal edilebilir · 3,8 → 0,4 ms (bugün), ölçekle O(N)→O(limit).
6. **(G, Orta) `dispatch_my_event_reminders`/`weekly_digest` her yüklemede** · `notifications-provider.tsx` · 3 914 + 1 019 çağrı · **UYGULANDI** (cihaz başına 30 dk / 6 sa kısıtı; hata→yeniden dene) · risk: hatırlatma en çok 30 dk gecikir (pencere 24 sa) · −2 istek/2. yükleme.
7. **(G, Orta) Taksonomi her yüklemede 2 sorgu** · `taxonomy-hydrator.tsx` · 1 737 tarama/537 k satır · **UYGULANDI** (6 sa tazelik + SWR, 7 gün üst sınır) · risk: yönetici değişikliği ≤6 sa sonra görünür · −2 istek/2. yükleme.
8. **(G, Düşük) `is_moderator` 2–3×** · `use-is-moderator.ts`, `story-viewer.tsx` · 3 093 çağrı · **UYGULANDI** (`fetchIsModeratorShared`) · −1..2 istek.
9. **(G, Yüksek, ölçek) i18n sözlüğü HER sayfada, iki dil birlikte** · `src/lib/i18n/translations*.ts` · 160 KB gz/ilk JS'in %39'u (`/login`) · ÖNERİ: dil başına ayrı parça (TR senkron, EN `import()` ve `ready` bayrağı) + `translateForRuntime` bekleme · risk: orta (137 dosya `TranslationKey` türü kullanır; senkron `t()`; İngilizce için ilk boyama gecikmesi) · ~80 KB gz/kullanıcı [TAHMİN]. **Yapılmadı**: mimari karar + 4.5 kuralı.
10. **(G, Orta) `auth_rls_initplan` — 137 politika** (advisör, WARN) · özellikle `prompt_tags/prompt_media/prompt_dna_sections` okuma politikaları (`auth.uid()` her satırda) · ÖNERİ: `auth.uid()` → `(select auth.uid())` (anlam aynı; mekanik) · risk: düşük ama 137 politika → ayrı migration + `supabase/tests` taraması [kanıt: advisör sayısı; kazanç ölçülmedi]. **Yapılmadı** (kapsam).
11. **(R, Yüksek, ölçek) `feed_page` / `for_you_page` O(N)** · sıralama anahtarı CASE → indeks kullanamaz · bugün 43/100 ms; 50 k prompt'ta ~15× [TAHMİN] · ÖNERİ: `newest`/`popular` için ayrı indeksli dal; Sana özel için aday havuzu · risk: 17 argümanlı aşırı yüklü imza, `feed_page` sözleşmesi (CLAUDE.md §6 "Akış süzgeçleri"). **Yapılmadı.**
12. **(R, Yüksek, ölçek) Realtime `engagement-counts` süzgeçsiz** · `engagement-realtime-provider.tsx` · 8 tablo UPDATE'i HER bağlı istemciye (ziyaretçi dahil); Postgres Changes her olay için abone başına RLS denetler [KOD + CANLI: `realtime.subscription` 31 911 seq-scan] · ÖNERİ: tetikleyiciyle Broadcast ya da görünür id'ye süzgeç · risk: orta. **Yapılmadı.**
13. **(R, Orta) Kaynak görsellerde kart boyutu yok** · `viral-seed` 853×1280 · bkz. §5 · veri göçü gerekir. **Yapılmadı.**
14. **(R, Orta) Bildirim satırı `actor` gömmesi fazla sütun** (bio, cover_url, website…) · 8 097 çağrı × 17 ms · ÖNERİ: yalnız `id,username,display_name,avatar_url` · küçük kazanç, `AppNotification` türü etkilenir. **Yapılmadı.**
15. **(K) `GET notifications` + `HEAD notifications`, `profiles` ×3, `tag_follows`+`tool_follows`** birleştirme fırsatı · küçük.
16. **(R, Düşük) 73 kapsayıcı olmayan FK, 47 kullanılmayan indeks** · bkz. §4 · bu ölçekte işlem yok.
17. **(R, Düşük) HTTP önbellek**: GitHub Pages `max-age=600` sabit; `_next/static` (içerik karmalı) `immutable` olamaz → ziyaretçi her 10 dk'da koşullu GET atar. Cloudflare/Netlify önünde `Cache-Control: public, max-age=31536000, immutable` (yalnız `_next/static`) [KOD/TAHMİN].
18. **(R, Düşük) SEO**: `share/<tür>/<anahtar>/` sayfaları canonical + OG taşır ✔, `robots`/`sitemap` ✔; liste sayfalarında canonical/JSON-LD yok; `?id=` detay kabuğu tek başlıklı ("Promptly") ve dizinlenmesi hedeflenmiyor. Yapılandırılmış veri (`CreativeWork`) share sayfalarına eklenebilir. (Bu sandbox derlemesinde `share` ve sitemap boş: katalog derleme anında Supabase'ten okunur, ağ yok.)
19. **(K) Hız sınırı sayacı** (`public_api_rate_hit`) Edge'de DB'den; hata=izin ver ✔ (`302-*`) — sorun yok.
20. **(K) Edge Function'lar**: kaynak canlı sürümle karşılaştırılmadı; soğuk başlangıç süreleri [ÖLÇÜLEMEDİ].

## 8. Darboğaz haritası

| Katman | Bulgu | Durum |
|---|---|---|
| **Frontend** | 4 gereksiz liste sorgusu/sayfa; her sayfada 160 KB gz sözlük; tekrar `is_moderator`; her yüklemede 2 dispatch RPC + 2 taksonomi sorgusu | ilk ve son iki kısmı için düzeltildi; sözlük açık |
| **API (PostgREST/RPC)** | N+1 yok (toplu RPC'ler ✔); küçük birleştirme fırsatları | iyi |
| **Supabase / Realtime** | süzgeçsiz global kanal; her abonelikte yayın sorgusu | açık (ölçek) |
| **PostgreSQL** | RLS satır başı fonksiyon (`is_blocked`, `auth.uid()`), O(N) feed sıralaması, `trending_tags`, `related_prompts` | ilk dört düzeltildi/hafifletildi; feed O(N) ve 137 initplan açık |
| **Storage** | imzalı URL toplu ✔; tohum medya GitHub Pages'te, kart boyutu yok | açık (veri) |
| **Network / Cache** | GH Pages `max-age=600`; statik dosyaya `immutable` yok | altyapı |
| **3. taraf** | GIPHY yalnız seçici açılınca (önbellek+sınır ✔); lottie tembel ✔; fontlar `next/font` (self-host) ✔ | iyi |

## 9. Ölçüm altyapısı (bu turda eklendi)

`tests/perf/measure-requests.mjs`:
- **Taklit kip** (varsayılan): `out/` yerel sunucudan, Supabase `tests/messaging-ui/mock.mjs` ile; 10 senaryo, ilk + `--revisit` 2. yükleme; uç başına sayı/ilk zaman/TEKRAR listesi; `--json` çıktı; `--root=` ile iki derleme karşılaştırılır. **Süre ve gövde boyutu ölçmez.**
- **Canlı kip** `--live=<site adresi>`: gerçek ağ; istek başına başlangıç/TTFB/süre (`request.timing()`), Resource Timing (aktarım boyutu), LCP/CLS/INP (PerformanceObserver), JS/CSS/görsel/medya toplamı, en yavaş 15 kaynak, `--har=<klasör>` ile Chrome DevTools'ta açılan HAR, `--mobile` (390×844 @2x). **Bu sandbox'ta ÇALIŞTIRILMADI** (ağ yok).
- Kullanım: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build && node tests/perf/measure-requests.mjs --json=sonuc.json`.
- Not: taklit için derleme `https://example.supabase.co` ile alınmalıdır; gerçek URL ile alınan derleme taklite uğramaz.

**Önerilen test senaryoları (canlı kip + Lighthouse):** ilk kez gelen ziyaretçi (soğuk önbellek) · oturumlu (2. yükleme) · ana sayfa akışı · prompt detay · profil · arama · topluluk sayfası · topluluk sohbeti · mobil (`--mobile`, Lighthouse mobil profili, 4× CPU yavaşlatma) · sayfalar arası hızlı geçiş (istemci yönlendirmesi: ilk geçişten sonra `use…List` yalnız listeyi gösteren ekranda sorgu atar).

## 10. Supabase Dashboard'dan alınması gereken metrikler

1. **Reports → Query Performance** (ya da SQL): migration'dan önce/sonra `select left(query,80), calls, mean_exec_time, total_exec_time, shared_blks_hit/calls from pg_stat_statements order by total_exec_time desc limit 30;` — `trending_tags`, `feed_page`, `for_you_page`, `related_prompts`, `suggest_creators` satırları. Karşılaştırma için uygulamadan hemen önce `select pg_stat_statements_reset();` (yalnız sahibinin kararıyla).
2. **Reports → Database**: CPU, bellek, bağlantı sayısı, disk IOPS; **Reports → API**: istek sayısı/sn, 4xx/5xx, yanıt süresi dağılımı (p50/p95).
3. **Reports → Realtime**: eşzamanlı bağlantı, kanal sayısı, `postgres_changes` olay/sn, mesaj sayısı (madde 12 için).
4. **Edge Functions**: `api`, `mcp`, `oauth`, `telegram` için çağrı sayısı, p95 yürütme süresi, hata oranı.
5. **Storage**: bant genişliği (egress) ve `storage.objects` boyut dağılımı.
6. **Advisors → Performance**: `auth_rls_initplan` (137), `unindexed_foreign_keys` (73), `multiple_permissive_policies` (14) sayıları; migration sonrası yeniden çalıştırılmalı.
7. **Logs → Postgres**: `duration` > 500 ms satırları (`log_min_duration_statement` ayarı açılabilir).

## 11. Yapılan değişiklikler

| Dosya | Ne / Neden |
|---|---|
| `supabase/migrations/20261103100000_performance_indexes_and_rls.sql` | `prompts_public_like_idx`; `blocked_user_ids()` + 6 `*_hide_blocked` politikası; `trending_tags` (DEFINER, açık süzgeç); `related_prompts` (tek geçiş). Yalnız ekleme/değiştirme; geri alma notu dosyada. |
| `supabase/tests/perf-rls.sql` (13 kontrol) | engel eşdeğerliği (kullanıcı×yazar), görünürlük, indeks kullanımı, trending/related davranışı, yetkiler. |
| `src/features/{prompts,requests,workflows,presets}/real-*-provider.tsx` | ilk sayfa tembel (`ensureLoaded`), `use…List` kancaları; `getCached/fetchById` değişmedi. |
| `src/app/(app)/{prompts,requests}/page.tsx`, `workflows-list-view.tsx`, `presets-list-view.tsx`, `add-content-modal.tsx`, `studio-source-picker.tsx` | listeyi gösteren ekranlar `use…List` kullanır (isteklerde `loading` eklendi). |
| `src/lib/run-throttle.ts` (+test) · `notifications-provider.tsx` | dispatch RPC'leri cihaz başına aralıklı. |
| `src/lib/taxonomy-cache.ts` (+test) · `taxonomy-hydrator.tsx` | taksonomi SWR önbelleği. |
| `src/lib/supabase/moderation.ts` · `use-is-moderator.ts` · `story-viewer.tsx` | `is_moderator` tek istek. |
| `tests/perf/measure-requests.mjs` | ölçüm aracı (§9). |
| `package.json` | iki yeni birim testi `test` listesinde. |

İngilizce karşılıklar: **yeni kullanıcıya görünen metin eklenmedi** (çeviri anahtarı gerekmedi).

## 12. Test sonuçları

- `npx tsc --noEmit` temiz · `npm run lint` 0 hata (uyarılar eskiden beri) · `npm test` birim testleri · `npm run build` başarılı (örnek URL ile) — ayrıntı §14.
- SQL (yerel PG 16, temiz yeniden oynatma, **tüm migration'lar + yenisi OK**): `perf-rls.sql` 13/13; `report-reasons.sql`, `feed-filters.sql`, `for-you.sql`, `engagement-privacy.sql`, `creator-suggestions.sql` FAILED=0; `anon-hardening.sql` #4 başarısız — **ortam artefaktı**: varsayılan yetkiler `postgres` rolü için iptal edilir, yerel koşu `root` kullandı (yeni migration varsayılan yetkilere dokunmaz).
- UI (Playwright, taklit): 13 etkilenen paket tam geçti; 3 senaryo baseline'da da başarısız (önceden var) — bkz. §14.

## 13. Kalan sorunlar

Koddan çözülemeyen / erişim gerektiren: gerçek şelale ve Web Vitals (§6), canlı HTTP başlıkları, Edge soğuk başlangıç, gerçek trafikte Realtime ölçeği, mobil gerçek cihaz. Bilinçli ertelenen: madde 9–15 (§7). **Migration henüz canlıda DEĞİL:** deploy hattı (`deploy.yml`) uygular; sonra §10-1'deki sorgu ve `scripts/smoke-test.mjs` ile doğrulanmalı. Canlıda doğrulanmamış varsayım: `pg_stat_statements` mutlak süreleri (yük/soğuk önbellek).

## 14. Son kontrol

| Kontrol | Sonuç |
|---|---|
| `npx tsc --noEmit` | temiz (exit 0) |
| `npm run lint` | 0 hata, 16 uyarı (hepsi önceden var olan test betikleri; bu turda eklenen dosyalarda uyarı yok) |
| `npm test` | 861/861 geçti (yeni: `run-throttle` 6, `taxonomy-cache` 5) |
| `npm run build` | başarılı (örnek Supabase URL'siyle; gerçek URL ile `share` ve sitemap dolar) |
| `scripts/migrations-lib.test.mjs` + yıkıcı SQL taraması | 8/8; yeni migration'da yıkıcı ifade YOK (`-- ci:allow-destructive` gerekmez) |
| SQL (yerel PG 16, tüm migration'lar temiz yeniden oynatıldı) | `perf-rls` 13/13, `report-reasons`, `feed-filters`, `for-you`, `engagement-privacy`, `creator-suggestions` FAILED=0; `anon-hardening` #4 yalnız yerel `root` rolü artefaktı |
| UI (Playwright, taklit ağ), etkilenen 16 paket | 13 paket tam geçti: create-destination 16/16, developers 23/23, exchange 45/45, feed-filters 18/18, focus-feed 35/35, insights 22/22, preset-try 10/10, profile-collections 13/13, report-modal 18/18, search-notifications 17/17, workflow-auto 11/11, detail-pages 47/47, safety 11/11. **3 senaryo başarısız** — pagination #4 (profilde arama debounce/or-grubu), discover #7 (masaüstü yan menü 8 giriş), stories #13 (`/stories?id=`): **aynı senaryolar DEĞİŞİKLİKSİZ (baseline) derlemede de aynı şekilde başarısız** → bu işten kaynaklanmıyor, ayrıca incelenmeli (önceden var olan). |
| Canlı veritabanı | yalnız okuma + geri alınan işlemler; `blocks`, `prompts` vb. verisi değişmedi, kalıcı DDL yok |
| Commit/push | yapılmadı (istenmedi) |
