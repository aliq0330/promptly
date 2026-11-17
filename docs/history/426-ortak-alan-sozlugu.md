# 426 — Ortak ALAN sözlüğü (kategori / ilgi alanı / Skill alanı birleşti)

**Sorun:** "Konu" kavramı beş yerde ayrı ayrı, farklı adla ve farklı yerde tutuluyordu: prompt taksonomisi (DB), Skill uzmanlık alanı (ayrı tablo, 8 madde), profil ilgi alanı (kodda 9 Türkçe metin, `profiles.interests`'e metin olarak yazılıyordu), topluluk kategorisi (kodda 8 sabit değer), ekip (hiç yok). İlgi alanı → kategori eşlemesi `for_you_page` içinde elle yazılmış bir `VALUES` listesiydi (her migration'da kopyalanıyordu) ve tahminiydi ("Oyun Geliştirme" → insan karakter). Skill bu eşlemeye hiç katılmıyordu.

**Üç eksen ayrıldı:**
- **Ortam** (görsel/metin/ses/video): prompt taksonomisi, DEĞİŞMEDİ (`lib/content-taxonomy.ts`).
- **Alan** (konu): tek sözlük `domains` (14 madde) — bu belge.
- **Amaç** (topluluk: genel/öğrenme/vitrin): `chat_groups.category` artık yalnız amaçtır (bkz. "Topluluk").

## Yapılan (bu adım)
- `domains` tablosu: `art, photography, design, software, writing, marketing, business, education, research, data, music-audio, video, game-3d, productivity` (kimlik slug'ı kararlıdır; etiket TR/EN). Herkese açık okuma, yazma yalnız sahip rolü. Skill'in sekiz uzmanlık alanı bunun alt kümesidir (`skill_categories.id → domains.id` yabancı anahtarı); yeni Skill alanı önce alan olarak vardır.
- `taxonomy_category_domains`: prompt kategorisi → alan eşlemesi **veride** (bir kategori birden çok alana ait olabilir; kategori `'*'` = türün tamamı, kategorisiz içerik için). `for_you_page`'in elle `imap` listesi KALKTI, bu tablodan okur. Aynı `for_you_page` Skill'e de ilgi sinyali verir (Skill'in alanı = kullanıcının ilgi alanı → "ilgi alanı" nedeni, +150).
- `profiles.interests` artık **alan kimliği** taşır (`photography`…), Türkçe metin değil. Migration eski değerleri bir kez çevirir (sıra korunur, yinelenenler birleşir, tanınmayan düşer). `interest_domain(text)` hem kimliği hem eski Türkçe değeri çözer: eski istemci eski değeri yazsa bile sunucu doğru çalışır (genişle → daralt; eski değerleri reddeden bir CHECK YOK).
- İstemci: `src/lib/domains.ts` (kimlikler, `DOMAIN_LABEL_KEYS`, `normalizeInterests`, `LEGACY_INTEREST_DOMAIN`); profil okunurken `mapProfileRow` eski değeri alana çevirir. `features/profile/interest-options.ts` ince bir takma ad olarak kaldı. Çeviri: `domain.*` (eski `interest.*` anahtarları silindi).
- Sana özel nedeninin değeri (`reason_ref`, `reason_kind = interest`) artık alan KİMLİĞİDİR; etiket istemcide `t(DOMAIN_LABEL_KEYS[…])` ile çözülür (zaten öyleydi, değer eşlemesi aynı).
- İlk giriş kurulumu 14 alan gösterir. 8 alanın stok fotoğrafı var; işletme/eğitim/araştırma/veri/pazarlama/üretkenlik için fotoğraf YOK — düz renkli şerit gösterilir (`first-run-topics.ts` `TOPIC_IMAGES`'ta boş dizi). Fotoğraf eklenirse oraya yazılır, başka değişiklik gerekmez.
- Topluluk ilgi puanı (`_community_relevance`) ve keşif akışı (`discover_feed_page`): ilgi alanı terimleri artık `_interest_terms(kullanıcı)`'dan gelir = alanın TR+EN etiketinin ≥4 harfli kelimeleri (eskiden serbest metin ilgi alanı).

## Topluluk (aynı çalışma, ikinci migration `20261208110000_community_domain.sql`)
- `chat_groups.domain` (boş olabilir, `domains.id` FK, silinirse null). Eski ortam kategorilerinden **tahmini geri doldurma**: image→art, text→writing, audio→music-audio, video→video, workflow→productivity, learning→education (sahibi ayardan değiştirir); `category` değerleri DEĞİŞTİRİLMEDİ (CHECK hâlâ 8 değeri kabul eder; daraltma sonraki bir contract migration'ı).
- Oluşturma/ayar ekranı iki seçici sunar: **Konu** (14 alan + "Belirtilmedi") ve **Amaç** (genel / öğrenme / vitrin). Mevcut topluluğun eski ortam değeri ayar ekranında listede kalır (sessizce değişmez). `create_community` sondaki `p_domain` parametresini aldı (eski 11 argümanlı çağrı çalışır; eski imza düşürüldü), `update_community` yaması `domain` anahtarını kabul eder (`edit_settings` yeteneği, `invalid_domain`).
- Liste süzgeçleri (Keşfet/Tüm topluluklar çipleri) artık **alan** çipleridir; sunucu `p_category` argümanına amaç YA DA alan kimliği kabul eder (`discover/search/browse_communities`; imza/dönüş değişmedi — liste RPC'lerinin dönüş tablosuna sütun eklemek 6 işlevi yeniden yazmak demekti). Kartlardaki etiket alanın adıdır, alan yoksa amaç/eski kategori.
- Alan liste RPC'lerinden gelmez: `community_domains(uuid[])` (kartı görülebilen topluluklar; ziyaretçiye de açık) ile **toplu tek istek + modül önbelleği** (`fetchCommunityDomains`); RPC yoksa (eski veritabanı) alan yokmuş gibi çizilir. Üye olunan topluluk sayfası `chat_groups.domain`'i doğrudan okur (`domain` `OPTIONAL_COLUMNS`'ta).
- Topluluk ilgi puanı (`_community_relevance`): alanı kullanıcının ilgi alanlarındaysa `interest` nedeni ve +3 (`recommend/browse_communities`); "ortak kategori" sinyali (`category <> 'general'`) olduğu gibi kaldı.

## Kurallar (kalıcı)
- Yeni "konu/alan" gereken her yüzey `domains`'i kullanır; kendi listesini yazmaz. Yeni alan = `domains` satırı + `lib/domains.ts` kimlik + `domain.*` çevirisi (`domains.test.ts` migration tohumu, çeviri ve eski değer eşlemesinin üçünü birlikte denetler).
- Yeni bir prompt taksonomisi kategorisi eklenirse `taxonomy_category_domains`'e de en az bir satır eklenir (`domains.test.ts` TS tohumunu, `supabase/tests/domains.sql` canlı tabloyu denetler). Moderatör aracıyla DB'den eklenen kategori eşlemesiz kalırsa ilgi alanı sinyali almaz (yalnız sıralama etkilenir).
- `profiles.interests` metin DEĞİL kimlik taşır; yeni okuma `interest_domain()` kullanır.

## Bilinen sınırlar / açık
- **Veri ve Üretkenlik alanlarının prompt kategorisi yok** (yalnız Skill'de karşılığı var); bu alanı seçenin Sana özel'inde prompt sinyali yok, Skill sinyali var.
- Eşleme tahminidir ve kategori düzeyindedir (alt kategori yok): "Oyun & 3D" = görsel stil + karakter + animasyon. İnce ayar gerekiyorsa `taxonomy_category_domains` satırı eklemek yeter.
- Skill'in uzmanlık alanı listesi (8) hâlâ `skill_categories`'tir; alt küme olarak kalması bilinçlidir (14'ünün hepsi Skill için anlamlı değil).
- Ekip için kategori eklenmedi (özel çalışma alanı, keşif yüzeyi değil).
- Topluluk geri doldurması tahminidir (ör. "image" topluluğu "Sanat & İllüstrasyon" olur; fotoğraf topluluğuysa sahibi değiştirmelidir). `discover_feed_page` (gönderi akışı) yalnız terim eşleşmesini kullanır, topluluk alanı için ayrı puan eklenmedi.
- Topluluk sayfasında/başlıkta yalnız TEK konu etiketi gösterilir; amaç (öğrenme/vitrin) alan varken kartta görünmez, sayfa ayarlarında vardır.

## Doğrulama
- `supabase/tests/domains.sql` (SQL, yerel PostgreSQL 16): tohum, FK/CHECK, eski değer çözümü, geri doldurma ifadesi (sıra/yinelenen/idempotent), her kategori bir alana bağlı, Sana özel ilgi eşlemesi (prompt + Skill + kategorisiz ses + eski Türkçe değer), topluluk terimleri, yetkiler. `for-you.sql`, `community-home.sql`, `skills-for-you.sql`, `topic-pages.sql`, `content-interest.sql`, `anon-hardening.sql`, `rls-initplan.sql` yeşil (`for-you.sql` ve `community-home.sql` yeni alan değerlerine göre güncellendi).
- `src/lib/domains.test.ts` + `first-run-setup.test.ts` + `i18n-dictionary.test.ts`; `run-first-run.mjs` (10/10) ve `run-home-motion.mjs` (12/12) alan kimlikleriyle güncellendi.
- Topluluk: `supabase/tests/community-domain.sql` (12 kontrol: oluşturma/ayar/geçersiz alan/yetki, süzgeç üç RPC'de, `community_domains` görünürlüğü, ilgi puanı, geri doldurma, FK set null); `communities`, `community-home`, `community-privacy` (anon beyaz listesine `community_domains` bilinçli eklendi), `community-*`, `chat-group*`, `group-unread` SQL testleri yeşil. Arayüz: `run-communities.mjs` (67/68; #22 DEĞİŞİKLİKTEN ÖNCE de kırmızı: sekme adı beklentisi), `run-community-home.mjs` (38/40; #2 ve #4 de değişiklikten önce kırmızı), `run-community-shelf` 7/7, `run-community-posts` 36/36; `run-groups.mjs` 31/36 (kırık olanlar sekme-adı beklentileridir; değişiklikten ÖNCEKİ durum bu dosya için ayrıca ölçülmedi).
- Gerçek Supabase'e KARŞI denenmedi; canlıya uygulanmadı (migration `20261208100000_shared_domains.sql` CI ile uygulanır). İngilizce karşılıklar eklendi (`domain.*`).
