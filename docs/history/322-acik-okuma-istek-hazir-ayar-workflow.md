# 322 — Açık API/MCP: herkese açık istek · hazır ayar · workflow okuma

> **Durum:** repoda, testli (birim + MCP). **Canlıya UYGULANMADI.** Yeni SQL/migration YOK; yalnız Edge Function `api` ve `mcp` yeniden deploy edilir. **Deploy'dan önce bekleyen karar: Kullanım Koşulları metni (aşağıda).** Gerçek Supabase'e/MCP istemcisine KARŞI DENENMEDİ.

## Belirti (kullanıcı)
`…/functions/v1/mcp/me` ile bağlanınca prompt'ta hem kendi hem herkese açık içerik görünüyor, ama istek / hazır ayar / workflow'da yalnız kendi kayıtları görünüyor.

## Neden
Hata değil, eksik özellik: açık araçlar (`search_prompts`, `popular_prompts`, `get_prompt`, `fill_prompt`) yalnız prompt kapsıyordu; istek/hazır ayar/workflow için yalnız kişisel araçlar vardı (`list_my_content`, `get_my_content`, 321).

## Ne yapıldı
- **Çekirdek `src/lib/public-api/public-content.ts`:** `searchPublicContent(client, kind, …)` = sitenin kendi `search_content` RPC'si (`p_kind`, SECURITY INVOKER, keyset) + anon PostgREST ile satır çekimi; `getPublicContent` tek kayıt. `prompts.ts`'in doğrulama yardımcıları dışa açıldı (ikinci kopya yok). Yalnız yayında/taslak olmayan + `visibility='public'` + `community_id is null` (+ istekte `deleted_at is null`); `search_content` topluluğa özgü içeriği ayıklamaz (RLS'e yaslanır), ayıklama satır çekiminde olur → sayfa limitten kısa olabilir, imleç veritabanının son satırından ilerler (`searchPrompts` ile aynı kural).
- **Yanıt biçimi:** özet = `id, kind, url (paylaşım sayfası), title, description (≤300), contentTypes, category, subcategory, tools, tags, author, stats, createdAt` + türe özgü (`requestStatus/responseCount`, `stepCount`). Ayrıntı: istek → `creativeDirection`; hazır ayar → `selection` (`{lens:"135mm", style:"editorial"}` — canlı veride anahtarlar okunur adlardır, alan çözümlemesi gerekmedi); workflow → `steps` (1 tabanlı `position`, başlık/açıklama/yönerge, girdi-çıktılar). **Adımın bağlı promptu yalnız herkese açıksa** kimlik + başlık + bağlantıyla görünür; özel/topluluk promptunun kimliği ve başlığı hiç yazılmaz, prompt metni burada ASLA yoktur (metin `get_prompt`'tan).
- **REST:** `GET /v1/{requests,presets,workflows}` (q, content_type, category, subcategory, tag, tool, sort, limit, cursor) ve `/{id}`; yalnız GET, anahtar gerekmez. OpenAPI + dizin güncellendi.
- **MCP:** `search_content` ve `get_content` (`kind: request|preset|workflow`), hem `/mcp` hem `/mcp/me`'de; kişisel araçlar aynen duruyor. `remote.ts` bilgi sayfasındaki araç listesi de güncellendi (321'in araçları orada eksikti).
- **Metinler (TR+EN):** `/developers` (araç listesi + örnek + açıklama).

## Testler
`public-content.test.ts` (7): her tür kendi `p_kind`/tablosuyla ve herkese açık süzgeçleriyle; türe özgü özetler; okunamayan isabetin ayıklanması + imleç; kötü girdi veritabanına gitmeden 400; istek/ayar ayrıntısı + 404; workflow adım sırası ve özel promptun hiç görünmemesi; HTTP rotaları. MCP `remote.test.ts`: açık araç listesi 6, `search_content`/`get_content` anahtarsız çalışır. `npm test` ve MCP paketi geçti.

## BEKLEYEN KARAR (deploy'dan önce) — Kullanım Koşulları
`legal-content.ts` "Başkalarının içeriklerini kullanma ve atıf" bölümü izni yalnız **prompt'un başlığı, açıklaması ve metni** için verir (görsel/ses/video hariç). İstek, hazır ayar ve workflow'lar bu cümlede geçmiyor; CLAUDE.md §6 (Açık API + MCP, madde 5) kapsam değişirse metnin ÖNCE güncellenmesini ister. **Bu PR metne dokunmadı** (kapsamı genişletmek ürün/hukuk kararı, sahibi onaylamalı; `TERMS_VERSION` artırımı tüm kullanıcılara "Koşullar güncellendi" bandı gösterir). Önerilen ek (TR): «Aynı izin, herkese açık yayınlanan istek, hazır ayar ve workflow'ların başlığı, açıklaması ve metin/parametre alanları için de geçerlidir.» (EN): "The same permission applies to the title, description and text/parameter fields of requests, presets and workflows published publicly." Uygulanırsa `TERMS_VERSION`/`TERMS_EFFECTIVE_AT` birlikte artırılıp artırılmayacağı da sahibinin kararıdır. Hukuki danışmandan geçmedi.

## Bilinen sınırlar
- Yeni araçlar/rotalar canlıda denenmedi; PostgREST gömme sözdizimi (`workflow_steps(count)`, `*_tags(tags(...))`) sitenin kendi sorgularıyla ve canlı FK listesiyle (`workflow_steps_workflow_id_fkey`…) doğrulandı ama gerçek PostgREST'e karşı çalıştırılmadı.
- Hazır ayarın alan tanımları (tür, seçenekler) dönmez; yalnız seçili değerler. İstek görselleri/hazır ayar kapağı/workflow kapağı döndürülmez (medya yok — Koşullar'ın medya hükmü).
- Workflow adımlarındaki `inputs/outputs` ham JSON olarak geçer.
