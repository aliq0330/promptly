# 368 — Ekip: dosya ↔ pano ayrımı, pano grupları, boş doğan proje/dosya, taslak gizliliği

**Durum: KODLANDI (migration `20261119100000_team_file_board_groups.sql` deploy hattıyla uygulanır — `schema_migrations`'a bak; ekleyici + yalnız `-- ci:allow-destructive` işaretli `delete from team_board_groups`, kullanıcı verisi silinmez).**
Kaynak: kullanıcının düzeltilmiş modeli ("dosya ile pano ayrı şeyler"). 367'nin "pano grubu = kapsamın tüm panoları" tanımının yerini alır.

## Model
```
Ekip → Proje (BOŞ doğar) → Dosya (BOŞ doğar)
                             ├─ Dosyanın öğeleri: Not · Prompt · Görsel · Palet (isteğe bağlı)
                             ├─ Dosya değişkenleri (kalır)
                             └─ Panolar: 0, 1 ya da çok (isteğe bağlı) — bağımsız pano ya da PANO GRUBU
```
- Proje geneli alan/pano/değişken YOK. `team_create_project` artık "Ortak" alan kurmaz; `team_create_board` dosya ister (`p_file` null → `project_invalid`); `team_set_variable` dosya ister.
- **Dosyanın öğe kabı** = dosyanın ana alanı (`team_area_main`, Space motoru satırı). Pano DEĞİLDİR: pano listesinde/değiştiricide/"Ana pano" satırında çıkmaz. Bilinçli sapma: plan "otomatik ana pano oluşturma" dedi; öğeleri tutacak bir kap (RLS, yükleme, onay hepsi alan satırına bağlı) gerektiğinden dosya açılırken BOŞ ve GÖRÜNMEZ kap yine kurulur — kullanıcının gördüğü dosya boştur, kendiliğinden pano yoktur. İlk öğe eklenince lazy kap kurmak çok daha geniş bir değişiklik olurdu.
- Öğeler ya dosyaya ya bir panoya aittir (panoya konan not dosya listesinde ayrıca görünmez; ikisinde birden göstermek ayrı, büyük bir iştir).

## Pano grubu
- `team_board_groups` (id, project_id, file_id, title) + `spaces.team_board_group_id`. Bağımsız pano grupsuzdur.
- `team_create_board_in_group(p_from, p_title)`: açık panonun yanına yeni pano; ikisi bir grup olur (grup yoksa kurulur, adı ilk panonun adı), varsa gruba eklenir. Eski dosya ana alanından grup kurulmaz.
- Pano değiştirici, "Tüm panolara bak", taşı/kopyala hedefleri YALNIZ açık panonun grubunu gösterir. Sunucu da zorlar: `team_reorder_boards` aynı gruptaki panoları ister; `team_transfer_items` iki taraf da pano ise aynı grupta olmalı (dosya öğeleri ↔ pano aktarımı serbest).
- Gruptan pano silinince grupta <2 pano kalırsa grup çözülür (`_team_board_group_tidy`). `team_rename_board_group` grubu yeniden adlandırır. `team_project_get` `groups` + `areas/boards[].group_id` döner.
- Dosya ekranı: "Panolar" bölümü (grup = tek satır "Pano grubu · N pano", bağımsız pano ayrı satır; dokununca ilk panonun tuvaline gider) ve "Dosyanın öğeleri" bölümü ayrı. Dosya ekranındaki "Ekle" menüsünden workflow/ayar paketi seçenekleri kalktı (panoda "Promptly'den ekle" ile gelir).
- Mevcut veri: birden çok panolu dosyaların panoları migration'da tek gruba alındı; eski proje geneli ana alan/panolar silinmez — yalnızca veri varsa "Eski proje geneli" kartı olarak okunur/açılır, yeni ekleme yolu yoktur.

## Taslak gizliliği
`_team_item_visible`: `draft` YALNIZ ekleyene görünür (liderden de gizli); `pending`/`changes` ekleyene + liderlere. RLS, Storage, oklar, sayaçlar, yorumlar, `team_file_set_review` sayısı hep bu tek fonksiyonu izler. Onay kuyruğu/Senden bekleyenler zaten yalnız `pending`'i listeliyordu.

## Değişkenler
Proje ortak değişkenleri arayüzden ve çözümlemeden kalktı (`effectiveVariables` yalnız dosya kapsamı). Veritabanındaki eski değerler SİLİNMEDİ (yıkıcı adım ayrı onay ister). Dosya değişkenleri aynen çalışır.

## "Dosya bulunamadı"
Yeni açılan dosya bellekteki eski proje verisinde yoktu. `TeamProjectPage` dosya/pano kimliği bulunamayınca veriyi BİR KEZ tazeler (o sırada iskelet), hâlâ yoksa hata gösterir. Boş dosya hata değil boş durumdur.

## Test
SQL: `team-board-group` (grup senaryoları 300–310 + güncellenenler), `team-projects-v2`, `team-project-review`, `team-library-removal` (yeni kurallara uyarlandı); diğer ekip/Space SQL testleri değişmedi ve yeşil. Birim: `team-board.test.ts` (grup sayfaları, dosya pano satırları), `team-projects.test.ts`. Ağ taklitli Playwright: `run-team-projects` (40), `run-team-board` (20), `run-team-hub` (42).
**Denenmedi:** gerçek Supabase/Realtime/cihaz. Çok panolu canlı dosyalarda grup göçü yalnız yerel PostgreSQL'de sınandı.
