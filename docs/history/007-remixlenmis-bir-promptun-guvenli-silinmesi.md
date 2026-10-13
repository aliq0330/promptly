### 9.7 Remixlenmiş bir promptun güvenli silinmesi

Bölüm 9.6'da keşfedilen, bildirim sisteminden bağımsız, önceden var olan
şema boşluğu ("remixlenmiş bir orijinal prompt silinemiyor, veritabanı
hatası veriyor") kullanıcının önerdiği çözümle kapatıldı: **Bölüm 9.5'in
yorum/yanıt "güvenli silme" deseninin birebir aynısı** — kullanıcının
kendi sözleriyle "yerinde kalsa, yalnızca 'silindi' yazsa" önerisi tam
olarak bu.

**Sebep (kullanıcıya verilen cevap):** `prompts.source_prompt_id`
(Bölüm 18) `on delete set null` ile tanımlı, ama aynı migration'ın
`prompts_origin_shape` CHECK kısıtı `origin_type = 'remix'` olan bir
satırda `source_prompt_id`'nin ASLA null olamayacağını şart koşuyor.
Orijinal bir prompt silinmeye çalışıldığında, FK cascade'i kendi
remixinin `source_prompt_id`'sini null'a çekmeye çalışırken bu CHECK
kısıtına çarpıp veritabanı hatasıyla reddediliyordu — evet, tam olarak
"remixi olduğu için" sorulan soru doğruydu.

**Yeni migration:** `supabase/migrations/20260919190000_prompt_safe_
delete.sql` — `prompts.deleted_at timestamptz` (yeni kolon) + bir
`BEFORE DELETE` trigger'ı (`handle_prompt_delete`, Bölüm 9.5'in
`handle_comment_delete`'iyle birebir aynı desen): bir promptun gerçek
remixleri (`source_prompt_id = old.id` eşleşen başka satırlar) VARSA,
DELETE'i iptalleyip yerine bir soft-delete UPDATE'i uyguluyor
(`deleted_at` damgalama + `title`/`description`/`prompt_text`'i
boşaltma + `prompt_media`/`prompt_tags` satırlarını silme); hiç remixi
yoksa DELETE olduğu gibi geçip satırı gerçekten siliyor. `security
invoker` (varsayılan) yeterli — Bölüm 9.5'teki aynı gerekçeyle
(kullanıcı zaten kendi promptunu silme yetkisine sahipse, güncelleme
yetkisine de zaten sahip). Frontend `deleteRealPrompt` **hiç
değişmedi** — hâlâ aynı basit `DELETE`'i gönderiyor, veritabanı hangi
sonucun uygulanacağına tek ve atomik bir işlemde karar veriyor.

**İstemci tarafı:** `Prompt.deletedAt: string | null` eklendi.
`src/lib/supabase/prompts.ts`'teki TÜM normal listeleme fonksiyonları
(`fetchRecentPublishedPrompts`, `fetchPromptsByAuthor`,
`fetchPromptsByAuthors`, `searchPrompts`, `fetchRemixesOf`,
`fetchPromptsForRequest`, `fetchSavedPrompts`, `fetchLikedPrompts`) yeni
bir `filterNotDeleted()` yardımcısıyla soft-deleted bir promptu artık
hiç göstermiyor — feed/keşfet/profil/arama/kaydedilenler/beğeniler/istek
yanıt listesi/remix listesinde silinmiş bir gönderi hiç görünmüyor.
**Bilinçli olarak filtrelenmeyen iki yer:** `fetchPromptById` (doğrudan
bir link hâlâ satırı bulup göstermeli — yalnızca boş içerikle) ve
`fetchRemixChain`'in kullandığı zincir yürüyüşü (bir ara halka
silinmişse bile zincir onun ÖTESİNDEKİ gerçek kaynağa doğru devam
edebilmeli — `origin_type`/`source_prompt_id` soft-delete'te hiç
değişmiyor). `/prompts/local` artık `prompt.deletedAt` set edilmişse
tam `PromptDetailView` yerine dürüst bir "Bu paylaşım silindi" sayfası
gösteriyor; `RemixContext` (kart/detay sayfasındaki "Remixlenen
çalışma" kutusu) kaynağı silinmişse başlık/görsel yerine "Bu paylaşım
silindi." yazıyor; remix zinciri breadcrumb'ındaki silinmiş bir halka
"Silinmiş paylaşım" etiketiyle gösteriliyor (boş başlık yerine).

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'daki mevcut
test veritabanına (önceki 13 migration + Bölüm 9.6'nın gerçek test
verisiyle — Aylin'in remixlenmiş `dddddddd…` prompt'u dahil) gerçekten
uygulandı ve 3 senaryo çalıştırıldı: remixi olan bir promptu silmeye
çalışmak artık HATA VERMEDEN `DELETE 0` dönüyor (soft-delete oldu),
`title`/`description`/`prompt_text` boşaldı, `deleted_at` damgalandı,
VE remixlerinin `source_prompt_id`/`origin_type`'ı hiç değişmeden kaldı
(CHECK ihlali yok), `prompt_media` temizlendi; remixi olmayan bir
prompt gerçekten (`DELETE 1`) silindi; başkasının promptunu silme
denemesi RLS tarafından sessizce 0 satır etkileyerek engellendi. Ayrıca
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla Playwright'ta: doğrudan bir linkle silinmiş
bir promptun "Bu paylaşım silindi" sayfasını gösterdiği, normal bir
promptun değişmeden render edildiği, silinmiş bir kaynağın remixinin
kendi context kutusunda "Bu paylaşım silindi." gösterdiği (remixin
kendi içeriği hiç etkilenmeden), ve feed'in silinmiş promptu kendi
kartı olarak HİÇ göstermediği (yalnızca onu remixleyen kartın kendi
"Remixlenen çalışma" bağlam kutusunun ona referans vermeye devam
ettiği — bu doğru/istenen davranış, Bölüm 9.6'daki gibi ayrı bir
"hata değil" notu) — hepsi sıfır JS hatasıyla doğrulandı. Gerçek bir
Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı
yüzünden yapılamadı (tekrarlanan, dürüstçe belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Soft-deleted bir promptun `like_count`/`comment_count`/`remix_count`
  sayaçları sıfırlanmıyor (dokunulmadı) — zaten hiçbir yerde
  gösterilmiyor (yalnızca "silindi" placeholder'ı render ediliyor),
  pratik bir etkisi yok.
- Soft-deleted promptun altındaki `prompt_likes`/`prompt_comments`
  satırları da silinmiyor (yalnızca `prompt_media`/`prompt_tags`
  temizleniyor) — bunlar zaten hiçbir yerde ayrıca gösterilmiyor
  (yorum bölümü zaten yalnızca `/prompts/local` üzerinden erişiliyor,
  o da artık "silindi" sayfasını gösteriyor, yorum bölümünü hiç
  render etmiyor).
- Bu, prompt tarafındaki TEK safe-delete senaryosu — `prompt_requests`
  için benzer bir kısıt/ihtiyaç yok (bir isteğin kendisi başka bir
  isteğin "kaynağı" olamıyor), bu yüzden orada bir karşılığı yok.
