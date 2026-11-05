# 341 — "Çalıştı mı?" oyu: yorum/sonuç rozeti + oydan sonra isteğe bağlı davet

**Durum: uygulandı (repoda). Migration `20261105120000_prompt_works_for_users.sql` boru hattıyla uygulanır — canlıda olup olmadığına `schema_migrations`'a bak.**

## Neden
Oy (296) tek dokunuş ve değerli, ama "neden çalışmadı?" bilgisi hiçbir yere düşmüyordu; yorum ve kullanıcı sonuçları ayrı yüzeylerdi. Üçü aynı eylemin ("bu promptu denedim") farklı kanıt düzeyleri: oy = beyan, yorum = beyan + açıklama, sonuç = görülebilir kanıt. Space'teki "puan yorumla birlikte" hissi isteniyordu ama oy tablosuna/skora dokunmadan. Karar (kullanıcıyla mockup üstünde): **oy tek doğruluk kaynağı kalır; yorum ve sonuç yalnız oyun yansımasını rozet olarak gösterir; oydan sonra isteğe bağlı bir davet açılır.** Yıldız puanı bilerek eklenmedi (enflasyon, kopyalama güvencesini atlar, oy/beğeni/işe yararlık karışır).

## Ne yapıldı
- **Rozet (salt okunur yansıma):** yorumun yanında ve sonuç kartının sol üstünde yazarın O PROMPTTAKİ oyu — "✓ Çalıştı" / "✗ Çalışmadı". Yorumun/sonucun içine yazılmaz; oy değişirse rozet değişir, geri alınırsa kaybolur, oy vermemiş kişide hiç çıkmaz. Yetim sonuçta ve profilin "Sonuçlar" listesinde (`label="prompt"`) rozet yok.
- **Okuma:** tek RPC `prompt_works_for_users(p_prompt_id, p_user_ids)` (SECURITY DEFINER, STABLE; anon + authenticated). Oy tablosu istemciye KAPALI kalır; kimlik listesi sızıntı kapısı olmasın diye bir oy YALNIZ o kişinin bu promptta silinmemiş yorumu ya da paylaştığı sonuç varsa döner. Okunamayan prompt (özel/taslak/topluluk/silinmiş/yok) boş döner; engel iki yönlü; ≤100 kimlik (`too_many_ids`, istemci 100'erli parçalar). Sayfa başına tek toplu okuma — yorum başına istek yok.
- **İstemci deposu:** `features/prompts/works-badges.tsx` — prompt başına değişmez `kişi → oy` önbelleği (`useSyncExternalStore`), `useWorksVotes`, `publishWorksVote` (kişinin kendi oyu anında rozetlere yansır), `WorksBadge`. Okuma hatası = "bilinmiyor": rozet çıkmaz, hata yüzeye çıkmaz, kişi listesi değişince yeniden denenir.
- **Davet (`PromptWorksVote`):** oy verilince açılır, sayfa açılışında çıkmaz; saf karar `worksInvitePlan` (`lib/prompt-works.ts`, birim testli). "Çalışmadı" → belirgin yorum kutusu ("Neyi beklemiştin, ne çıktı?"), sonuç önerisi YOK (başarısız çıktı sonuç olarak yayınlatılmaz). "Çalıştı" → sönük tek satır; görsel/video/ses promptunda "Sonucunu paylaş" öne çıkar, metin promptunda "Yorum ekle". "Şimdi değil" daveti kapatır, oy durur; oyu geri almak daveti de kapatır. Yorum mevcut `postCommentOnPrompt` ile yazılır, `PROMPT_COMMENT_POSTED_EVENT` ile yorum listesine anında eklenir (`works-events.ts`; yeniden yükleme yok), "Sonucunu paylaş" `PROMPT_ADD_RESULT_EVENT` ile sonuç bölümünün KENDİ penceresini açar (ikinci pencere yok).
- **Ters yön (`AddResultModal`):** sonuç paylaşan henüz oy vermediyse ve oy verebiliyorsa (promptu kopyalamış) "Bunu «Çalıştı» olarak da işaretle" kutusu çıkar — BOŞ gelir, kendiliğinden oy atılmaz; oy zaten varsa kutu yok, "sonucunla birlikte görünür" notu var; oy veremeyen kişide ikisi de yok. Oy ikinci, bağımsız adımdır (`set_prompt_works`); başarısız olursa sonucu bozmaz.

## Gizlilik kararı (ürün sahibi bilmeli)
Oylar bugüne dek kimseye görünmüyordu. Artık **yorum yazan ya da sonuç paylaşan kişinin o promptta verdiği oy herkese (ziyaretçi dahil) görünür.** Yorum/sonuç bırakmamış birinin oyu hâlâ hiçbir yoldan okunamaz. Gizlilik Politikası metni bu cümleyle GÜNCELLENMEDİ (`TERMS_VERSION`/Gizlilik değişmedi) — metne eklenip eklenmeyeceği hukuki/ürün kararıdır.

## İngilizce karşılıklar
Eklendi (`translations-works.ts`): `prompt.works.badgeHint`, `prompt.works.invite*` (NoTitle/NoHint/NoPlaceholder/YesPlaceholder/TextAria/YesResult/YesComment/ShareResult/AddComment/Send/Later/Sent), `result.markWorked/markWorkedHint/worksShownYes/worksShownNo`. Rozet metni mevcut `prompt.works.yes/no`yu kullanır.

## Doğrulama
`tsc` temiz, `npm run lint` 0 hata, `npm test` 941/941 (yeni: `worksInvitePlan`), `npm run build` temiz. DB: `supabase/tests/prompt-works-for-users.sql` 14/14 (yerel PostgreSQL 16; ziyaretçi okur, yalnız yorum/sonuç sahibinin oyu döner, silinmiş yorumun/oysuz kişinin oyu dönmez, okunamayan prompt boş, 100 sınırı, iki yönlü engel, oy değişince/geri alınınca/yorum silinince yansıma, oy tablosu hâlâ kapalı, yetkiler). Ağ taklitli Playwright: yeni `run-works-badges.mjs` 14/14 (davet biçimleri, yorumun listeye eklenmesi, toplu tek okuma, ziyaretçi, kendi oyumun anında yansıması, sonuç kartı rozeti, sonuç penceresi kutusu ve notu, okuma hatası sessizliği, İngilizce, 390 px taşma yok); `run-prompt-works` 11/11, `run-comment-reactions` 4/4, `run-result-stats` 11/11, `run-detail-pages` 47/47 bozulmadı. `scripts/smoke-test.mjs`'e yeni RPC eklendi.
`run-comment-extras` bu sandbox'ta 10/20: GIF seçicili senaryolar derleme `NEXT_PUBLIC_GIPHY_API_KEY` ister (README'deki derleme komutu); bu değişiklikle ilgisiz, o anahtarla koşturulmadı.

## Sınırlar / denenmedi
- Gerçek Supabase'e, gerçek cihaza karşı DENENMEDİ; yalnız yerel PostgreSQL + ağ taklitli Playwright.
- Rozet yalnız prompt yorumlarında ve prompt sayfasındaki sonuç kartlarında; istek/workflow/ayar paketi (oy yok), Odak'ın yorum sayfasında yorum rozeti VAR (aynı `useCommentThread`) ama Odak'ta ayrıca denenmedi; sonucun kendi sayfasındaki (`/results/local`) yorumlarda rozet YOK (hedef sonuç, oy prompta bağlı).
- Sonuç paylaşmak için kopyalama şartı yok (sonuç RLS'i yalnız promptun yayında olmasını ister); rozet "denemiş biri"ni ancak oy kopyalama şartlı olduğu için güvenilir kılar — sonuç paylaşıp oy vermeyenin kartında rozet yoktur.
- Rozet önbelleği oturum boyunca tutulur: başkası sonradan oy değiştirirse sayfa yenilenene kadar eski görünür.
