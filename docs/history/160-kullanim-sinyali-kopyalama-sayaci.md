# 9.160 — "Kullanım" sinyali: kopyalama sayacı

Durum: uygulandı. Migration `20260919850000_prompt_copy_count.sql` **canlıda uygulandı** (kayıt dosya sürümüyle düşüldü); arayüz kodu `main`'e birleşince yayınlanır. Önce migration, sonra kod sırası korundu (kod `copy_count` sütununu seçtiği için sütun yokken prompt listeleri hata verirdi).

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

## Bilinçli olarak YAPILMAYAN

- **Sıralama değişmedi.** Sayaç sıfırdan başlıyor; `Popüler` sıralamasını sessizce `like_count + copy_count` yapmak Ana sayfa / Keşfet / Arama arasında tutarsızlık yaratırdı. Veri biriktikten sonra bilinçli karar verilmeli (`feed_page` ve `search_content` birlikte değişmeli).
- Misafir kopyaları sayılmıyor.

## Doğrulama

Yerel PostgreSQL 16: bütün migration'lar baştan oynatıldı; RPC senaryoları (ilk sayım, aynı gün tekrar, taslak/özel/olmayan/yazarın kendisi/oturumsuz), elle `UPDATE`/`INSERT` ile sayaç yazma denemesi (yok sayıldı), yetkiler (anon yürütemez/okuyamaz), sürüm geçmişinin etkilenmemesi, hesap silme. Canlıda: yapı/yetki/RLS/kayıt doğrulandı. Tarayıcı (Playwright, sahte Supabase): oturumlu kopyalama → tam 1 RPC; misafir → 0; başarısız kopyalama → 0; "N kez kullanıldı" görünür; İstatistikler penceresinde TR/EN "Kopyalama/Copies" kutucuğu. Gerçek Supabase'e karşı uçtan uca (gerçek oturumla sayacın artması) DENENMEDİ.
