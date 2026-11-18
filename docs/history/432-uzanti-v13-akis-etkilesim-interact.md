# 432 — Chrome uzantısı v1.3: Sana özel / Takip akışı, koleksiyonlar, alt sekmeler ve `interact` kapsamı

**Karar (kullanıcı):** "Hepsini yap, sadece prompt gözüksün." Önceki turda bilerek yapılmayanlar (sunucu uçları + yeni yazma izni) onaylandı;
istek / ayar paketi / workflow / skill listeleri uzantıya **konmadı** (yalnız prompt). Ayar paketi uygulama ve Alt+1…5 kısayolu yapılmadı (gerekçe aşağıda).

## Sunucu (migration `20261209100000_api_me_interact.sql` — expand; tek yıkıcı ifade `oauth_decide` eski imzası)
- **Üçüncü kapsam `interact`:** `api_tokens` / `oauth_codes` / `oauth_grants` kapsam CHECK'leri `read|write|interact`'e genişledi (eski kayıtlar geçerli).
  `create_api_token` `interact` kabul eder. `oauth_decide(p_request, p_approve, p_write default false, p_interact default false)` — eski 3 argümanlı imza
  düşürüldü (yenisi varsayılanla aynı çağrıyı karşılar; iki imza birlikte "benzersiz değil" hatası verirdi). Onay ekranında etkileşim anahtarı varsayılan KAPALI.
- **Okuma (INVOKER `api_me_*`):** `api_me_feed` (Sana özel = `for_you_page`, Takip = `feed_page('following','newest')`, yalnız prompt; `reason_ref` yalnız etiket/araç/ilgi
  alanı için, takip edilen kişinin kimliği dışarı verilmez), `api_me_collections`, `api_me_collection_prompts`, `api_me_engagement` (≤30 kimlik: tepkim, kaydettim mi,
  koleksiyonlarım, yazarı takip, "Çalıştı mı?" durumu — `prompt_works_state` yalnız sayı + ÇAĞIRANIN oyu döner).
- **Yazma (INVOKER):** `api_me_react` (null = geri al), `api_me_set_saved` (kaydet = sistem koleksiyonuna satır; kaldır = `unsave_content`), `api_me_collection_item`
  (yalnız kendi/ortak, sistem olmayan koleksiyon; çıkarmak kaydı etkilemez), `api_me_set_follow` (kullanıcı adıyla). Oy mevcut `set_prompt_works` RPC'sidir.
  Hepsi yalnız herkese açık + yayında + topluluğa özgü olmayan prompt için; sitedeki RLS/askı/engel/hız sınırı tetikleyicileri atlanmaz.
- **Hız kovası:** `api_me_throttle_kind('read'|'write'|'interact')` — etkileşim 60/dk (okuma 120, taslak 30 aynı).
- SQL testi `supabase/tests/api-me-interact.sql` (27 madde): kapsam kısıtları, OAuth kapsam kombinasyonları, tepki/kaydet/koleksiyon/takip, akış sızıntısı yok,
  hız sınırı, anon yetkisizliği. (Aynı deyimdeki alt sorgu deyim anlık görüntüsünü gördüğü için durum denetimi `_q()` ile dinamik çalışır.)

## Açık API (`src/lib/public-api`)
- `me.ts`: `MeScope` = read|write|interact; hız kovası `api_me_throttle_kind`; `translateDbError` kısa kodları HTTP'ye çevirir (`not_found` 404, `invalid_reaction` 400,
  `self_*_not_allowed`/`copy_required`/`interaction_blocked` 422, `rate_limit` 429; diğer her şey sızmaz → 502).
- `me-social.ts` (yeni): `GET /me/feed`, `/me/collections`, `/me/collections/{id}/prompts`, `/me/engagement`; `PUT|DELETE` `/me/prompts/{id}/reaction|saved|works`,
  `/me/collections/{id}/prompts/{pid}`, `/me/following/{kullanıcı}`. Akış satırı veritabanından yalnız kimlik+sıra gelir, kart `summariesByIds` ile **ANON** okumayla
  doldurulur (özel içerik hiçbir yoldan sızmaz). Sana özel imleci `as_of`'u taşır (sıralama kaymaz).
- `public-detail.ts` (yeni, belirteçsiz): `GET /prompts/{id}/results|versions|comments` — önce prompt herkese açık mı doğrulanır, yeni SQL yok (RLS süzer), sonuç görseli
  KISA ÖMÜRLÜ imzalı küçük resim (hata güvenli), yorumlar en yeni önce + yanıtlar gömülü (≤100).
- CORS `PUT, DELETE` eklendi; OpenAPI + dizin güncellendi; Edge kopyaları `node scripts/sync-function-shared.mjs`. `scripts/smoke-test.mjs`'e yeni RPC'ler (ziyaretçiye KAPALI).

## Site
- `/oauth/connect`: ikinci anahtar "Beğeni, kaydetme ve takip yapmasına da izin ver" (varsayılan KAPALI; `p_interact` yalnız işaretliyse gönderilir). "Asla yapamaz" metni
  güncel (yorum/mesaj yok). Ayarlar → Geliştirici: anahtar oluştururken "Etkileşim" onay kutusu + rozet, Bağlı uygulamalar'da kapsam etiketi, `/developers` kural metni.
- **Kullanım Koşulları + Gizlilik** güncellendi (`TERMS_VERSION` 2026-11-18): açık API'nin alt kaynakları (sonuç/sürüm/yorum), `interact` kapsamının neyi yapabildiği.
  Hukuk metninin danışman onayı hâlâ açık (CLAUDE.md "Açık işler").

## Uzantı (v1.3.0; yeni izin YOK)
- Ana Sayfa: **Sana özel · Takip ettiklerim · Popüler** (`PLib` kaynakları `feed_for_you`/`feed_following`); karta gösterilme nedeni. Kütüphane → **Koleksiyonlar** (liste → içindekiler → geri).
- Ayrıntı bölmesi: **Prompt · Sonuçlar · Sürümler · Yorumlar** (yalnız herkese açık promptta; tembel + sayfalı); etkileşim satırı (6 tepki, kaydet, koleksiyon menüsü, yazarı takip, "Çalıştı mı?").
- `shared/engage.js` (`PEngage`): durum önbelleği, 30'arlı yükleme, iyimser güncelleme + hata olursa geri alma, aynı yazarın tüm kartları birlikte. Kapsam yoksa kartta düğme çizilmez, ayrıntıda
  "İzni aç" (yeniden bağlanır; onay sayfasında anahtarı kullanıcı işaretler). Kendi promptunda hiçbir etkileşim çizilmez.
- Testler: 10 birim testi (`engage.test.mjs`), e2e 25 senaryo (gerçek Chromium + sahte sunucu; yeni: Sana özel/Takip/Popüler + imleç, kart ♥, ayrıntı etkileşimleri PUT/DELETE, alt sekmeler,
  Koleksiyonlar, izin yokken çağrı).

## Bilerek yapılmayanlar
- **Ayar paketi uygulama:** paketin prompta birleşmesi sitenin kendi mantığına bağlı; uzantıda uydurma biçim yazılmaz. Alt+1…5: Chrome en çok 4 öneri kısayolu verir.
- İstek / ayar paketi / workflow / skill listeleri uzantıda yok (kullanıcı: yalnız prompt).

## Canlıya alma
Migration `deploy.yml` ile merge'de uygulanır; **Edge `api` + `oauth` işlevleri CI ile deploy EDİLMEZ** — "Deploy Edge Functions" iş akışı elle çalıştırılır (yeni uçlar, küçük resim, Çalıştı %).
