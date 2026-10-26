# 252 — Toplu silmede "etkileşimi olanları da sil" (B), taslak silince etiket sayacı düzeltmesi, otomatik / önerilen etiket

**Durum: uygulandı (repoda); canlıya UYGULANMADI — `main`'e birleşince `deploy.yml` migration'ı uygular, sonra istemci yayınlanır.**

## Neden
251'deki toplu silme, başkasının dokunduğu (beğeni, yorum, kayıt, alıntı…) promptu atlıyordu. Kullanıcı kararı (B): sitedeki normal "Sil" zaten
bu verileri `ON DELETE CASCADE` ile birlikte siler; aracın freni teknik zorunluluk değil, bilinçli bir güvenlik. Seçenek B: freni
kaldırmak yerine **silmeden önce etkiyi sayıp göstermek** ve açık onayla ("Etkileşimi olanları da sil") silmek.

Aynı denemede (yerel PostgreSQL, 3012 gerçek prompts.chat kaydı) bir sayaç hatası bulundu: **taslak** silinirken `handle_prompt_tag_change`
üst prompt satırını artık göremediği için "taslak değil" sayıp `tags.prompt_usage_count`'u DÜŞÜRÜYORDU (5 yayınlı prompt varken 100 taslak
silinince sayaç 5 → 0). Yayınlı prompt silmede düşüş doğrudur (200 yayınla → 200; 195 sil → 5). "Gizle" sayacı değiştirmez.

## Ne yapıldı
- `20260927130000_admin_bulk_delete_force.sql` (yalnızca ekleyici/değiştirici, `drop` yok):
  - `admin_bulk_delete_prompts(uuid[], boolean)`: `p_force = true` etkileşim korumalarını kaldırır (yetki/etki alanı AYNI: moderatör + yalnız kendi,
    topluluksuz, `original` promptları). Seçim `for update` ile kilitlenir. Taslakların etiket bağları, üst satır hâlâ taslakken önce silinir
    (sayaç düşmez). Denetim kaydına `force` yazılır.
  - 1 argümanlı biçim aynı imzayla `create or replace`: yeni biçimi `false` ile çağırır (eski davranış).
  - `admin_bulk_delete_impact(uuid[])`: yalnız sayı döner — silinecekler (beğeni, yorum, koleksiyon kaydı, alıntı, topluluk gönderisi, sonuç,
    düzenleme önerisi) ve yalnız bağı boşalacaklar (Space öğesi, workflow adımı, mesajdaki paylaşım) + etkileşimli prompt sayısı.
- Arayüz (Moderasyon → Toplu yönetim): "Sil" → etki sayılır; etkileşim varsa sayılar + varsayılan KAPALI "Etkileşimi olanları da sil" kutusu;
  kutu kapalıyken eski davranış (atlar). Etki hesaplanamazsa onay kilitli kalır. Kutu yoksa eski 1 argümanlı RPC çağrılır.
- **Otomatik / önerilen etiket** (neden gelmedi: oluşturma formundaki canlı analiz — `analyzeContent` — yalnız formda çalışıyordu; `import_prompts`/
  `admin_import_prompts` dosyadaki etiketleri yazar, içeriği hiç analiz etmez): `src/lib/exchange/auto-tags.ts` aynı motoru (`analyzeContent`
  + `matchCandidateSuggestions`) formsuz çalıştırır. "Otomatik" = yüksek güvenli katalog etiketleri (yeni etiket oluşturmaz); "Önerilen" = düşük
  güvenli katalog eşleşmeleri + aday sözlüğü (katalogda olmayanlar **yeni etiket** olur, herkese görünür). Prompt başına toplam ≤ 20.
  - Toplu yükleme kartı: iki kutu (Otomatik varsayılan AÇIK, Önerilen KAPALI); analiz tarayıcıda, yazımdan önce; dosyadaki + ortak etiketin üstüne eklenir.
  - Toplu yönetim kartı: **Etiketle** — seçili (kendi) mevcut promptlara aynı seçenekler (`admin-auto-tags.ts`: prompt okuma → analiz → `get_or_create_tag`
    yalnız yeni adaylar için, bir kez → `prompt_tags` upsert, yinelenen yok sayılır; var olan etiketler değişmez/silinmez; kaynak: otomatik →
    `automatic`, önerilen → `manual`). Yayınlı promptlarda sayaç mevcut tetikleyiciyle artar.

## Doğrulama
- `supabase/tests/admin-bulk-delete-force.sql` 17/17 (etki sayımı, force=false eski davranış, taslak silince sayaç düşmez, force=true CASCADE + SET NULL,
  başka moderatör/başka kullanıcı promptuna dokunamaz, denetim kaydı); `admin-bulk-prompts.sql` 22/22, `import-prompts.sql`, `admin-import-prompts.sql`,
  `safety-hardening.sql` 29/29 (her biri temiz veritabanında ayrı koşuldu).
- `src/lib/exchange/auto-tags.test.ts` 8 test (`npm test` 466/466).
- `run-exchange` 30/30 (25–30 yeni: etki gösterimi + force, etkileşimsiz seçim, etki hatası kilidi, Etiketle, kapalı seçenekler, yükleme).
- 3012 gerçek kayıtta hız: Otomatik ≈ 0,4 ms/prompt (toplam ≈ 1 sn); Önerilen ≈ 14 ms/prompt (toplam ≈ 42 sn; arayüz `pickAutoTagsBatch` ile
  20'şer içerikte nefes aldırır, "Durdur" çalışır). Yerel kataloğun 21 etiketiyle Otomatik 3012'nin ~%7'sine etiket ekler (katalog genişledikçe artar);
  Önerilen sözlük genel kelimeleri de yakalar (ör. "Focus", "Lighting") — bu yüzden varsayılan KAPALI ve uyarı metinlidir.
- İngilizce karşılıklar eklendi (`translations-exchange.ts`: `exchange.manage.impact*`, `force*`, `exchange.autotag.*`).

## Bilinçli sınırlar / denenmedi
- Gerçek Supabase'e / oturuma / cihaza karşı DENENMEDİ; migration canlıda değil. `prompt_tags` yazımı sahibin RLS'idir (kendi promptları).
- Cascade ile giden başkasının beğeni/yorumlarının BAŞKA tablolardaki toplam sayaçlarına (ör. profil toplamları) etkisi ayrıca ölçülmedi;
  prompt satırı silindiği için prompt sayaçları zaten gider. Silinen promptlara ait bildirimler (`hl=prompt:<id>`) süpürülmez.
- Taslak etiket sayacı hatası paylaşılan trigger'da kaldı (normal arayüzden kullanıcının kendi taslağını silmesi de etkilenir); burada yalnız
  toplu silme yolunda giderildi. Trigger'ın kendisini düzeltmek ayrı iş (sürüm geçmişi/silme zinciri etkisi ölçülmeli).
- Etiketleme tarayıcıda yapılır: sekme kapanırsa yarıda kalır, aynı seçimle tekrar çalıştırılabilir (yinelenen bağ yok sayılır).
- "Önerilen" katalog dışı etiketleri herkese açık olarak oluşturur; kapatılamayan bir geri alma yoktur (etiket silme aracı yok).
