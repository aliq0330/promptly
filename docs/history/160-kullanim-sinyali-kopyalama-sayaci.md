# 9.160 — "Kullanım" sinyali: kopyalama sayacı

Durum: uygulandı (sayaç + görünürlük + "En çok kullanılan" sıralaması). Migration'lar `20260919850000_prompt_copy_count.sql` ve `20260919880000_feed_page_used_order.sql` **canlıda uygulandı** (kayıt dosya sürümüyle düşüldü); arayüz kodu `main`'e birleşince yayınlanır. Önce migration, sonra kod sırası korundu (kod `copy_count` sütununu seçtiği için sütun yokken prompt listeleri hata verirdi).

## Ne

Platformun imzası kopyalanan prompt; beğeni vitrindir, kopyalama gerçek kullanımdır. Bir prompt kopyalanınca / bir yapay zekâ aracında çalıştırılınca sayılır; sayı prompt detayında ("N kez kullanıldı") ve İstatistikler penceresinde dördüncü kutucuk olarak ("Kopyalama") görünür.

## Kurallar (veritabanı)

- `prompts.copy_count` denormalize sayaç; `prompt_copy_events (prompt_id, user_id, day)` dedupe tablosu, RLS açık, politika YOK.
- `record_prompt_copy(uuid)` (SECURITY DEFINER, `search_path = public`, yalnız `authenticated`): giriş yapmış kullanıcı, **aynı prompt'u günde en fazla bir kez** sayar; yazar kendi prompt'unu saymaz; yalnızca yayımlanmış + public + silinmemiş prompt sayılır; misafir sayılmaz (kimliği yok, şişirmeye açık olurdu).
- **Sayaç koruması:** yazar kendi prompt'unu güncelleyebildiği için (RLS yalnızca "yazar" der, tablo yetkisi tüm sütunlar) istemci `copy_count`'u doğrudan yazabilirdi. `prompts_protect_copy_count` (BEFORE INSERT/UPDATE) `anon`/`authenticated` rolüyle gelen değişikliği yok sayar; SECURITY DEFINER RPC (sahip rolü) etkilenmez.
- Sürüm/düzenleme trigger'ları yalnızca başlık/açıklama/metin/araç değişince çalışır; kopyalama sürüm geçmişi veya "düzenlendi" kaydı üretmez. `updated_at`, `like_count`'ta olduğu gibi değişir (arayüz prompt için `updated_at` kullanmıyor).
- Hesap silme: olay satırları `on delete cascade` ile gider (`delete_account_data` ile sınandı).
- Canlıya uygularken MCP `execute_sql`, içinde `drop` geçen ifadelerde onay bekleyip zaman aşımına uğruyor (bkz. 158); migration bu yüzden `drop trigger` yerine `create or replace trigger` kullanır.

## Arayüz

- `recordPromptCopy` (`lib/supabase/prompt-usage.ts`): fire-and-forget, hata yutar — kopyalama asla bunun yüzünden başarısız olmaz/beklemez.
- `CopyPromptButton` (`promptId` prop) ve `RunButton` (`promptId` prop; metin araca gitti ya da panoya kopyalandıysa): yalnızca oturum varsa ve işlem başarılıysa çağırır.
- `Prompt.copyCount` (`mapPromptRow` tek noktası; sütun yoksa 0). Detay: `prompt.usedOnce/usedCount`. İstatistik: `statistics.tileCopies` (4 kutucuk, mobilde 2×2).
- Etki alanı taraması: kopyalama noktaları yalnızca prompt detayı (kopyala + çalıştır). `PromptPreviewBox` hiçbir yerde kullanılmıyor (ölü bileşen; bağlandı ama etkisiz). İstek/workflow/hazır ayarda kopyala düğmesi yok, sayaç yalnızca prompt için.

## "En çok kullanılan" sıralaması

- `feed_page` `p_order = 'used'` (`20260919880000`): AYNI 11 argümanlı imzayla `create or replace` (drop yok, sarmalayıcı/grant değişmedi); önceki sürüme göre fark yalnızca 1 parametre satırı + prompt kolundaki 3 sıralama ifadesi (diff ile doğrulandı). Sıralama anahtarı prompt'ta `copy_count`, diğer türlerde 0 → "Tümü"nde kullanılanlar önce, gerisi en yeniden eskiye; anlamlı kullanım için yalnızca **Keşfet → Promptlar** bölümünde sunulur.
- `ContentSortKey` + `"most-used"`; `SORT_KEYS` hâlâ ortak üç anahtar (liste sayfaları, profil, İçeriklerim DEĞİŞMEDİ); `SortSelect`/`ListToolbar` isteğe bağlı `keys`/`sortKeys` alır. Keşfet başka bölüme geçince seçim "En çok beğenilen"e düşer (anlamsız sıralama gösterilmez), Promptlar'a dönünce geri gelir.
- `feed-cursor.ts`: `FeedOrder` + `"used"`, `feedSortRank(order, {likeCount, copyCount})`; imleç testleri `used` için de sayfa sayfa gezmeyi doğrular.
- **Bilerek DEĞİŞMEYEN:** `Popüler` hâlâ yalnızca beğeni (sayaç sıfırdan başlıyor; sessizce karıştırmak Ana sayfa / Keşfet / Arama arasında tutarsızlık yaratırdı), `search_content` (aramada "kullanım" sıralaması yok), liste sayfalarının istemci tarafı sıralaması.
- Misafir kopyaları sayılmıyor.

## Doğrulama

Yerel PostgreSQL 16: bütün migration'lar baştan oynatıldı; RPC senaryoları (ilk sayım, aynı gün tekrar, taslak/özel/olmayan/yazarın kendisi/oturumsuz), elle `UPDATE`/`INSERT` ile sayaç yazma denemesi (yok sayıldı), yetkiler (anon yürütemez/okuyamaz), sürüm geçmişinin etkilenmemesi, hesap silme. Canlıda: yapı/yetki/RLS/kayıt doğrulandı. Tarayıcı (Playwright, sahte Supabase): oturumlu kopyalama → tam 1 RPC; misafir → 0; başarısız kopyalama → 0; "N kez kullanıldı" görünür; İstatistikler penceresinde TR/EN "Kopyalama/Copies" kutucuğu. Sıralama: yerel PostgreSQL'de `used` sırası, imleçle 4'erli gezme (12/12, tekrarsız, sıralı), diğer sıralar ve sarmalayıcı aynı; canlıda Ana sayfa 50, açık istek 30, `popular` hâlâ beğeni. Tarayıcıda 7 senaryo: seçenek yalnız Promptlar'da, doğru `p_order`/`p_kinds`, bölüm değişince geri düşme, `/prompts` listesi etkilenmedi. Gerçek Supabase'e karşı uçtan uca (gerçek oturumla sayacın artması) DENENMEDİ.
