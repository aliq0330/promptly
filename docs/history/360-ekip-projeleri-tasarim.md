# 360 — Ekip projeleri: proje başına rol, proje kütüphanesi, Space'e bağlı sohbet (TASARIM)

**Durum: TASARIM — kod yazılmadı (2026-11-09).** Uygulama planı: [361](361-ekip-projeleri-uygulama-plani.md). Bu belge, `353-*` ile kurulan bağımsız Ekipler
sisteminin üstüne üç genişletme önerir. Aşağıdaki "Kararlar" bölümü kullanıcı onayı bekler; onaylanmadan hiçbir migration yazılmaz.

## 1. İstek (kullanıcının sözleriyle özet)

- Bir ekip birden çok projede çalışabilir; **her projenin kendi kütüphanesi** olabilir.
- **Roller proje başına değiştirilebilir.**
- Yönetici ekipteki 4 kişiye belli bir Space'i açar, diğerleri **görmez bile**.
- Gruplar işin merkezinde: A grubu 2 Space'e, B grubu 1 Space'e erişir.
- Sohbet: ekip içinde herkese açık kanallar olur, ayrıca yalnız kendi grubuna / projesine açık kanallar olur.

"Proje" = ekibin **Space**'idir (`spaces.team_id` dolu). Arayüz adı Space kalır; "proje" yalnız bu belgede ve açıklamalarda kavramı anlatır.

## 2. Bugünkü durum (migration'lar okunarak çıkarıldı, canlıda denenmedi)

| Konu | Bugün | Kaynak |
|---|---|---|
| Ekipte çok Space | VAR, en çok 50 | `team_create_space` |
| Space'i yalnız seçilenlere açma | VAR: mod `all` / `selected` / `admins`; özne kişi ya da grup; seviye `edit` / `view`; sahip+yönetici her zaman `edit` | `_team_space_level`, `team_set_space_access`, `team_access` |
| Seçilmeyen kişi Space'i görmez | VAR: erişim `space_members` yansımasına eşitlenir, `can_read_space`/RLS değişmez | `_team_sync_space_user` |
| Grup bazlı erişim | VAR (`subject_type = 'group'`), grup üyesi eklenince/çıkarılınca yansıma yenilenir | `team_group_members_after_change` |
| Kanal türleri | VAR: `open` / `private` (kişi-grup girişli) / `space` (Space'e bağlı, erişimi Space'i izler) | `team_channels.mode`, `_team_channel_level` |
| Space kanalı kendiliğinden açılır | **YOK** — elle açılır | `team_create_space` kanal oluşturmaz |
| Kütüphane | **Ekip başına TEK**: `teams.library_space_id`; ekip doğarken otomatik açılır | `team_create` |
| Kütüphane yönetişimi (onay, gizleme, API) | **Space bazlıdır**, tek kütüphaneye BAĞLI DEĞİL: `space_decide_item`, `_team_can_approve_item`, `_team_item_hidden`, `api_me_*` hepsi `spaces.kind = 'team_library'` süzer | `team_library_governance`, `team_admin_insights` |
| Tek kütüphane varsayan yerler | Yalnız toplu okumalar: `team_library_items`, `team_library_counts`, `my_team_todos`, `team_insights`, `team_access_overview`, `team_export` ve istemcide `team.librarySpaceId` | aynı |
| Roller | Ekip geneli: sahip > yönetici > düzenleyici > üye > konuk; proje içi fark yalnız `edit` / `view` | `lib/teams.ts` |
| Politikalar | Ekip geneli (`teams.approvals_needed`, `require_approval`, `hide_unapproved`) | `teams` |

**Çıkarım:** istenenin çoğu zaten çalışıyor. Gerçekten eksik olanlar: (a) proje başına kütüphane, (b) proje başına *yetki* (onaylama / yönetme),
(c) Space açılınca kanalın kendiliğinden gelmesi. Ek olarak okuma sırasında **şüpheli bir hata** bulundu (bkz. §8 R1).

## 3. Kavram modeli

```
Ekip
 ├─ Ekip kütüphanesi (tek, resmî, herkese açık; bugünkü gibi)
 ├─ Genel kanallar: #genel · #duyurular · (istenirse diğer açık/özel kanallar)
 └─ Proje (Space)  ×50
     ├─ Erişim: tüm ekip | seçilenler (kişi/grup + SEVİYE) | yalnız yönetim
     ├─ Proje kanalı (mode='space'): erişimi projeyi izler
     └─ Proje kütüphanesi (isteğe bağlı, en çok 1): erişimi projeyi izler, kendi onay kuralı olabilir
```

Üç parça aynı fikre bağlanır: **erişimin tek kaynağı projedir**; kütüphane ve kanal projeden türer. Böylece "Ali bu projeyi görmüyor" demek
kanalı ve kütüphaneyi de görmediği anlamına gelir (ayrı ayrı kural yazılmaz, sızıntı yüzeyi büyümez).

## 4. Karar A — Proje başına rol: erişim seviyesi

### 4.1 Model

`team_access.level` bugün `edit | view`. Dört basamaklı olur (her biri bir öncekini kapsar):

| Seviye | Space içeriği | Kütüphanede | Projede yönetim |
|---|---|---|---|
| `view` | Okur | Onaylı promptları kullanır | — |
| `edit` | Ekler/düzenler | Taslak yazar, onaya gönderir, ekip değişkeni yazar (ekip rolü `editor`+ ise) | — |
| `approve` | `edit` + | Prompt onaylar / değişiklik ister / kullanımdan kaldırır | — |
| `manage` | `approve` + | `approve` + | Projenin erişimini değiştirir, kanalını açar/arşivler, proje kütüphanesini açar, onay sayısını ayarlar |

- **Ekip sahibi ve yöneticisi** her projede örtük olarak `manage`'dir (değişmez; kimse onları projeden kilitleyemez).
- **`space_members` yansıması:** `view` → `viewer`; diğer üçü → `editor`. Yani `can_read_space` / `can_edit_space` ve 80'den fazla çağıran DEĞİŞMEZ;
  `approve`/`manage` yalnız ekip RPC'lerinde anlam taşır.
- **Ekip rolü tavan değildir.** `member` olan biri bir projede `manage` olabilir (asıl ihtiyaç bu). Ama proje seviyesi **ekip düzeyi yetenekleri
  ASLA vermez**: `manage_members`, `manage_team`, `manage_groups`, `view_audit`, `export`, `invite_guests`, `publish_external` yalnız ekip rolünden gelir.
- **Konuk:** yalnız `view` ve `edit` alabilir (`approve`/`manage` reddedilir). Konuk, seçilmediği projeyi görmez (bugünkü kural).
- **Seçilenler modunda giriş = o kişinin o projedeki rolüdür** (bugünkü anlam korunur: düzenleyici rolündeki biri `view` girişiyle yalnız okur).
  Aynı kişiye hem kendi hem grup girişi varsa en yüksek seviye kazanır (bugünkü `bool_or` kuralı genişler).

### 4.2 Yükseltme girişleri (`all` modunda)

Bugün `all` modunda giriş eklemek `space_invalid`. Önerilen: `all` modunda girişler **yalnız yükseltme** olabilir (`approve` / `manage`) — "herkes görsün ama
bu iki kişi onaylasın" için. Taban seviye ekip rolünden gelir (`member` → `view`, `editor` → `edit`), girişler tabanın üstüne çıkarır, asla düşürmez.
Ekip kütüphanesi (`library_space_id`) bu özellikten **muaf** kalır (modu `all`, bugünkü kilit); orada mevcut "grup lideri onaylar" mekanizması sürer.

### 4.3 Neden ayrı bir proje-rol sistemi değil

İki yetki matrisi (ekip + proje) SQL ile TS'de senkron tutulmak zorunda kalır ve `_team_role`'ün NULL döndüğü yerlerdeki `not in` hatası (353'te yakalandı)
sınıfı iki katına çıkar. Tek matris + proje başına seviye kolonu, mevcut `team_access` tablosuna ve eşitleme motoruna oturur; yeni tablo yok.

## 5. Karar B — Proje kütüphanesi

### 5.1 Seçenekler

| Seçenek | Fikir | Sonuç |
|---|---|---|
| **A. Çocuk kütüphane Space'i (seçilen)** | Kütüphane, projeye bağlı ayrı bir Space (`kind='team_library'`, `spaces.project_space_id`). Erişimi projeden türer. | Mevcut yönetişim kodu (kind süzgeci) DEĞİŞMEDEN çalışır; proje türü (moodboard, brand…) korunur |
| B. Her Space kütüphane olabilir | `kind` yerine `is_library` bayrağı | `kind='team_library'` ~25 yerde sabit; proje türüyle çakışır; büyük yeniden yazım |
| C. Birden çok bağımsız kütüphane | `team_library` Space'lerini serbest çoğalt | Hangisi "resmî" belirsiz; MCP/API varsayılanı muğlak; erişim ayrıca yönetilir |

### 5.2 Tasarım

- **Bağ:** `spaces.project_space_id uuid` (kütüphane → proje, `on delete cascade`), kısmi tekil dizin: proje başına **en çok 1** kütüphane.
  Yalnız `kind='team_library'` Space'te dolu olabilir; proje de aynı ekipten ve `team_library` olmayan bir Space olmalı.
- **Erişim:** kütüphane kendi `team_access` girişi taşımaz. `_team_space_level(kütüphane, kullanıcı)` projenin seviyesine devreder
  (`project_space_id` doluysa projeye bakar). Proje erişimi değişince (mod, giriş, grup üyeliği, ekip üyeliği) kütüphanenin yansıması da yenilenir.
  `team_set_space_access` kütüphane üzerinde reddedilir (`space_project_managed`) — erişim projeden yönetilir.
- **Kim açar:** projede `manage` seviyesi (ya da `create_spaces` + projeyi açan). Ekip kütüphanesi bugünkü gibi ekip doğarken açılır.
- **Politika:** `spaces.approvals_needed smallint null` (null = ekip değeri, 1–3). `require_approval` / `hide_unapproved` ekip geneli kalır
  (iki ayrı hesap karışıklığı yaratmasın). Yeni yardımcı `_team_approvals_needed(space)`.
- **Onay yetkisi:** `_team_can_approve_item` bugün "ekip `approve_library` yeteneği ya da grup klasörü lideri". Eklenir: **kütüphanenin projesinde
  `approve` ya da `manage` seviyesi**. Ekip kütüphanesinde davranış aynı kalır.
- **Okuma toplamaları** (kütüphane sekmesi): `team_library_items` / `team_library_counts` bir `p_space` alır (boş = ekip kütüphanesi). Kütüphane sekmesine
  üstte kütüphane seçici gelir (ekip kütüphanesi + okuyabildiğin proje kütüphaneleri). `my_team_todos` (Senden bekleyenler) **okuyabildiğin ve onaylayabildiğin**
  tüm kütüphanelerin bekleyenlerini toplar. `team_insights` / `team_export` / `team_access_overview` tüm ekip kütüphanelerini kapsar.
- **API / MCP:** `api_me_libraries` / `api_me_team_libraries` zaten `kind='team_library'` ve `space_role` ile süzer → proje kütüphaneleri **kendiliğinden listelenir**.
  Eklenen: satıra `project_title` (araçta "Proje A · Kütüphane" okunsun). Ekip politikası (`mcp_enabled`, kitle, engel) ekip düzeyinde kalır; proje kütüphanesine
  erişemeyen kişi zaten `space_role` NULL olduğundan göremez.
- **Yaşam döngüsü:** proje arşivlenince kütüphanesi de arşivlenir; proje silinince kütüphane `cascade` ile gider (silme penceresi "N onaylı prompt da silinecek" der).
  Ekip kütüphanesi silinemez (bugünkü kural).

## 6. Karar C — Sohbet: kanalın projeye bağlanması

### 6.1 Kanal türleri (değişmez, yalnız doğru kullanılır)

| Tür | Kim görür | Kullanım |
|---|---|---|
| `open` | Tüm ekip (konuk hariç) | #genel, #duyurular, ortak sohbetler |
| `private` | Girişte seçilen kişiler / gruplar | "A grubunun kanalı", yönetim kanalı |
| `space` | **O projeyi görebilenler** | Proje sohbeti — erişim projeden türer |

Kanallar ayrı konuşmadır (353 kararı): özel/proje kanalına üye olmayan kişi için mesaj, arama, yıldız, medya, "yazıyor" yolları üyelikle kapanır.

### 6.2 Yeni davranış

1. **Proje açılırken kanal da açılır** (varsayılan AÇIK, pencerede kapatılabilir): ad projenin başlığından üretilir (`_team_channel_name`, çakışırsa `-2`),
   `mode='space'`, yazma `members`, bildirim `mentions`. Mevcut projeler için otomatik geri doldurma YOK (50 kanal sınırını ve sürprizi önlemek için);
   proje başlığındaki "Kanal aç" düğmesi var olan elle yolu kullanır.
2. **Proje arşivlenince kanalı arşivlenir**, arşivden dönünce açılır. **Proje silinince kanalı da silinir** (bkz. §8 R1: bugün silme kanalda takılıyor olabilir).
3. **Kanal sınırı:** `space` kanalları 50'lik elle kanal sınırına SAYILMAZ (proje başına zaten 1 ile sınırlı ve 50 projeyle üstten kapalı);
   `channel_count` sayacı toplamı gösterir.
4. **Proje kütüphanesinin ayrı kanalı yoktur** — proje kanalını kullanır.
5. **Grup kanalı kısayolu (kapsam dışı, ileride):** grup oluşturulurken "bu grup için kanal aç" seçeneği. Bugün `private` kanala grup girişi ile aynı sonuç elde edilir.

### 6.3 Örnek senaryo (ekip: 12 kişi; gruplar A=4, B=3)

| Öğe | Erişim | Kim görür |
|---|---|---|
| Space "Marka kimliği" (`selected`: A grubu `edit`, Ayşe `manage`) | A + Ayşe + yönetim | A grubu, Ayşe, sahip/yönetici |
| Space "Kampanya" (`selected`: A `edit`, B `view`) | A + B | A (düzenler), B (okur) |
| Space "Ar-Ge" (`selected`: B `edit`) | B | B |
| #marka-kimligi / #kampanya / #ar-ge (`space`) | projeyi görenler | yukarıdaki kitleler; diğerleri kanalı **listede de görmez** |
| #genel, #duyurular (`open`) | tüm ekip | herkes (konuk hariç) |
| #a-grubu (`private`, giriş: A grubu) | A | yalnız A |
| "Marka kimliği · Kütüphane" | projeyi izler | A + Ayşe + yönetim; Ayşe (`manage`) onaylayabilir |

Not: `space` kanalında projeyi `view` ile görenler de yazabilir (sohbete katılmak içerik düzenlemek değildir; bugünkü `_team_channel_level` böyle). İstenirse
`posting_policy='admins'` ile kısıtlanır.

## 7. Güvenlik ve tutarlılık kuralları

- Yazma yolu yalnız SECURITY DEFINER RPC (bugünkü kalıp); yeni tablo yok, yeni sütunlar istemciye yazılamaz.
- **Ayrıcalık yükseltme:** `manage` seviyesindeki kişi (a) ekip sahip/yöneticisinin erişimini değiştiremez (örtük), (b) kendi seviyesinden yüksek bir şeyi ekip düzeyinde veremez (ekip yetenekleri verilemez), (c) konuğa `approve`/`manage` veremez, (d) ekip kütüphanesinin kilitli modunu değiştiremez, (e) Space sahibi değildir (silme/devir yok).
- **Değişmez (`_inv()`):** `space_members` yansıması = `_team_space_level` sonucu; `space` kanalı üyeleri = projeyi okuyabilenler; kütüphane üyeleri = proje üyeleri. SQL testinde her adım sonrası denetlenir.
- Sızıntı yüzeyi: proje kütüphanesi ve kanalı projeden türediği için ayrı gizlilik kuralı yoktur; yine de testte "projeyi göremeyen" kişi için kütüphane, prompt, ekip değişkeni, API/MCP, kanal, kanal mesajı, `team_list_spaces`, `my_team_todos` okuması denenir.
- Denetim günlüğü: yeni eylemler `space_level_changed`, `project_library_created`, `project_channel_created`; `access_changed` aynen sürer.
- Gizlilik/Koşullar: yeni veri toplanmaz → metin değişmez.

## 8. Riskler

| # | Risk | Önlem |
|---|---|---|
| R1 | **Mevcut hata adayı (doğrulanmadı):** `team_channels.space_id` FK'si `on delete set null`, aynı tabloda `check ((mode='space') = (space_id is not null))` var; `space` kanalı olan bir Space silinirse FK NULL'a çevirir ve CHECK ihlal eder → silme başarısız olabilir | Plan WP0: önce SQL testiyle yeniden üret; sonra silme öncesi tetikleyiciyle kanalı sil |
| R2 | Erişim devri (kütüphane → proje) döngü/yarış: proje erişimi değişirken kütüphane yansıması eski kalır | `_team_sync_space` kütüphane çocuklarını da döner; değişmez testi |
| R3 | `team_access.level` CHECK'i genişlerken `drop constraint` yıkıcı sayılır (`scripts/apply-migrations.mjs`) | Yeni CHECK `not valid` değil doğrudan; migration başına `-- ci:allow-destructive` + gerekçe (veri silmez) |
| R4 | Fonksiyon imzası değişince eski istemci/`feed_page` benzeri belirsiz aşırı yükleme | Yeni argümanlar VARSAYILANSIZ; eski imza ince sarmalayıcı (CLAUDE.md §6 "Akış süzgeçleri" kuralı) |
| R5 | Çok sayıda kütüphane `my_team_todos`/panel sorgusunu yavaşlatır | Sayfa başına sınırlı (en çok 50 proje); canlıda `EXPLAIN` ile ölçülür (§8.13) |
| R6 | Telefon arayüzü yoğunlaşır (seviye seçici 4 değer, kütüphane seçici) | Mevcut `PillSelect`/`ScrollRow`/`FormDisclosure` bileşenleri; telefonda kütüphane seçici yatay şerit |

## 9. Kararlar (kullanıcı onayı bekliyor)

| # | Karar | Öneri |
|---|---|---|
| D1 | `all` modunda yükseltme girişlerine izin verilsin mi ("herkes görsün, şu iki kişi onaylasın")? | **Evet** |
| D2 | Proje yöneticisi (`manage`) projeyi yeniden adlandırma / arşivleme / silme yapabilsin mi? | **Hayır** — yalnız erişim, kanal, kütüphane, onay sayısı. Ad/arşiv/silme ekip yöneticisi ve projeyi açan kişide kalır |
| D3 | Proje silinince kütüphanesi birlikte silinsin mi? | **Evet**, silme onayında "N onaylı prompt silinecek" yazılır |
| D4 | `space` kanalları 50 kanal sınırına sayılmasın mı? | **Evet** |
| D5 | Proje başına onay sayısı geçersiz kılınabilsin mi? | **Evet** (`approvals_needed`; `require_approval`/`hide_unapproved` ekip geneli kalır) |

## 10. Kapsam dışı / bilinçli sınırlar

- Proje başına ayrı API/MCP politikası (kitle, engel) — ekip düzeyinde kalır.
- Grup oluştururken otomatik grup kanalı (§6.2-5).
- Proje şablonları, projeler arası kopyalama.
- Kütüphane sürümlerinin projeler arası taşınması.
- Gerçek Supabase / Realtime / cihaz doğrulaması bu ortamda yapılamaz; yalnız yerel PostgreSQL + ağ taklitli Playwright.
