# 362 — Ekip projeleri v2: proje → dosya → içerik, dosya başına onay, kütüphane YOK (PLAN)

**Durum: PR-A (veritabanı; §11), PR-B (arayüz + eski kütüphane/ekip API-MCP kodunun kaldırılması; §12) ve PR-C (yıkıcı temizlik; §13) KODLANDI, TEK PR'da (#477). Kullanıcı "PR-C'yi de yap, sonra hepsini komple merge et" dedi. Varsayımlar (§3) kullanıcı "Başla" dediği için bu hâliyle uygulandı.**
`360-*`/`361-*` (proje başına 4 seviye + proje kütüphanesi) bu planla **geçersiz kalır**: ekip artık Space'e ve kütüphaneye dayanmaz.
Mockup: kullanıcıya gösterilen 5 ekranlı tasarım (proje sayfası, dosya sayfası, düzenleyici telefon, "Ekle" menüsü, lider onay incelemesi).

## 1. Kullanıcının kararları (kesin)

| # | Karar |
|---|---|
| K-1 | Kişisel **Space aynen kalır**; ekip için ayrı bir sistem: **Ekip projesi**. |
| K-2 | **Kütüphane komple kalkar** (ekip kütüphanesi + proje kütüphanesi). Ekipteki mevcut Space'ler ve kütüphane içeriği demodur: **hepsi silinir**, taşıma yok. |
| K-3 | Yapı: **Ekip → Proje → Dosya → içerik** (mutfak/oturma odası/banyo gibi). Projede ve dosyada pano, görsel, prompt, workflow, ayar paketi, değişken, palet olur. |
| K-4 | Pano aracı **sıfırdan yazılmaz**: Space'teki mevcut pano aracı aynen kullanılır, ama ekip projesinin kendi alanında çalışır. Proje ya da dosya 0, 1, 2… pano açabilir. |
| K-5 | **Roller yalnız proje başınadır** (Lider · Düzenleyici · Görüntüleyici), tüm dosyalarda geçerlidir; dosya başına rol YOK. |
| K-6 | **Onay dosya başına açılıp kapanır** ve pano dahil her içerik için geçerlidir. |
| K-7 | Ekip sahibi ve yöneticisi her projede otomatik **Lider**'dir. |
| K-8 | **Ekibin API/MCP özelliği komple kalkar.** |
| K-9 | **Proje sohbeti** proje açılınca kendiliğinden gelir; ekibin genel sohbeti (genel/duyuru/özel kanallar) kalır. Dosya başına ayrı sohbet YOK. |

## 2. Hedef kavram modeli

```
EKİP
 ├─ Genel sohbet: #genel · #duyurular · özel kanallar          (bugünkü gibi)
 ├─ Üyeler · Gruplar · Konuklar · Politikalar · Denetim        (bugünkü gibi)
 └─ PROJE  (≤50)  ── rol: Lider · Düzenleyici · Görüntüleyici (kişi/grup bazlı)
      ├─ Proje sohbeti                      (kendiliğinden, yalnız projedekiler)
      ├─ Proje geneli alan  ("ana alan")    görsel · prompt · workflow · ayar paketi · palet · pano
      ├─ Proje değişkenleri                 ({müşteri}, {şehir}…) tüm dosyalarda geçerli
      ├─ Ek panolar                         (proje geneli, istenirse)
      └─ DOSYA  (≤30)  örn. Mutfak
           ├─ Onay: Açık / Kapalı
           ├─ Dosya ana alanı               görsel · prompt · workflow · ayar paketi · palet · pano
           ├─ Dosya değişkenleri            aynı ad varsa dosyadaki kazanır
           └─ Ek panolar
```

**Alan (area)** = bir içerik kabı. Proje geneli, her dosya ve her ek pano birer alandır. Alan, **mevcut Space motorunun gizli bir satırıdır**
(`spaces` tablosunda, kullanıcıya "Space" olarak GÖSTERİLMEZ). Böylece pano, öğe tabloları, oklar, workflow aktarımı, görsel yükleme
(PRIVATE `space-media`), taşı/boyutlandır/ok çiz araçları, `can_read_space`/`can_edit_space` ve 80'den fazla çağıranı **değişmeden** çalışır.
Bu bilinçli bir seçimdir (§9 R-1): paralel bir "ekip panosu" yazmak ~10 tabloyu, RLS'i, depolamayı ve pano kodunu ikiye katlar.

## 3. Onay bekleyen varsayımlar (itiraz yoksa böyle yapılır)

| # | Varsayım | Neden |
|---|---|---|
| A1 | **Tek lider onayı yeter** (çoklu onay sayısı YOK). | Kullanıcının tarifi "liderden onay iste". Eski `approvals_needed` kalkar. |
| A2 | **Taslağı yalnız ekleyen + liderler + ekip sahip/yöneticisi görür.** Diğer düzenleyiciler/görüntüleyiciler görmez. | Yarım iş panoda dolaşmasın. Alternatif: soluk "öneri" olarak herkese görünür (kod maliyeti benzer). |
| A3 | **Onaylı öğenin İÇERİĞİNİ (başlık, metin, medya, prompt) yalnız lider değiştirir.** Düzenleyici "Değişiklik öner" der: öneri AYRI tabloda (`space_item_proposals`) durur, onaylı öğe olduğu gibi görünür kalır; lider onaylayınca alanlar öğeye yazılır. | Sürüm tablosu ve kopya öğe (tekil dizin çakışması) olmadan "onaylı sürüm görünür kalsın" kuralını sağlar; öneri metni öğe satırında durmadığı için herkese okunmaz. |
| A4 | Düzenleyici yalnız KENDİ taslağını / değişiklik istenenini siler; onaylıyı lider siler. | |
| A5 | **Konum, boyut, renk, grup, ok çizme** onaya tabi DEĞİL (yerleşim işi). | Pano kullanılamaz hâle gelmesin. |
| A6 | **Değişkenler onay kapsamı dışı**; düzenleyici+ yazar, herkes (görebilen) okur. | Hızlı çalışsın; içerik değil ayar. |
| A7 | **Workflow tek paket olarak onaylanır** (adım kartları + promptlar + görseller + oklar `source_workflow_id` ile aynı birim). | Parçaları tek tek onaylamak anlamsız. |
| A8 | Proje oluşturma yetkisi mevcut `create_spaces` ekip yeteneğidir; **iç ad değişmez**, yalnız etiketi "Proje oluşturma" olur. | Yetenek yeniden adlandırması 4 yerde (SQL ×2, `lib/teams.ts`, test) risk taşır; contract'a kalır. |
| A9 | Ekip projesi **asla herkese açık olmaz**, paylaşım bağlantısı/alıntı/vitrin YOK (bugünkü ekip Space kısıtları sürer). | |
| A10 | Proje erişimi: **seçilen kişi/grup** (varsayılan) ya da **tüm ekip** (taban rol seçilir). "Yalnız yönetim" = giriş yok. | |
| A11 | Sınırlar (öneri): proje ≤50/ekip (bugünkü), dosya ≤30/proje, pano (ek alan) ≤20/proje. | |
| A12 | Görüntüleyici "Doldur ve kopyala"yı kullanabilir; düzenleyici+ değişken yazar. | |

## 4. Veri modeli (EKLEYİCİ — expand)

Yeni tablolar (istemci YAZAMAZ; yazma yalnız `SECURITY DEFINER` RPC, `auth.uid()`, `search_path` sabit, `EXECUTE` anon'a kapalı):

| Tablo | İçerik |
|---|---|
| `team_projects` | `id, team_id, title, description, color, review_default boolean, access_mode ('selected'\|'all'), base_role, main_area_id, archived_at, created_by` |
| `team_project_access` | `project_id, subject_type ('user'\|'group'), subject_id, role ('view'\|'edit'\|'lead')` |
| `team_files` | `id, project_id, title, position, review_required boolean, main_area_id, archived_at, created_by` |
| `team_variables` | `id, project_id, file_id null, name (^[A-Za-z_][A-Za-z0-9_]{0,39}$), value (≤500), updated_by` — benzersiz: (proje, dosya\|null, küçük harf ad) |

Mevcut tablolara eklenen sütunlar (hepsi null/varsayılanlı → kişisel Space etkilenmez):

| Tablo | Sütun |
|---|---|
| `spaces` | `team_project_id`, `team_file_id` (null = proje geneli), `team_area_main boolean`, `kind` CHECK'ine `'team_area'` (**üç yer birlikte:** `spaces_kind_check`, `create_space` tür listesi, `SPACE_KINDS` + etiket/ikon/çeviri). `spaces.team_id` AYNEN dolu kalır → kişisel listelerdeki `team_id is null` süzgeçleri (9 migration'da) alanları kendiliğinden dışarıda tutar. |
| `space_items` | `rev_state text not null default 'approved'` CHECK (`draft`,`pending`,`approved`,`changes`), `rev_submitted_at/by`, `rev_decided_at/by`, `rev_note` (≤500), `rev_unit uuid null` (workflow paketi). (`review_*` adları eski kütüphane sütunlarıyla çakıştığı için `rev_*` seçildi.) |
| `team_channels` | `project_id uuid null` FK (`on delete cascade`), `mode` CHECK'ine `'project'` (eski `'space'` ve `space_id` contract'ta kalkar) |

**Tüm yeni sütunların varsayılanı kişisel Space'i bozmaz:** kişisel öğeler hep `approved`; yeni kural yalnız `spaces.team_project_id is not null` alanlarda çalışır.

### 4.1 Yetki tek kaynaktan: proje rolü

- `_team_project_role(project, user)`: ekip sahibi/yöneticisi → `lead` (örtük, değişmez); konuk en çok `edit`; ekip üyesi değilse NULL; kişi + grup girişlerinden **en yükseği** (`coalesce(...)` ile — `_team_role` NULL döner kuralı); `all` modunda taban rol.
- **Eşitleme motoru** (bugünkü `_team_sync_*` kalıbı): proje rolü → projenin TÜM alanlarının `space_members`'ine (`view`→viewer; `edit`/`lead`→editor) ve proje kanalının `conversation_members`'ına yansır. Tetikleyiciler: ekip üyeliği, grup üyeliği, proje erişimi, yeni alan, proje arşiv/silme. Elle üye/davet `space_team_managed` ile reddedilir (bugünkü kural).
- Ekip düzeyi yetenekler (`manage_members`, `view_audit`, `export`, `invite_guests`…) proje rolünden **ASLA** gelmez.
- Lider yetkisi (onay, erişim, dosya/pano açma-kapama) yalnız ekip RPC'lerinde anlam taşır; `can_edit_space` aynı kalır.

### 4.2 Onay motoru (K-6, A1–A7)

| İş | Kural |
|---|---|
| Yeni öğe durumu | `BEFORE INSERT` tetikleyici belirler (tüm yazma yolları — pano kaydı, workflow aktarımı, görsel yükleme — aynı yerden geçer): alan bir ekip alanı **ve** dosya/proje `review_required` **ve** ekleyen lider değilse `draft`; aksi hâlde `approved`. İstemci durum veremez. |
| Gönder | `team_review_submit(item_ids)` → `pending`; workflow paketi aynı `review_unit` ile birlikte. |
| Karar | `team_review_decide(item_id, 'approve'\|'changes', note)` → `approved` / `changes` (değişiklikte not zorunlu). Karar verebilen: o projede `lead`. Kendi öğesini de onaylayabilir (lider). |
| Geri çek | Ekleyen `pending` öğesini `draft`'a geri alabilir. |
| Öner | `team_review_propose(item, başlık, metin, not)` → `space_item_proposals` satırı (A3); `team_review_decide_proposal` onaylarsa alanlar öğeye yazılır, öneri silinir. |
| Korumalar | Durum sütunları yalnız bu RPC'lerle değişir (`BEFORE UPDATE` korumalı sütun tetikleyicisi, `protect_counter_columns` kalıbı); toplu pano kaydı (`space_save_layout`) durum alanlarına DOKUNAMAZ ve onaylı öğenin içerik sütunlarını yazamaz. |
| Dosya anahtarı | `team_file_set_review(file, bool)` — yalnız lider. Kapatınca bekleyenler `approved` olmaz, olduğu gibi kalır ve lidere "N öğe bekliyor" uyarısı çıkar (kendiliğinden onaylamak onay anlamını bozar); lider "hepsini onayla" diyebilir. |

**Gizleme (A2):** `space_items` üzerine RESTRICTIVE SELECT politikası: ekip alanında `review_state <> 'approved'` ise yalnız ekleyen, projenin liderleri ve ekip sahip/yöneticisi görür. Aynı kural, taslak öğeye değen yan yüzeyler için **ayrı ayrı** uygulanır (kütüphane `_team_item_hidden` kalıbı):
`space_connections` (gizli öğeye değen ok), `space_activity` (etkinlik satırı), `space-media` Storage okuma politikası (dosya yolu → öğe → durum), öğe sayaçları/özet RPC'leri, pano araması, mini harita, `workflow_space_links`.

### 4.3 Sohbet (K-9)

- `team_create_project(...)` her zaman bir `mode='project'` kanalı açar (ad projeden, çakışırsa `-2`; yazma `members`; bildirim `mentions`). Erişimi projeyi izler (`_team_sync_channel`).
- Proje arşivlenince kanal arşivlenir, silinince silinir. `project` kanalları 50'lik elle kanal sınırına SAYILMAZ (bugünkü `space` kuralı aynen).
- Genel sohbet: `open`/`private` kanallar ve `#genel`/`#duyurular` **dokunulmaz**. Mesajlar'da "Ekip" satırı/rollUp (`354-*`) aynı.
- Kanal mesajı şikâyeti (ekip yöneticilerine) aynı.

### 4.4 Değişkenler

`planLibraryFill` (`lib/space-library.ts`) → `planProjectFill`: kullanıcı yazdığı > dosya değişkeni > proje değişkeni; değeri olmayan jeton kopyada AYNEN kalır. Ekip alanındaki prompt öğesinde "Doldur ve kopyala" (görüntüleyici dahil).

### 4.5 Bildirimler ve denetim

- Bildirim: **mevcut ekip bildirim kalıbı** (Faz 0'da `team_spaces_notifications` incelenir; `system` türü + `dedupe_key`; yeni `notifications_type_check` türü AÇILMAZ). Olaylar: onay istendi (liderlere) · onaylandı / değişiklik istendi (ekleyene) · projeye eklendin · rolün değişti.
- Denetim günlüğü (`team_audit`) yeni eylemler: `project_created/archived/deleted`, `project_access_changed`, `file_created/deleted`, `file_review_toggled`, `review_submitted/approved/changes`, `variable_changed`.
- "Senden bekleyenler" (`my_team_todos`) = okuyabildiğin projelerde lider olduğun onay bekleyenler + sana dönen değişiklik istekleri.
- Panel (`team_insights`) = proje/dosya/onay sayıları (kütüphane sayıları kalkar).

## 5. Silinecekler (K-2, K-8) — kesin envanter Faz 0'da `pg_proc`/`pg_class` taramasıyla çıkarılır

**Veritabanı (contract migration, `-- ci:allow-destructive` ister):**
- Önce VERİ: `spaces.team_id` dolu tüm satırlar (ekip Space'leri + `team_library` Space'leri) ve bağlı öğeler/oklar/etkinlik; `team_channels` içindeki `mode='space'` kanallar.
- Tablolar: `space_item_approvals`, `space_item_review_comments`, `space_item_review_samples`, `space_item_versions`, `space_item_uses`, `space_item_works_votes`, `space_variables`, `team_api_blocks`, `team_api_usage` (her biri silmeden önce kütüphaneye özgü olduğu `grep` ile doğrulanır; kişisel Space ya da başka özelliğin kullandığı varsa SİLİNMEZ).
- Sütunlar: `teams.library_space_id`, `spaces.project_space_id`, `spaces.approvals_needed`, `space_items.approved_at/approved_by/content_rev`, `team_channels.space_id`; ekip politikalarından `approvals_needed`, `require_approval`, `hide_unapproved`, `mcp_enabled`, API kitle/engel alanları; `spaces_kind_check`'ten `team_library`.
- Fonksiyonlar: `space_decide_item`, `space_set_item_approval`, `space_set_variable`, `space_delete_variable`, `_team_can_approve_item`, `_team_item_hidden` (yeni sürümle değişir), `team_library_items/counts`, `team_set_space_access`, `_team_space_access_level` ve sarmalayıcıları, `team_create_space`, `api_me_libraries`, `api_me_team_libraries`, `api_me_library_prompts`, ekip API ayar/okuma RPC'leri; `team_create` kütüphane açmayı bırakır.

**İstemci:**
`features/teams/team-library-section.tsx` (613 satır), `features/spaces/library-parts.tsx`, `features/teams/team-spaces-section.tsx` (yerine Projeler), `features/spaces/team-space-strip.tsx`, Kütüphane sekmesi/rozetleri/telefon karoları, ekip API/MCP yönetim bölümü (Entegrasyonlar), `lib/space-library.ts` (→ `planProjectFill`), `translations-team-library.ts` içindeki kütüphane metinleri.
**Açık API / MCP:** `lib/public-api/me-library.ts` + `http.ts` (`/me/libraries*`), `openapi.ts`, MCP araçları `list_my_libraries`/`get_library_prompts`, `/mcp/team/<kısa-ad>` yolu, `mcp/src/{server,remote}.ts` ve `supabase/functions/{mcp,_shared}` kopyaları (`node scripts/sync-function-shared.mjs`), `/developers` sayfası metni + `lib/developers.ts` örnekleri.
**Testler:** `supabase/tests/{space-team-library,team-library-governance,team-review-samples,team-projects}.sql`, `tests/messaging-ui/run-space-library.mjs` ve `run-team-hub.mjs`'nin kütüphane senaryoları (yeniden yazılır). `run-chat-library.mjs` sohbetteki *kişisel* kütüphane seçicisi olabilir — silinmeden önce içeriği kontrol edilir.

## 6. İstemci tasarımı

Yeni rota YOK: `/teams/local?id=&tab=projects&project=&file=&board=&review=` (statik export kuralı: id sorgu parametresinde). Eski `?tab=spaces|library` adresleri `?tab=projects`'e yönlenir. `/spaces/local?id=<ekip alanı>` açılırsa ekip proje adresine yönlenir (kişisel Space sayfası ekip alanını hiç çizmez).

| Parça | Dosya (yeni/yeniden) |
|---|---|
| Veri katmanı + yetki aynası | `lib/supabase/team-projects.ts`, `lib/team-projects.ts` (+ SQL metniyle karşılaştıran birim test; `teams.test.ts` kalıbı) |
| Projeler sekmesi (liste, "Yeni proje", telefon) | `features/teams/team-projects-section.tsx` |
| Proje sayfası (bant, dosyalar, panolar, kişiler/roller, değişkenler) | `features/teams/team-project-page.tsx` |
| Dosya sayfası (onay anahtarı, bölümler, değişken tablosu, durum rozetleri) | `features/teams/team-file-page.tsx` |
| Alan görünümü: mevcut Space sekmeleri + pano, ekip bağlamında | `features/spaces/space-page.tsx`'e `teamContext` (Yorumlar/Puan/Paylaş/vitrin gizli; "Değişkenler" sekmesi eklenir) |
| Onay çubuğu (durum rozeti, "Onaya gönder", "Değişiklik öner") | `features/teams/review-bar.tsx`; pano nesnesi ve liste satırı aynı rozeti kullanır |
| Lider onay incelemesi | `features/teams/team-review-page.tsx` yeniden (liste + ayrıntı + not + Onayla/Değişiklik iste) |
| "Ekle" menüsü | `Modal` alt kart (`SpaceDialog` iskeleti); görsel/prompt/workflow/ayar paketi/değişken/palet/pano |
| Rol/erişim düzenleyici | mevcut `access-editor.tsx` (3 rol) |
| Sohbet | `team-chat-section.tsx` "Projeler" grubu; `team-chat-data.ts` |
| Ekip ana ekranı, telefon, panel, todos | `team-page.tsx`, `team-phone-home.tsx`, `team-panel-section.tsx`, `teams-page.tsx` |

Kurallar: token'lar (hex yok), `Modal`/`SectionMenu`/`PhoneSectionList`/`ScrollRow` ortak bileşenleri, **TR + EN** çeviri (`translations-team-projects.ts` yeni; kütüphane anahtarları temizlenir), onay/silme `ExitMotion`/`useCardExit`.

## 7. İş paketleri ve sürüm sırası (expand → contract, `8.11`)

Üç ayrı PR/sürüm; her biri kendi kapısından geçer (`tsc`, `lint`, `npm test`, `build`, SQL testleri).

| PR | Kapsam | Canlıya etkisi |
|---|---|---|
| **PR-0** | Faz 0 keşfi + bu belge | Yok |
| **PR-A (ekleyici)** | §4 tüm şema + RPC'ler + eşitleme + onay motoru + sohbet + değişkenler; `team_create` kütüphane açmayı bırakır; SQL testleri; `smoke-test.mjs` `CHECKS`'e yeni RPC'ler | Eski istemci bozulmaz (hiçbir şey silinmez) |
| **PR-B (istemci)** | §6 arayüz; kütüphane/Space/entegrasyon arayüzü ve API/MCP **kodu** repodan çıkar; metinler, `/developers`, CLAUDE.md, arşiv | Yeni arayüz canlı; eski RPC'ler hâlâ duruyor |
| ⚠️ **Elle adım** | Edge Function `api` + `mcp` (kütüphanesiz) yeniden deploy; `promptly-mcp` yeni sürüm (araçlar kalktığı için `0.x` artar) → "Publish MCP package" | Edge CI ile deploy EDİLMEZ; bu yapılmadan PR-C birleştirilmez |
| **PR-C (contract)** | Ekip Space/kütüphane VERİSİNİN silinmesi + §5 tablo/sütun/fonksiyon düşürme (`-- ci:allow-destructive`, gerekçeli) | Yıkıcı; yalnız PR-B canlıda ve Edge Function'lar yenilenmişken |

### Faz 0 (PR-0) — kodlamadan ÖNCE yanıtlanacaklar (her biri kısa kanıtla belgeye yazılır)

1. Kişisel listeler (`list_spaces`, `list_public_spaces`, keşif, arama, profil, alıntı, paylaşım bağlantısı, `create_quote('space')`) ekip alanını **gerçekten** dışarıda tutuyor mu? (`team_id is null` kapsamı her yolda; eksik yol = PR-A'ya eklenir.)
2. `SpaceProvider` + sekme bileşenleri `/spaces` rotası dışında (ekip sayfasında) takılabiliyor mu; `spaceId` dışında rota bağımlılığı var mı?
3. `space-media` Storage okuma politikası öğe durumuna bağlanabilir mi (yol = `{space}/{uuid}`; öğe→dosya eşlemesi)? Görsel yükleme (öğeden önce dosya) taslak mantığıyla çelişiyor mu?
4. Realtime / anlık kanallar pano öğelerini yayınlıyor mu (gizlenen taslak yayında sızar mı)?
5. Mevcut ekip bildirim kalıbı ve kategorisi (`system` + adres); Telegram `_telegram_pending` türleri.
6. Canlıda ekip/Space/kütüphane satır sayıları (silme kapsamı) — salt-okunur sorgu; silmeden önce tutar/kullanıcıya yazılır.
7. §5 silme listesindeki her tablonun/fonksiyonun kütüphaneye özgü olduğunun doğrulanması (bağımlılık taraması).
8. `create_spaces`/`approve_library` yetenekleri: `approve_library` kalkar (lider rolü yerini alır) — `_team_all_capabilities` + `_team_role_caps` + `lib/teams.ts` + `teams.test.ts` birlikte.

## 8. Test planı

| Katman | Kapsam |
|---|---|
| **SQL (yerel PostgreSQL)** `team-projects-core` | Rol çözümü (kişi/grup/en yüksek/NULL), ekip sahip=lider, konuk sınırı, `space_members` + `conversation_members` yansıma **değişmezi** (`_inv()` her adımda), projeyi görmeyen kişi için alan/öğe/dosya/değişken/kanal/mesaj/`my_team_todos` okuması reddi |
| `team-project-review` | Durum makinesi (draft→pending→approved/changes→…), A2 gizleme (ekleyen/lider/yönetici görür, diğerleri görmez), ok/etkinlik/Storage/sayaç sızıntısı, `space_save_layout` korumalı sütunlara yazamaz, onaylı öğe içeriği düzenleyiciye kapalı, öneri (propose/decide), workflow paketi birlikte karar, dosya anahtarı kapanınca davranış, kişisel Space'in **hiç etkilenmediği** (öğe durumu hep `approved`, politika devreye girmez) |
| `team-project-variables`, `team-project-chat` | dosya>proje önceliği, ad doğrulama; kanal otomatik açma/arşiv/silme, 50 sınırı |
| `anon-hardening` | yeni fonksiyonlarda anon `EXECUTE` kapalı, yeni tablolarda anon yazma yok |
| **Birim** | `lib/team-projects.ts` aynası SQL ile eşit (rol→yetki), `planProjectFill`, durum rozeti kararı |
| **Ağ taklitli Playwright** | `run-team-projects.mjs`: proje oluştur → dosya → ekle → taslak → onaya gönder → lider onaylar/değişiklik ister → düzenleyici düzeltir; telefon düzeni; görüntüleyici ekleyemez; `run-team-hub` yeniden yazılır |
| Kapılar | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |

## 9. Riskler

| # | Risk | Önlem |
|---|---|---|
| R-1 | Alanın "gizli Space" olması kişisel Space yüzeylerine sızabilir (liste, arama, alıntı, bağlantı). | Faz 0 madde 1; her yolda `team_id is null` testi; kişisel akış regresyon SQL/UI testleri. |
| R-2 | **Taslak sızıntısı** (en hassas yer): RESTRICTIVE politika yan yüzeyleri (ok, etkinlik, Storage, sayaç, arama, Realtime) kaçırabilir. | §4.2 yüzey listesi + her biri için SQL negatif testi; Faz 0 madde 3–4. |
| R-3 | Toplu pano kaydı (`space_save_layout`) durum/içerik alanlarını ezebilir. | Korumalı sütun tetikleyicisi + testte düzenleyici ile "kendi öğemi onaylı yap" denemesi. |
| R-4 | Eşitleme motoru (rol→alan üyeliği) birçok tetikleyici; yarış/eski kalıntı. | Mevcut `_team_sync_*` kalıbı yeniden kullanılır; `_inv()` değişmezi; sync yalnız işlem-yerel işaretle. |
| R-5 | Yıkıcı migration (PR-C) canlı veriyi siler; Edge Function eski RPC'yi çağırırken düşerse API kırılır. | Sıra: PR-B → Edge deploy → PR-C. Silme öncesi canlı sayım. K-2 ile kullanıcı onayı alındı (veri demo). |
| R-6 | `create_spaces`/`approve_library` yetenek değişimi `_team_role` NULL tuzağı. | Tüm `not in` karşılaştırmaları `coalesce`; `teams.test.ts` migration metniyle karşılaştırır. |
| R-7 | Telefon arayüzü yoğunluğu (3 seviye: ekip→proje→dosya). | `PhoneSectionList`/`PhoneSubBar` kalıbı; dosya sayfası tek sütun; ortak bileşenler. |
| R-8 | Eski `?tab=library|spaces` bağlantıları, bildirimler ve Mesajlar satırları eski adrese gider. | Yönlendirme + silinen kimlikler için "bulunamadı" ekranı. |

## 10. Kapsam dışı / bilinçli sınırlar

- Pano **çizim aracı** (serbest çizim/şekil) yok; çizim bugün görsel olarak yüklenir. Ayrı ve büyük bir iş.
- Dosya başına rol, dosya başına sohbet, çoklu onay, onay geçmişi/sürüm karşılaştırma, proje şablonları, projeler arası kopyalama YOK.
- Ekip API/MCP dışarıya açık (K-8: kalktı); sonra yeniden istenirse ayrı tasarım.
- Gerçek Supabase, Realtime ve cihaz bu ortamda DENENEMEZ; yalnız yerel PostgreSQL + ağ taklitli Playwright. Hukuki metin (Gizlilik/Koşullar "Ekipler" bölümü) kütüphane/API cümleleri için güncellenir; `TERMS_VERSION` artışı gerekiyorsa sahibi onaylar.

## 11. Uygulama kaydı — PR-A (veritabanı; ekleyici)

Dört migration (`20261115100000`…`20261115130000`), iki SQL testi, duman testi satırları. Arayüze DOKUNULMADI; eski sistem aynen çalışır.

| Migration | İçerik |
|---|---|
| `…100000_team_projects_schema` | `team_projects`, `team_files`, `team_project_access`, `team_variables` (RLS açık, istemci erişimi yok); `spaces.team_project_id/team_file_id/team_area_main` + `kind='team_area'` + `spaces_team_area_shape` CHECK (alan her zaman `private`); alan doğrudan silinemez (`spaces_team_area_guard`); alan Etkinlik günlüğü okunamaz; `space_items.rev_*`; `team_channels.project_id` + `mode='project'`; `_team_recount` projeleri sayar; **`list_spaces` artık `s.team_id is null` ile ekip Space'lerini/alanlarını dışlar** |
| `…110000_team_projects_engine` | `_team_project_role` (lead/edit/view; ekip sahibi/yöneticisi örtük lider, konuk ≤ edit, `all` modunda taban proje ayarından); **`_team_space_access_level` alan için proje rolünü döndürür** → mevcut eşitleme tetikleyicileri (ekip/grup üyeliği) alanlarda kendiliğinden çalışır; `_team_channel_level` `project` kolu; `_team_sync_project`; üye/grup temizliği; arşiv/silme zinciri; proje kanalı; `_team_item_visible` |
| `…120000_team_projects_rpc` | `team_create_project/update/set_access/archive/delete`, `team_create_file/rename/file_set_review/delete`, `team_create/rename/delete_board`, `team_set/delete/list_variable(s)`, `team_projects_list`, `team_project_get`, `team_project_access`, `team_project_channels`, `team_area_info`; **kendini kilitleme koruması** (`project_lockout`) |
| `…130000_team_project_review` | onay motoru (tetikleyiciler + RPC), `space_item_proposals`, RESTRICTIVE RLS (öğe/ok/Storage), `team_review_submit/withdraw/decide/propose/withdraw_proposal/decide_proposal/pending`, `team_project_todos`, `team_area_is_lead` |

### Faz 0 bulguları (kanıtla)

1. **Plan yanlış varsaymıştı:** kişisel Space listesi ekip Space'lerini bugüne kadar DIŞLAMIYORDU (yalnız kartta `teamId` işaretiyle gizleniyordu; `team_id is null` ifadeleri başka işlevlerdeydi). Çözüm: `list_spaces` `s.team_id is null` ile süzülür (eski ekip Space'leri de kişisel listeden çıkar; ekip sayfası kendi RPC'sini kullanır). Alanlar ayrıca `visibility='private'` CHECK'iyle herkese açık/bağlantılı/alıntı yollarından yapısal olarak dışlanır.
2. **SpaceProvider ekip sayfasında takılabilir mi:** PR-B'de doğrulanacak (arayüz işi).
3. **Storage:** `space-media` yolu `{space}/{uuid}.ext`; taslak görselin dosyası RESTRICTIVE `storage.objects` politikasıyla gizlenir (`_team_media_hidden`); test: taslakta ekleyen+lider okur, diğerleri okuyamaz, onaylanınca açılır.
4. **Realtime:** Space tabloları yayında DEĞİL ve Space kodunda `postgres_changes` aboneliği yok → taslak Realtime ile sızmaz.
5. **Bildirim kalıbı:** `_team_notify` (`system` türü, `/teams/...` adresi, `dedupe_key`); yeni tür açılmadı.
6. **Silme envanteri:** PR-C'ye bırakıldı; `team_create` PR-A'da kütüphane açmaya DEVAM eder (eski istemci kırılmasın).
7. **Yetenekler:** `create_spaces` proje oluşturma yeteneği olarak kullanıldı; `approve_library` dokunulmadı (PR-C).
8. **Olay yoğunluğu:** `space_activity` satırı yalnız "bir görsel eklendi" der; alanlarda tamamen okunamaz kılındı.

### Test kaydı (yerel PostgreSQL 16)

- `team-projects-v2.sql` 63/63, `team-project-review.sql` 78/78 (rol çözümü, değişmez `_inv()`, kişisel liste dışlama, silme koruması, dosya/pano/değişken, erişim + bildirim, üye/grup temizliği, arşiv/silme, ekip silme, anon kapıları; taslak görünürlüğü, ok/Storage/etkinlik gizleme, içerik kilidi, öneri, paket kararı, onay anahtarı, kilitli öğe, kişisel Space etkilenmedi).
- Tüm mevcut SQL paketi (89 dosya) yeni şemaya karşı koşuldu: 86'sı ilk koşuda `FAILED=0`; kırmızı 3'ü: `anon-hardening` ve `contract-cleanup` (**ikisi de PR-A'dan önce, temiz baz veritabanında da aynı kırmızı** — bu işin kapsamında değil), ve eski `team-projects.sql` test 104 ("kütüphane çocuğu `space_count`'a girmez") — PR-A'nın `_team_recount` gövdesini eski sürümden kopyalamasından doğan GERÇEK bir gerileme; düzeltildi (gövde artık 20261114110000'dakiyle aynı + yalnız alan/proje eklendi), ilgili ekip paketleri yeniden koşuldu: hepsi 0.
- Birim testleri: 1001 testin 1000'i geçti; kırmızı olan `icons.test.ts` ("üretilen ikon dosyaları güncel") bu ortamda `node_modules` yok diye PR-A'dan bağımsız düşüyor. `node scripts/apply-migrations.mjs --check` temiz.
- `anon-hardening.sql` test 4 ("yeni tabloda anon yazma hakkı yok") **PR-A'dan ÖNCE de kırmızıdır** (temiz baz veritabanında aynı hata; yerel kurulum varsayılan yetkisi) — bu işin kapsamında değil.
- Gerçek Supabase / Realtime / cihaz DENENMEDİ.

### Bilinçli sınırlar (PR-A)

- `team_create` hâlâ kütüphane Space'i açar; ekip Space/kütüphane arayüzü ve API/MCP yerinde (PR-B/PR-C).
- Dosya arşivleme yok (yalnız silme). Pano/dosya yeniden sıralama yok.
- `space_comments` (Space yorumu/puanı) alanlarda DB'de kapatılmadı; arayüz ekip bağlamında göstermez (PR-B).
- Realtime ve çoklu onay yok (kapsam dışı, A1).

## 12. Uygulama kaydı — PR-B (arayüz)

Aynı dalda (draft PR #477) PR-A'nın üstüne. Veritabanı migration'ı EKLENMEDİ; yalnız istemci, test ve açık API/MCP kaynakları.

| Alan | Yapılan |
|---|---|
| Veri katmanı | `lib/supabase/team-projects.ts` (RPC sarmalayıcıları, `projectTodoAsTeamTodo`), `lib/team-projects.ts` (rol/onay/değişken aynası; `team-projects.test.ts` 9 test, SQL metniyle karşılaştırır), `Space.teamProjectId/teamFileId`, `SpaceItem.revState/revNote/…`, `SpaceKind='team_area'` (kişisel oluşturma listelerinde YOK), `OPTIONAL_COLUMNS` |
| Ekranlar | Projeler sekmesi + oluşturma, proje ana ekranı, dosya sayfası, pano sayfası (proje geneli/ek pano), erişim penceresi (3 rol), ayarlar (arşiv/sil), proje/dosya değişkenleri, **alan görünümü** (`team-area-view.tsx`: mevcut `SpaceProvider` + Pano/Görseller/Promptlar/İçerik/Notlar/Palet sekmeleri, Ekle menüsü, onay paneli: onaya gönder/geri çek/toplu gönder, değişiklik önerisi), onay rozetleri (sekmeler + pano nesnesi), **lider onay kuyruğu** (paket tek satır, not zorunlu, hepsini onayla, öneri kararı) |
| Sohbet | Sohbet sekmesinde "Projeler" grubu (proje başlığıyla), `project` kanalı bilgi/başlık metinleri, kanal oluşturmadan `space` seçeneği kalktı |
| Ana ekranlar | Telefon ana ekranı ve `/teams`: proje sayacı, "Senden bekleyenler" proje onayları (`team_project_todos`), "Son projeler" |
| Kaldırılan | `team-library-section`, `team-spaces-section`, `team-review-page`, `spaces/team-space-strip`; Yönetim'den Space erişimi + Entegrasyonlar + kütüphane politikaları + sürüm saklama; gruplarda klasör/liderler-onaylar; rol matrisinden onay/kütüphane satırları; açık API `/me/libraries*`, MCP `list_my_libraries`/`get_library_prompts`/`/mcp/team/<ad>`, `/developers` kütüphane adımı; `promptly-mcp` **0.2.0** (Edge kopyaları `sync-function-shared` ile eşitlendi) |
| Metinler | `translations-team-projects.ts` (TR+EN, `tp.*` + yeni hata kodları `tm.error.*`); eski `tm.*` kütüphane metinleri PR-C'de temizlenir |
| Testler | ağ taklitli `run-team-projects` **17/17** (liste/oluştur, proje sayfası, değişken, dosya sayfası + onay anahtarı, düzenleyici/görüntüleyici, öner, kuyruk, sohbet grubu, eski adresler, Ekle menüsü, erişim penceresi, EN, telefon taşma); `run-team-hub` kütüphane/Space/Entegrasyon senaryoları çıkarıldı, kalan **38/38**; birim 1005; MCP 36; tsc + eslint temiz; `npm run build` (sahte Supabase ortamıyla) temiz |

### Elle yapılacaklar (PR merge edilirse)

1. Deploy hattı migration'ları (4 dosya) uygular. 2. **Edge Function `api` ve `mcp` yeniden deploy** (CI deploy ETMEZ) ve **"Publish MCP package"** (0.2.0). 3. Yalnız ondan SONRA PR-C.

### PR-C kapsamı (yıkıcı; ayrı PR)

§5'teki envanter + `fetchTeamPolicy` select'inin ve `TeamPolicy` tipinin daraltılması + `team_create`'in kütüphane açmayı bırakması + `team_channels.space_id`/`mode='space'` + `spaces_kind_check`'ten `team_library` + `features/spaces/library-parts.tsx`/prompts-tab kütüphane kolu/`lib/space-library.ts`/`translations-team-library.ts` + eski `my_team_todos` kütüphane kolları + SQL testlerinden kütüphane paketleri (`space-team-library`, `team-library-governance`, `team-review-samples`, `team-projects`, `run-space-library`).

### Bilinçli sınırlar (PR-B)

- "Ekle" menüsü: görsel/prompt/palet/not için ilgili sekmeye götürür (orada kendi ekleme düğmesi var); workflow ve ayar paketi panodaki "Promptly'den ekle" aracıyla; pano ve değişken kendi pencereleriyle.
- `/spaces/local?id=<alan>` ekip alanını ekip sayfasına yönlendirir (`team_area_info`: dosyanın ana alanı → dosya, diğerleri → pano); Space'e özgü Paylaş/Yorum/Puan/Etkinlik özellikleri ekip alanında DB'de kapatılmadı (yalnız ekip arayüzünde yok; Etkinlik günlüğü DB'de okunamaz).
- Çizim aracı yok (görsel olarak yüklenir); dosya arşivleme/yeniden sıralama yok; proje şablonu yok.
- Gerçek Supabase / Realtime / cihaz DENENMEDİ; TR/EN metinler eklendi, hukuki metin (Gizlilik/Koşullar "Ekipler" bölümü) bu PR'da GÜNCELLENMEDİ (kütüphane/API cümleleri için ayrı karar).

## 13. Uygulama kaydı — PR-C (yıkıcı temizlik)

Aynı dalda (PR #477) PR-A + PR-B'nin üstüne. Kullanıcı sırayı değiştirdi ("PR-C'yi de yap, hepsini komple merge et"): PR-B'nin elle adımları (Edge Function `api`/`mcp` yeniden deploy, "Publish MCP package" 0.2.0) merge'den SONRA kalır; o arada canlı Edge v7 düşen `api_me_library*` RPC'lerini çağırır → yalnız **ekip kütüphanesi uçları** hata verir, kişisel uçlar (`/me/*`) etkilenmez.

**Migration `20261116100000_team_library_removal.sql`** (`-- ci:allow-destructive`; yerel PostgreSQL'de eski şemadan seed'lenen kütüphane/ekip Space verisiyle denendi):

| Adım | Ne |
|---|---|
| 1 | `team_id` dolu, `kind <> 'team_area'` olan Space'ler SİLİNİR (ekip kütüphanesi, proje kütüphaneleri, eski ekip Space'leri; ekip alanları dokunulmaz); `teams.library_space_id` boşaltılır |
| 1b | Kişisel `kind='team_library'` Space'ler `free` olur; `spaces_kind_check` 'team_library'siz yeniden kurulur |
| 2–3 | Politika `space_items_hide_unapproved` (kütüphane), tetikleyici `space_items_version_snapshot`/`spaces_team_before_delete`; tablolar `space_item_approvals/_review_comments/_review_samples/_versions/_uses/_works_votes`, `space_variables`, `team_api_blocks/_usage` |
| 4 | Kütüphanesiz yeniden yazılanlar: `team_create` (kütüphane açmaz), `team_update` (ölü anahtarlar `team_invalid`), `_team_offboard`, `team_member_content_summary`, `team_export` (`promptly.team` v2: projeler/dosyalar/proje değişkenleri), `team_insights` (Panel: proje etkinliği — eklenen içerik, onay süresi, katkı verenler, bekleyen/değişiklik istenen, en hareketli projeler), `my_team_todos` (yalnız okunmamış sohbet + süresi dolan konuk; proje onayları `team_project_todos`'ta) |
| 5 | 35 RPC/yardımcı düştü (`api_me_libraries/_team_libraries/_library_prompts/_library_variables`, `team_libraries/_library_items/_library_counts`, `team_create_project_library`, `team_integrations`, `team_set_api_block`, `space_set_item_approval/_request_review/_decide_item/_set_item_deprecated/_set_item_works/_set_review_sample/_set_variable/_delete_variable/_record_item_use/_can_approve/_restore_item_version/…`, `_team_item_hidden/_team_can_approve_item/_team_approvals_needed/_team_api_allowed/_team_api_log`) |

**BİLEREK düşürülmeyenler** (ayrı, sonraki contract): `teams.library_space_id/require_approval/approvals_needed/hide_unapproved/version_keep/mcp_*`, `spaces.project_space_id/approvals_needed`, `space_items.approved_*/review_requested_*/deprecated_*/content_rev/use_count/works_*/review_started_at` ve ilgili korumacı tetikleyiciler: 30+ canlı fonksiyon adıyla anıyor, kimse yazmıyor/okumuyor; düşürmek paylaşılan Space RPC'lerinin yeniden yazımını ister. `fetchTeamPolicy` select'i ve `TeamPolicy` tipi bu sütunlardan temizlendi (istemci artık seçmez).

**İstemci:** `teams.ts` kütüphane/onay/entegrasyon sarmalayıcıları ve tipleri, `spaces.ts` onay/sürüm/değişken sarmalayıcıları, `space-provider` onay/sürüm kolları, `prompts-tab` kütüphane kolu, `space-forms` görünürlük uyarısı, `SpaceKind`/`SPACE_KINDS`'tan `team_library`, `spaceCapabilities.approve`, etkinlik `item_approved/_unapproved` ve ~270 ölü çeviri anahtarı (`translations-team-library.ts` dosyası ve `tm.lib.*`/`tm.admin.int.*`/`tm.spaces.*`/`tm.access.*` ölü anahtarları; TR+EN birlikte) silindi; `library-parts.tsx`, `lib/space-library.ts(+test)` silindi. Panel (`team-panel-section.tsx`) proje etkinliğini çizer.

**Testler:** yeni `supabase/tests/team-library-removal.sql` **19/19** (tablolar/RPC'ler yok, düşen nesneyi anan fonksiyon yok, ekip kütüphanesiz kurulur, `team_update` ölü anahtarları reddeder, `team_insights`/`team_export`/`my_team_todos`/özet/offboard çalışır, alanlar sağlam); uyarlananlar `teams-core` 57/57, `team-admin` 16/16, `team-membership` 69/69; silinenler `space-team-library`, `team-library-governance`, `team-review-samples`, `team-projects` (360 dönemi) ve `run-space-library.mjs`; mock'tan kütüphane RPC'leri çıktı. Tam SQL paketi: yalnız `anon-hardening` (1) ve `contract-cleanup` (3) kırmızı — ikisi PR'dan ÖNCE de kırmızıydı. Ağ taklitli: `run-team-projects` 17/17, `run-team-hub` 38/38 (Panel senaryosu yeni biçime çevrildi), `run-spaces` 34/34, `run-space-posts` 8/8, `run-space-comments` 10/10, `run-space-board-tools` 15/15, `run-space-connectors` 15/15, `run-workflow-space` 40/40. Birim 996, MCP 36, tsc/eslint(0 hata, 17 eski uyarı)/build temiz. `scripts/smoke-test.mjs`: düşen RPC/tablo satırları çıkarıldı.

**Sınırlar:** gerçek Supabase/Realtime/cihaz DENENMEDİ; canlıdaki gerçek ekip Space verisi sayılmadı (demo olduğu kullanıcı kararıyla silinir); Gizlilik/Koşullar "Ekipler" bölümü güncellenmedi (kütüphane/API cümleleri için ayrı karar); İngilizce karşılıklar: yeni/değişen Panel metinleri TR+EN eklendi.
