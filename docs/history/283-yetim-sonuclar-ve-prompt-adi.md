# 283 — Prompt silinince sonuçlar kalır (yetim sonuç) + profilde sonucun promptu

Kullanıcı mockup'lardan "A seçeneği" (profil kartında sol altta promptun adı) ve "E2" (prompt silinince sonuçlar sahiplerinde kalır) seçti.

## Veritabanı (`20261007100000_orphan_results.sql`, `-- ci:allow-destructive`: iki `drop constraint`, aynı adlarla yeniden eklenir, veri silinmez)
- `prompt_results.prompt_id` boş olabilir; FK `on delete cascade` → **`on delete set null`**. "Değişiklikli sonuç" CHECK'i artık `prompt_id` şartı aramaz.
- Okuma politikası: promptu okunabilen herkes (eskisi gibi) **+ `prompt_id is null` ise yalnız yaratıcısı**. Yani yetim sonuç herkese açık hiçbir yerde görünmez; sahibi düzenler/siler. Yetimin beğeni/yorumları (politikalar sonucun promptuna bağlı olduğu için) kimseye gösterilmez, yeni beğeni/yorum konamaz; sayaçlar olduğu gibi kalır (arayüz bu alanları gizler).
- `prompt_results_before_update_guard`: `prompt_id` yalnız FK eyleminin `set null`'ıyla (`pg_trigger_depth() > 1`) boşalır; istemci güncellemesi hâlâ reddedilir.
- `prompts_before_delete_results` (SECURITY DEFINER, BEFORE DELETE): **topluluğa özgü** promptun sonuçları eskisi gibi birlikte silinir (içerik topluluktan çıkmaz); diğerlerinde her sonuç sahibine (promptun yazarı hariç) TEK `system` bildirimi (`Sonucunun promptunu sildi: "<başlık>"`, adres = o kişinin en yeni sonucu; en çok 20 000; hesap silinen yazarda `actor` boş).
- `profile_results(p_creator, p_limit, p_offset)` + `profile_result_count(p_creator)` (SECURITY INVOKER, anon + authenticated): profildeki Sonuçlar listesi/sayısı; promptun adıyla birlikte; topluluğa özgü promptun sonucunu listelemez, kendi yetimini listeler. `scripts/smoke-test.mjs` iki RPC'yi denetler.

## İstemci
- `ResultCard label="prompt"` (profil): sol altta promptun adı (yazar adı değil); yetimde "Prompt silindi" + "Yalnız sen görürsün" rozeti. `PromptResultSummary.promptTitle`.
- Sonuç sayfası (yetim): "prompt silindi" notu; beğeni / yorum / paylaş yok.
- `DeletePromptDialog` (prompt ⋮ → Sil): kaç kullanıcı sonucu **silinmez** (küçük resimler + "+N"), beğeni/yorumun silineceği, bildirim notu; topluluk içeriğinde "sonuçlar da silinir". Diğer türler eski iki dokunuşlu onayı korur.
- `deleteRealPrompt` artık sonuç dosyalarını SİLMEZ (yalnız topluluğa özgü promptun sonuçlarının dosyaları); `prompt-media` dosyaları eskisi gibi.
- Bildirim cümlesi `notification-message.ts` + `notifMsg.resultPromptDeleted` (TR + EN); yeni çeviriler `deletePrompt.*`, `result.promptDeleted|onlyYou|orphanNotice`.

## Sınırlar
- Yetimin beğeni/yorum satırları veritabanında durur ama okunamaz; sonuç sahibi silerse (cascade) gider.
- Sonuç sahibi yetimini başka prompta bağlayamaz; ileride "orijinal prompt silindi" yerine silinen promptun başlığı saklanmak istenirse yeni sütun gerekir.
- Admin toplu silme (`admin_bulk_delete_prompts`) sonuçlu promptları hâlâ varsayılan olarak atlar / `force` ister; artık sonuçları götürmez, yetim bırakır (metin güncellenmedi).
- Gerçek Supabase'e / telefona karşı denenmedi; **migration canlıya UYGULANMADI** (önce migration, sonra istemci: migration yoksa profil Sonuçlar RPC'si hata verir, prompt silme eski cascade'le çalışır ve onay penceresi yanlışlıkla "silinmez" der).

Test: `supabase/tests/orphan-results.sql` (18 kontrol; yerel PostgreSQL), `run-result-stats` 11/11 (yeni 3, 4, 5, 5b).
