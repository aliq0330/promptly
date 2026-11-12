# 376 — Ekip dosyası asıl, pano yansıma; ekibe özgü içerik; tek "Ekle" (Oluştur · Seç)

Durum: **uygulandı** (veritabanı + istemci). Yerel PostgreSQL SQL testleri ve ağ taklitli Playwright ile sınandı; **gerçek Supabase / cihaz / Realtime'a karşı DENENMEDİ**.

## Karar (kullanıcı)
- Dosya tek gerçek kaynaktır; pano yalnız bir **gösterim yeridir**. Aynı öğe birden çok panoda görünür (kopya değil). Panodan kaldırmak yalnız yerleşimi siler; dosyadan silmek öğeyi bütün panolardan da götürür. Pano grupları kalır (yalnız düzen aracı).
- Panoya doğrudan eklenen içerik kendiliğinden dosyaya da girer (aynı içerik dosyada varsa o kullanılır).
- Proje dosyasından ya da panodan "Oluştur" denince oluşturma ekranı açılır; hedef varsayılan olarak **"Proje → Dosya (+ Pano)"**dır, normal akış paylaşımı yoktur → içerik **ekibe özgüdür**.
- Workflow dosyada tek referans kartı olarak girer; panoda mevcut "Workflow aktar" planlayıcısı adımlara açar (değişmedi).
- Mevcut pano öğeleri tek seferlik dönüşümle dosyaya alındı.

## Model (`20261122110000_team_file_items.sql`)
- `space_items.file_item_id`: dosyanın **ana alanındaki asıl öğe** (`file_item_id` boş) ⇄ panodaki **yansıma** (dolu). Pano motoru (konum, ok, konumlu yorum, taslak gizleme, RLS) DEĞİŞMEDİ: yansıma gerçek bir `space_items` satırıdır.
- İçerik sütunları (başlık, metin, not, gizli not, prompt/görsel/palet/içerik başvurusu, onay durumu) asıl öğeden gelir ve ona yazılır (`space_items_file_link` BEFORE INSERT; `space_items_mirror_forward` BEFORE UPDATE; `space_items_file_fanout` AFTER UPDATE; `promptly.team_item_sync` / `team_item_origin` işlem-yerel işaretleri). Konum, boyut, renk, grup, kilit pano satırında kalır.
- Panoya asıl öğesiz eklenen içerik öğesi için ana alanda asıl öğe bulunur (aynı yayınlanmış prompt / içerik başvurusu / görsel adresi / workflow adım kaynağı) ya da açılır. Çizim nesneleri (çerçeve/metin/şekil) ve öğeye iliştirilmiş notlar yalnız panoya aittir.
- Paletler dosyanın ana alanında yaşar (panoya eklenen palet satırı ana alana yönlenir); yansımalar aynı palete başvurur. Görsel adresi aynı projenin başka alanının klasöründen olabilir; Storage okuması dosyaya başvuran okunabilir satırı da izler (pano silinse de görsel okunur).
- Onay durumu asıl öğededir; yansımalar kopyalar. `_team_review_targets` yansıma kimliğini asıl öğeye çevirir; kuyruk/özet/todo yalnız asıl öğeleri sayar; `team_project_get` dosya sayıları yalnız ana alandır.
- Panodan kaldırma (yansımayı silme) onay kuralına takılmaz; `team_item_delete` asıl öğeyi (ve kaskadla yansımaları) siler, onay kuralı çağıranın rolüyle işler.
- RPC'ler: `team_board_place_items(pano, öğeler, x, y)`, `team_item_delete(öğe)`, `team_attach_content(dosya, tür, kimlik, pano?)`, `team_content_location(tür, kimlik)`. `team_transfer_items` uyumluluk için durur ama yerleşim anlamıyla çalışır (asıl içerik çoğalmaz; grup şartı kalktı).
- Dönüşüm `_team_backfill_file_items()` (idempotent, hiçbir satır silinmez): değişmez kimlikli aynı içerik (aynı başlık/metin/not/onay) tek asıl öğede birleşir; kimliksiz notlar/taslaklar ayrı asıl öğe alır.

## Ekibe özgü içerik (`20261122100000_team_scoped_content.sql`)
`community_id` kalıbının ekip karşılığı: `prompts / prompt_requests / workflows / presets.team_file_id`.
- Sunucu görünürlüğü `private`a zorlar (tüm "herkese açık" süzgeçler dışlar); okuma yalnız projeyi görebilen üyeye, yalnız yayında ve asıl dosya öğesi görünürken (`team_content_item_visible`: taslak liderden de gizli).
- `team_file_id` değişmez; topluluk ve ekip birlikte olamaz; yazma için proje rolü edit/lead; onaylı/bekleyen içeriği yalnız lider değiştirir/siler.
- Beğeni, yorum, kaydet, koleksiyon, alıntı, sonuç, düzenleme önerisi, ilişki ve başka workflow'da adım olarak kullanım reddedilir (`team_content_not_shareable`). Kişisel Space'e/başka projeye eklenemez.
- Asıl öğe silinince içerik, içerik silinince asıl öğe ve yansımalar gider. İçeriğin kendi sayfası yok: `/prompts/local?id=` vb. dosyadaki öğeye yönlenir (`useTeamContentRedirect`).

## Sızıntı denetimi (`20261122130000_team_content_leak_guard.sql`, `20261122120000_search_content_exclude_authors.sql`)
`community_id is null` süzgeci olan 44 SQL işlevi gövdeleri aynen yeniden yazıldı, her süzgecin yanına `team_file_id is null` eklendi (canlı tanımlardan üretildi); `search_content` ekibe özgü içeriği dışlar. TS tarafında 25 sorguya `team_file_id` süzgeci eklendi; `team-content-guard.test.ts` yalnız `community_id` süzgeci yazıp ekibi unutmayı yakalar (muaf: `public-api/`, yalnız anon). SQL testi `team-content-isolation.sql`.

## Arama: "yazar hariç"
`search_content` yeni 15 argümanlı imza (`p_exclude_author_ids`, varsayılansız); eski 14 argümanlı imza ince sarmalayıcı. İstemci yalnız hariç tutma varken yeni biçimi çağırır (`searchContentIds`). Başkalarının paylaştıkları sekmesi için.

## İstemci
- `features/teams/content-add.tsx`: dosyada (`AddMenuDialog`) ve panoda (araç çubuğu) AYNI satırlar — Prompt/İstek/Workflow/Ayar paketi için **Oluştur** (oluşturma ekranı `?teamProject=&teamFile=[&teamBoard=]`) ve **Seç**. Prompt artık dosyada/panoda yazılmaz.
- `features/teams/content-picker.tsx`: "Paylaştıklarım" / "Başkalarının paylaştıkları" sekmeleri, aramadaki gelişmiş arama kutusu (`AdvancedSearchBox`) + satır içi Filtre (`SearchFilterSections`), keyset sayfalama; seçilen içerik başvuru olarak eklenir.
- `features/teams/team-return.ts` (`community-return.ts`'in karşılığı) + `PublishPanel team=`: kilitli hedef kartı, görünürlük/duyuru yok, buton "Dosyaya ekle"; dört form (`create-prompt-form`, `create-request-form`, `workflow-editor`, `preset-editor`) `teamFileId` yollar ve yayından sonra `team_attach_content` + dosyaya/panoya dönüş.
- "Panoya ekle" çok panolu seçime döndü (taşı/kopyala ve "Dosyada da kalsın" kalktı); öğe çekmecesinde "Panolarda" rozetleri, panodaki öğede "Panodan kaldır" ile "Dosyadan sil"; panoda toolbar'da aynı ayrım. `fetchSpacePalettes(spaceId, true)` ekip panosunda ana alanın paletlerini de getirir.

## Testler
SQL: `team-file-items.sql` (67), `team-content-isolation.sql`, `team-board-group.sql` (yeni anlama uyarlandı); tüm 92 SQL dosyası yeşil (yalnız `contract-cleanup.sql` 3 hata veriyor — bu değişiklikten ÖNCE de veriyordu). Birim: `team-create.test.ts`, `team-content-guard.test.ts`. Playwright: `run-team-projects` 52/52 (yeni 32b–d, 43/43b/44 yeniden yazıldı), `run-team-board` (5, 5b).

## Bilinçli sınırlar
- Ekibe özgü içeriğin onaydan sonra düzenlenmesi: yazar düzenleyemez (sunucu `review_content_locked`); prompt için "Değişiklik öner" lider onayında PROMPT SATIRININ başlık/metnine uygulanır (istek/workflow/ayar paketi için öneri yok).
- Dönüşüm: aynı içeriğin farklı onay durumundaki iki panodaki kopyası birleştirilmez (ayrı asıl öğe).
- Workflow dosyada referans kartıdır; panoda kartı seçince "Adımlara aç" mevcut planlayıcıyı (`runImport`) çalıştırır (adım kartı + prompt + görsel + oklar). Eski "Workflow aktar" penceresi yalnız kişisel Space panosunda kaldı.
- Gizlilik/Koşullar metni ekibe özgü içerik için güncellenmedi (ürün/hukuk kararı). Edge Function'lar değişmedi.
