# 361 — Ekip projeleri: tek seferde uygulama planı (PLAN — onay bekliyor)

**Durum: UYGULANDI (2026-11-09).** D1–D5 önerildiği gibi onaylandı; plan aşağıda aynen durur, **uygulama kaydı en sonda**. Tasarım ve gerekçeler: [360](360-ekip-projeleri-tasarim.md). Bu plan 360'taki üç işi **tek PR'da,
bağımlılık sırasıyla** yaptı: (1) proje başına rol, (2) proje kütüphanesi, (3) Space'e bağlı kanal.

## 0. Ön koşul ve sıra

Sıra zorunludur: **rol → kütüphane → kanal.** Kütüphane onay yetkisi `approve` seviyesine dayanır; kanal ve kütüphane erişimi projeden türer.
Her migration **yalnız ekleyicidir** (CLAUDE.md §8.11 expand → contract); tek istisna `team_access.level` CHECK'inin yenilenmesidir (veri silmez, `-- ci:allow-destructive`).

| Sıra | Migration (yeni) | İçerik |
|---|---|---|
| 0 | — | Hata yeniden üretme (R1) — yalnız yerel SQL testi, migration yok |
| 1 | `20261114100000_team_project_levels.sql` | `approve`/`manage` seviyeleri, `_team_space_level` + `_team_space_cap`, yükseltme girişleri, `team_set_space_access` yetkisi |
| 2 | `20261114110000_team_project_library.sql` | `spaces.project_space_id`, `spaces.approvals_needed`, erişim devri, onay yetkisi, kütüphane RPC'leri, toplamalar, API/MCP satırı |
| 3 | `20261114120000_team_project_channel.sql` | Kanal otomatik açma, arşiv/silme tetikleyicileri (R1 düzeltmesi), kanal sınırı |

Sürüm numaraları son mevcut migration'dan (`20261113110000`) sonra gelir; uygulanıp uygulanmadığı `schema_migrations`'tan bakılır (deploy hattı uygular).

## WP0 — Önce hatayı yeniden üret (R1)

- Yeni SQL testi `supabase/tests/team-projects.sql`'in ilk bölümü: `space` kanalı olan bir ekip Space'ini sil → bugünkü davranışı kaydet.
  Başarısızsa (CHECK ihlali) bu, mevcut bir hatadır ve WP3'te düzeltilir; başarılıysa not edilir ve düzeltme yine de sağlamlaştırma olarak kalır.
- Çıktı raporda **olduğu gibi** yazılır (hata varsa "canlıda da vardır" diye işaretlenir, ayrı bir düzeltme PR'ı önerilir).

## WP1 — Proje başına rol (migration 1 + istemci)

**SQL**
1. `team_access_level_check`'i `('view','edit','approve','manage')` olarak yeniden kur (yıkıcı işaretiyle). `team_access` bu CHECK'i hem Space hem kanal girişleri için kullanır:
   **kanal girişleri `edit`/`view` kalır** (`_team_channel_entries` kontrolü değişmez); yeni seviyeler yalnız `space_id` dolu satırlarda geçerli olur (ek CHECK:
   `level in ('view','edit') or space_id is not null`).
2. `_team_space_level(space, user)` yeniden yazılır (create or replace; imza aynı, dönüş `view|edit|approve|manage|null`):
   - sahip/yönetici → `manage`; `admins` modu → null; `all` modu → taban (`member`→`view`, `editor`→`edit`, konuk→null) ve **varsa yükseltme girişi** (D1) ile `greatest`;
   - `selected` → girişlerin en yükseği; konuğa `approve`/`manage` asla (sunucu tarafında yazılırken de reddedilir).
   - **Tüketici uyumu:** `_team_sync_space_user` `edit|approve|manage → 'editor'`, `view → 'viewer'` eşler; `_team_channel_level` yalnız NULL kontrolü yapar → değişiklik gerekmez ama testle doğrulanır.
3. Yeni `_team_space_cap(p_space, p_user, p_cap text)` (`'approve'|'manage'`): ekip sahip/yöneticisi → true; yoksa `_team_space_level` ≥ seviye. (Konuk için hep false.)
4. `team_set_space_access`: yetki = `manage_members` **ya da** projeyi açan **ya da** `_team_space_cap(space, auth.uid(), 'manage')` (D2). `p_entries` doğrulaması: seviye 4 değer; `all` modunda girişler yalnız `approve|manage`
   (D1); konuğa `approve|manage` → `space_invalid`; ekip kütüphanesi (`library_space_id`) kilidi aynen. Denetim günlüğüne `space_level_changed` (kim, hangi seviye) eklenir.
5. `team_space_access` çıktısı seviyeyi zaten döndürür (değişiklik yok); `my_role` hesabına `space_role` yeterli kalır.
6. `_team_can_approve_item`: `approve`/`manage` kolu **WP2'de** eklenir (kütüphane yoksa anlamsız); WP1 yalnız altyapıyı kurar.

**İstemci**
- `lib/teams.ts`: `TeamSpaceLevel = "view"|"edit"|"approve"|"manage"`, `TEAM_SPACE_LEVELS`, `spaceLevelRank`, `spaceLevelCan(level, action)`; konuk üst sınırı. `teams.test.ts` genişler (sıralama + konuk kuralı + migration metnindeki seviye listesiyle karşılaştırma).
- `lib/supabase/teams.ts`: `AccessEntry.level` tipi genişler; `KNOWN_CODES`'a gerekirse yeni kod (yok bekleniyor).
- `features/teams/access-editor.tsx`: seviye seçici 2 → 4 değer (açıklama satırıyla: "Okur · Düzenler · Onaylar · Yönetir"); `all` modunda "Yükseltme ekle" bölümü; konukta yalnız ilk iki seçenek. `team-admin-access.tsx` (Space erişim özeti) seviye etiketini gösterir.
- Çeviri: `translations-team-system.ts` → `tm.level.*`, `tm.access.elevate*` (TR+EN).

**Testler:** `team-projects.sql` bölüm 1 (≈40 kontrol): seviye sırası, `all`+yükseltme, grup+kişi birleşimi, konuk sınırı, `manage`'in erişim değiştirebilmesi / ekip kütüphanesini kilitleyememesi / sahibi kilitleyememesi, `_inv()` eşitliği, `space_members` yansıması. Mevcut `teams-core.sql` (61) değişmeden geçmeli.
**D bağımlılığı:** D1 "hayır" ise 2. maddedeki `all`+yükseltme kolu ve istemcideki "Yükseltme ekle" çıkar; D2 değişirse yalnız 4. maddenin yetki cümlesi değişir.

## WP2 — Proje kütüphanesi (migration 2 + istemci)

**SQL**
1. Sütunlar: `spaces.project_space_id uuid references spaces(id) on delete cascade` (D3), `spaces.approvals_needed smallint check (between 1 and 3)`. Kısmi tekil dizin `(project_space_id) where project_space_id is not null`. Doğrulama tetikleyicisi: yalnız `kind='team_library'` kütüphanede dolu; proje aynı ekipten, `team_library` değil ve kendisi kütüphane çocuğu değil; ekip kütüphanesinin projesi olamaz.
2. Erişim devri: `_team_space_level` başına "bu Space'in `project_space_id`'si doluysa projenin seviyesini döndür" kolu. `_team_sync_space(proje)` projenin kütüphane çocuklarını da döner; `team_access_after_change` ve üyelik/grup tetikleyicileri zaten `_team_sync_space`/`_team_sync_user_spaces` çağırdığından çocuk, `spaces where team_id` taramasına girer (kütüphane çocuğu `team_id` taşır). `team_set_space_access` çocuk üzerinde `space_project_managed` ile reddeder.
3. Yeni RPC `team_create_project_library(p_project uuid)`: yetki `_team_space_cap(project,'manage')` ya da `create_spaces`; ad "‹proje› · Kütüphane", `kind='team_library'`, `visibility='private'`, `team_access_mode` = projeninki (yansıma için), sahip = ekip sahibi (bugünkü kalıp); en çok 50 Space sınırına dahil; denetim `project_library_created`. Kütüphane, projeyle arşivlenir (arşiv tetikleyicisinde çocuk da).
4. `_team_approvals_needed(space)` = `coalesce(spaces.approvals_needed, teams.approvals_needed)`; `space_decide_item` (iki yer), `space_item_review`, `team_library_items` içinde `t.approvals_needed` bununla değişir. `space_set_project_approvals(p_space, n)` RPC'si (`manage` ya da ekip yöneticisi; kütüphane çocuğunda, ekip kütüphanesinde ise ekip politikası geçerli).
5. `_team_can_approve_item`: mevcut koşula **veya** `_team_space_cap(projeId, user, 'approve')` eklenir (yalnız `project_space_id` dolu kütüphanelerde). `_team_item_hidden` "viewer" kuralı aynen (proje `view` seviyesindeki kişi yalnız onaylıyı görür).
6. Toplamalar (yeni imzalar, **argümanlar varsayılansız**, eskiler ince sarmalayıcı — R4):
   - `team_library_items(p_team, p_status, p_search, p_limit, p_offset, p_space)` / `team_library_counts(p_team, p_space)`; `p_space null` → ekip kütüphanesi; verilmişse o Space ekibe ait `team_library` olmalı.
   - `team_libraries(p_team)` → okuyabildiğim kütüphaneler: `id, title, project_id, project_title, is_main, approved_count, pending_count, can_approve`.
   - `my_team_todos`: kütüphane kaynağı `s.kind='team_library' and can_read_space` olur (yalnız onaylayabildiklerim sayılır).
   - `team_insights`, `team_export`, `team_access_overview`: ekip kütüphanelerinin toplamı; `team_export` her kütüphaneyi ayrı dizi öğesi olarak yazar.
7. API/MCP: `api_me_libraries` / `api_me_team_libraries` dönüşüne `project_title` (null = ekip kütüphanesi) eklenir (yeni sütun → `OPTIONAL_COLUMNS` mantığı: Edge Function kopyası ve `mcp/` istemcisi sütun yoksa çalışmaya devam eder). Edge Function `api` + `mcp` **elle deploy** gerektirir (rapora yazılır).
8. Silme: `spaces_team_before_delete`'e, ekip kütüphanesi kilidine ek olarak "proje silinirse çocuk silinir" (FK cascade yeter; `_team_sync_on` kilidi çocuk için uygulanmaz).

**İstemci**
- `lib/supabase/teams.ts`: `TeamLibraryRef`, `listTeamLibraries`, `createProjectLibrary`, `setProjectApprovals`; `listLibraryItems`/`fetchLibraryCounts` `space` parametresi alır.
- `features/teams/team-library-section.tsx` + `team-review-page.tsx`: **kütüphane seçici** (üstte `ScrollRow` çipleri: "Ekip kütüphanesi" + proje kütüphaneleri; adres `?library=<id>`; telefonda yatay şerit), sayaçlar/tablo seçilene göre; `useLibraryVariables(library?.id)` seçilen kütüphaneyi kullanır; ekip kütüphanesi yoksa çip satırı hiç çizilmez eski görünüm.
- `features/teams/team-spaces-section.tsx`: proje kartında "Kütüphane" rozeti/kısayolu; kütüphane çocukları listede ayrı kart DEĞİL, projenin altında rozet; proje menüsünde "Kütüphane aç" (`manage`).
- `features/spaces/space-page.tsx` `TeamSpaceStrip`: kütüphane çocuğunda "Proje: X" geri bağlantısı; erişim düğmesi gizli (devredilmiş).
- Silme penceresi: proje kütüphanesi doluysa "N onaylı prompt da silinecek" cümlesi (sayı `team_libraries`ten).
- Çeviri: `translations-team-library.ts` (`tm.lib.project*`, `tm.lib.switcher*`).

**Testler:** `team-projects.sql` bölüm 2 (≈50): bağ doğrulamaları (başka ekip, ikinci kütüphane, ekip kütüphanesine bağ), erişim devri (proje erişimi değişince kütüphane üyeleri değişir; ayrı erişim yazılamaz), `approve` seviyesi onaylar / `edit` onaylayamaz / `view` onaylanmamışı görmez, onay sayısı geçersiz kılma (2 onay), proje arşiv/silme zinciri, projeyi **göremeyen** kişi için sızıntı denetimi (kütüphane, prompt, ekip değişkeni, `api_me_*`, `team_libraries`, `my_team_todos`), `team-library-governance.sql` (59) ve `space-team-library.sql` değişmeden geçmeli.
**D bağımlılığı:** D3 "hayır" ise FK `on delete restrict` olur ve silme `project_library_not_empty` ile engellenir; D5 "hayır" ise `approvals_needed` sütunu ve RPC'si çıkar.

## WP3 — Space'e bağlı kanal (migration 3 + istemci)

**SQL**
1. `team_create_space` yeni aşırı yük: `+ p_channel boolean` (varsayılansız); `true` ise `_team_make_channel(…, 'space', v_id, …)` ile projenin kanalı açılır (ad `_team_channel_name(title)`, çakışırsa `-2…`; yazma `members`, bildirim `mentions`); denetim `project_channel_created`. Eski imza `p_channel := false` ile ince sarmalayıcı kalır.
2. `team_create_channel` sınırı: `mode <> 'space'` olan kanallar ≤ 50 (D4); `space` kanalı yine Space sınırı kadar (≤ 50). `_team_recount` toplamı aynen sayar.
3. **R1 düzeltmesi:** `spaces` için BEFORE DELETE tetikleyicisi `spaces_team_channels_cleanup`: o Space'e bağlı kanalların konuşmalarını siler (konuşma silinince kanal ve üyelik cascade). `teams_before_delete` sırası ile çakışmaması testle doğrulanır.
4. **Arşiv:** `spaces` AFTER UPDATE (`archived_at`) tetikleyicisi: arşivlenince bağlı kanallar `archived_at` alır, geri alınınca temizlenir (kütüphane çocuğu etkilenmez). Ekip kütüphanesi arşivlenemez zaten.
5. `team_update_channel`: `space` kanalının `mode`/`space_id` değiştirilemez (bugünkü kurala bakılır; gerekirse eklenir).

**İstemci**
- `features/teams/team-spaces-section.tsx` "Yeni Space" penceresi: "Sohbet kanalı aç" anahtarı (varsayılan açık); `createTeamSpace(…, { channel })`.
- Proje başlığı/menüsü: kanal yoksa "Kanal aç" (var olan `team_create_channel` `space` yolunu çağırır), varsa "Kanalı aç" bağlantısı (`teamLink(id, "chat", { channel })`).
- `team-chat-section.tsx`: kanal listesinde `space` kanalı rozeti proje adıyla ("#marka-kimligi · Marka kimliği"); proje arşivlenince kanal arşiv bölümünde görünür.
- Çeviri: `tm.space.channelToggle*`, `tm.chat.projectChannel*` (TR+EN).

**Testler:** `team-projects.sql` bölüm 3 (≈35): otomatik kanal üyeleri = projeyi okuyanlar; erişim değişince kanal üyeleri değişir; silme/arşiv zinciri; sınır (`space` kanalları 50'yi aşmaz, elle 50 kanal + 50 proje); kanalı göremeyen kişi için mesaj okuma/yazma/arama sızıntı denetimi (`team-channels.sql` listesiyle aynı yollar); `team-channels.sql` (60) değişmeden geçmeli.
**D bağımlılığı:** D4 "hayır" ise sınır cümlesi değişmez ama `channels` üst sınırı 100'e çıkar (`TEAM_LIMITS` + SQL).

## WP4 — Entegrasyon, sertleştirme, belge

- `scripts/smoke-test.mjs` `CHECKS`: `team_libraries`, `team_create_project_library`, `space_set_project_approvals`, yeni `team_library_items`/`team_library_counts` imzaları (CLAUDE.md §8.11).
- `run-team-hub.mjs` (ağ taklitli Playwright) yeni senaryolar: 4 değerli seviye seçici + konuk kısıtı; kütüphane seçici (ekip ↔ proje, telefon yatay şerit); "Yeni Space"te kanal anahtarı; proje kartında kütüphane rozeti; silme penceresi sayısı. Hedef: mevcut 40/40 + ≈10 yeni, hepsi geçer.
- Telefon: 390 px ekran görüntüsüyle erişim penceresi, kütüphane seçici, "Yeni Space" penceresi gözden geçirilir (CLAUDE.md §4 pencere kuralları: sabit başlık/alt düğme, ≤%75 yükseklik).
- Çeviri tamlık kontrolü: eklenen her anahtar `{tr, en}`; raporda "İngilizce karşılıkları eklendi mi" açıkça yazılır.
- Belgeler: `docs/history/360-*` durumu "uygulandı"ya çevrilir ve uygulama kaydı eklenir; `docs/history/README.md` satırları güncellenir; CLAUDE.md'de **yalnız kalıcı kural** eklenir: §5 `/teams` satırı (proje seviyeleri, kütüphane seçici), §6 "Ekipler" maddesine (a)–(f) yanına "(g) proje seviyeleri `view<edit<approve<manage`, kütüphane ve kanal erişimi projeden türer; yeni proje yeteneği = `_team_space_cap` + `lib/teams.ts` birlikte", §9 açık işler ve "Bilinen sınırlar".
- Gizlilik/Koşullar: yeni veri toplanmadığı için DEĞİŞMEZ (rapora yazılır).

## Doğrulama kapıları (bitirmeden)

1. `npx tsc --noEmit` · `npm run lint` · `npm test` (`teams.test.ts` genişlemiş hâliyle) · `npm run build` — hepsi temiz.
2. Yerel PostgreSQL: yeni `team-projects.sql` + mevcut `teams-core`, `team-library-governance`, `space-team-library`, `team-channels`, `team-membership`, `team-admin`, `team-message-report`, `team-my-teams-preview`, `team-review-samples`, `anon-hardening`, `api-me` — **hiçbiri kırılmaz**. `anon-hardening` yeni fonksiyonların anon'a kapalı olduğunu denetler (yeni fonksiyonlarda `revoke … from public, anon`).
3. Ağ taklitli `run-team-hub`.
4. Migration denetimi: `scripts/apply-migrations.mjs` yıkıcı işareti yalnız CHECK yenileme migration'ında; CI temiz PostgreSQL'e baştan oynatma.
5. Rapor dürüstlüğü: gerçek Supabase / Realtime / cihaz DENENMEDİ; Edge Function `api` ve `mcp` elle deploy; migration'ların canlıya inip inmediği `schema_migrations`'tan doğrulanır.

## Riskler ve geri dönüş

- Tüm değişiklikler ekleyici + eski imzalar sarmalayıcı: istemci yayınlanmadan önce migration inse bile eski istemci çalışır; yeni istemci eski veritabanında kütüphane seçicisini gizler (`team_libraries` yoksa tek kütüphane görünümü, `OPTIONAL` mantığı).
- Geri alma: yeni sütunlar/RPC'ler kullanılmayınca zararsızdır; `team_access_level_check` genişlemesi geri alınırsa `approve`/`manage` satırları önce `edit`'e indirilmelidir (geri alma betiği testte denenir, canlıda çalıştırılmaz).
- En büyük sürpriz kaynağı WP2'nin erişim devri (kütüphane yansımasının proje değişimine bağlanması); bu yüzden `_inv()` değişmezi her adım sonrası ve rastgele sıralı işlem dizisiyle (üye ekle/çıkar, grup değiştir, mod değiştir, arşivle) denenir.

## Kapsam dışı

360 §10 geçerli. Ayrıca bu PR'da: proje yeniden adlandırma/arşiv yetkisinin `manage`'e açılması (D2 hayır), grup kanalı kısayolu, `space` kanalı için ayrı bildirim düzeyi, mevcut projelere toplu kanal geri doldurma.


## Uygulama kaydı (2026-11-09)

**Sonuç:** üç iş tek PR'da; üç ekleyici migration (`20261114100000_team_project_levels`, `…110000_team_project_library`, `…120000_team_project_channel`).

| Kontrol | Sonuç |
|---|---|
| Yerel PostgreSQL `supabase/tests/team-projects.sql` | 129 kontrol, 0 hata (WP0 hata yeniden üretimi dahil) |
| Mevcut ekip/Space/API/sohbet SQL paketleri (`teams-core`, `team-*`, `space*`, `api-*`, `counter-protection`, `contract-cleanup`…) | hepsi temiz (`anon-hardening` #4 bu ortamda migration'sız da düşer — ortam kaynaklı) |
| Birim testleri `npm test` | 1001/1001 (`teams.test.ts` proje seviyelerini migration metniyle karşılaştırır) |
| Ağ taklitli `run-team-hub` | 55/55 (43–51 yeni) |
| `tsc`, `lint` (0 hata), `build`, `apply-migrations --check` | temiz |

**R1 doğrulandı (gerçek, mevcut hata):** `space` kanalı olan bir ekip Space'i silinemiyordu (`team_channels_space_shape` CHECK ihlali). Migration 3'teki `spaces_team_channels_cleanup` BEFORE DELETE tetikleyicisi düzeltti; canlıda da vardı.

**Plandan sapmalar / eklemeler**

- `_team_space_level` DEĞİŞMEDİ (edit/view/null sözleşmesi korundu): yeni 4 seviyeli `_team_space_access_level` eklendi, eski fonksiyon onun ince sarmalayıcısı oldu. Böylece yansıma/kanal motoru ve tüm eski testler olduğu gibi çalıştı.
- Ek RPC'ler: `team_my_space_level(p_space)`, `team_my_space_levels(p_team)` (kartlardaki eylem yetkisi için tek çağrı), `team_create_project_channel`, `space_set_project_approvals`, `team_libraries` (+ `approvals_needed`, `approvals_custom`).
- `team_space_access` (erişim listesini okuma) artık projede `manage` olana da açık; yoksa proje yöneticisi erişim penceresini dolduramazdı. Space sayfası şeridine "Erişim" düğmesi eklendi (yönetici olmayan proje yöneticisinin tek girişi).
- API/MCP imzaları DEĞİŞMEDİ: `api_me_libraries` zaten `kind='team_library'` süzdüğü için proje kütüphaneleri kendiliğinden listelenir; proje adı kütüphane başlığındadır ("‹proje› · Kütüphane"). `project_title` sütunu eklenmedi → Edge Function `api`/`mcp` elle deploy GEREKMEZ.
- `team_list_spaces`, `team_access_overview`, `_team_recount` kütüphane çocuklarını ayrı proje saymaz (50 Space sınırına da sayılmaz); `team_export` çocuk kütüphaneleri `projectLibraries` anahtarında yazar; `team_insights` ve `my_team_todos` tüm okunabilir ekip kütüphanelerini kapsar.
- `lib/supabase/teams.ts` `rows()` yardımcısı dizi olmayan yanıtı boş liste sayar (eksik/eski sunucu işlevinde arayüz çökmesin).
- `ci:allow-destructive` işareti gerekmedi: `drop constraint` yıkıcı sayılmıyor.

**Yapılmayanlar / dürüst sınırlar:** gerçek Supabase, Realtime ve cihaz DENENMEDİ; Space sayfasındaki "Erişim" düğmesi için ağ taklitli senaryo yok; telefonda yalnız kütüphane seçici/proje çubuğu taşma denetimi yapıldı (390 px, ekran görüntüsü incelemesi yok); panelde (`team_insights`) kütüphane kırılımı arayüzde yok; var olan projelere kanal otomatik açılmaz.
