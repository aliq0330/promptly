# 261 — Workflow ↔ Space bağlantısı: pano üzerinde akış diyagramı + workflow sayfasında Space önizlemesi

**Durum: uygulandı (repoda). Tek migration `20261001100000_space_workflow_flow.sql` (yalnızca ekleyici: 3 boolean sütun + 1 dizin, `drop` yok) — yerel PostgreSQL'de sınandı, `main`'e birleşince `deploy.yml` uygular; canlıya UYGULANMADI.**

## İstek
Workflow oluştururken en sonda "Space'te göster" seçeneği; Space içinden "Workflow aktar"; adımlar oklarla, girdi/çıktı ve mevcut içerik/ilişkilerle gösterilsin; bağ kurulduysa workflow sayfasında Space panosunun önizlemesi çıksın (Space herkese açıksa herkese). Önce mockup yapıldı, kullanıcı dört öneriyi onayladı ve "tamam, yap" dedi.

## Kararlar (kullanıcı onayladı)
1. **Workflow panoda ayrı bir çerçevedir** (Space'in diğer öğeleriyle yan yana; tek parça seçilir/taşınır/boyutlanır).
2. **Bir workflow birden fazla Space'e bağlanabilir**; workflow sayfasındaki önizleme varsayılan olarak **en yeni herkese açık** (arşivsiz) Space'i gösterir, okuyucu çiplerden başkasına geçer. Özel bir Space daha yeni olsa bile varsayılan olmaz.
3. **Düzenleme tek yerde**: panoda çerçeve taşınır/boyutlanır, katmanlar değişir ve panodan kaldırılır; **adımlar yalnız workflow'da düzenlenir**.
4. **İlk sürümde yalnız kendi yayınlanmış workflow'ların aktarılır** (başkasının workflow'u listelenmez).

## Mimari
- **Bağ yeni bir tablo değil**, Space'teki mevcut `space_items` satırıdır (`kind='content'`, `content_type='workflow'`, `content_id`) — `213-*`'ün "kopya değil başvuru" kuralı. Okuma `can_read_space`, yazma `can_edit_space`, kaynak okunabilirliği öğe tetikleyicisinde (değişmedi); aynı workflow aynı Space'e iki kez eklenemez (mevcut tekil dizin). Workflow değişince çerçeve de değişir (pano adımları workflow'dan canlı okur) — "bu andaki hâli dondur" seçeneği bilerek YOK.
- **Migration**: `space_items.flow_show_io / flow_show_links / flow_show_relations` (varsayılan `true`; çerçevede hangi katmanların çizileceği) + `space_items_content_idx` (workflow → Space araması). İstemci üç sütunu `server-errors.ts` `OPTIONAL_COLUMNS`'a ekledi (okuma sütunsuz yeniden denenir) ve yalnız workflow öğesi yazarken gönderir. **Not:** `space_items` yazımlarının geri-okuması (`ITEM_COLS`) bu sütunları seçtiği için migration uygulanmadan öğe EKLEME/GÜNCELLEME 400 verir (okuma çalışır) — `deploy.yml` önce migration'ı uyguladığı için sorun olmaz.
- **Saf yerleşim** `src/lib/workflow-flow-layout.ts` (birim testli): adımlar en çok 4'erli satırlara dizilir, ardışık adımlar okla bağlanır (satır sonunda dirsekli ok), her adımın altında içerik kartı, aynı satırdaki içerikler arasında ilişki yayı (satırlar arası ilişki kartın altında yazı olur). Çizen bileşen `workflow-flow-diagram.tsx` (salt okunur; kutuya ya da genişliğe ölçeklenir, çok küçülünce `lowDetail`).
- **Veri** `src/lib/supabase/workflow-flow.ts`: `fetchWorkflowFlow` (workflow + adımlar + adım içerikleri arasındaki `content_relations`, 2 dk önbellek, kaydedilince `invalidateWorkflowFlow`), `fetchWorkflowSpaceLinks` (okuyucunun OKUYABİLDİĞİ Space'ler; RLS).
- **Pano**: `board-item.tsx` workflow öğesini diyagram çizer (okunamazsa eski sade kart); araç çubuğu "Ekle → Workflow aktar" (`workflow-import-modal.tsx`: kendi yayınlanmış workflow'lar sayfalı, canlı önizleme, katman kutuları, "Panoda" / "zaten panoda", özel workflow uyarısı, boyut akıştan hesaplanır).
- **Form**: `workflow-space-field.tsx` — "Space'te göster" satırı (`FormDisclosure`; anahtar + Space seçimi + yeni Space [workflow adıyla, özel] + katmanlar + gizlilik notu). Karar **yayınlanınca** `applyWorkflowSpaceChoice` ile uygulanır (yeni öğe önce eklenir, eski bağ sonra silinir; aynı Space'te mevcut öğe yalnız güncellenir). Space adımı başarısız olursa workflow kaydedilmiştir, form yerinde kalır, "Paylaş" yeniden dener. Düzenlemede mevcut bağ önceden dolu gelir; taslakta kaydedilen workflow Space'e eklenmez.
- **Workflow sayfası**: `workflow-space-preview.tsx` — "Space panosu" bölümü: panonun KENDİ öğe bileşeniyle (`BoardItem`) gerçek konumlarında salt okunur mini pano. **Okunabilir Space yoksa bölüm HİÇ çizilmez** (özel Space'in varlığı ziyaretçiye sızmaz); gizli notlar önizlemeye hiçbir durumda girmez (üye bile görse). "Panoyu aç" → `/spaces/local?id=&tab=board&focus=<öğe>`.

## Doğrulama
- SQL `supabase/tests/space-workflow-flow.sql` (15): varsayılanlar, sahip/düzenleyici yazar, yabancı/ziyaretçi yazamaz, özel Space gizli, engel, bağlı Space araması (herkes yalnız okuyabildiğini görür), özel workflow'u yabancı okuyamaz, çift ekleme reddi. `spaces.sql` 59/59 aynı kaldı.
- Birim `workflow-flow-layout.test.ts` (11) + `npm test` 499/499 (`unbounded-queries` dahil).
- Playwright `run-workflow-space.mjs` (18): pano diyagramı (adım/ok/kart/ilişki), katman bayrakları, erişilemeyen workflow, aktarma (yalnız kendi, önizleme, katman → gönderilen satır, tekrar aktarılamaz, izleyici aktaramaz), sayfa önizlemesi (herkese açık / özel-ziyaretçi / özel-sahibi / çoklu Space + çip geçişi / ziyaretçi çipleri / bağ yok), gizli not sızmaz, form (Space seç + gizlilik notları + yayında öğe eklenir; mevcut bağ önceden dolu + kapatınca öğe silinir), İngilizce, telefonda taşma yok. Etkilenen paketler geçti: `run-spaces` 32/32, `run-detail-pages` 45/45, `run-create-destination` 16/16 (workflow formu artık `space` satırı da içeriyor), `run-community-posts` 36/36, `run-space-posts` 8/8, `run-space-comments` 10/10, `run-quotes` 12/12, `run-shared-cards` 11/11.
- `npx tsc --noEmit`, `npm run lint` (0 hata; var olan 10 uyarı), `npm run build` temiz.
- **İngilizce karşılıklar eklendi** (`wfSpace.*`, `translations-workflow-space.ts`).

## Bilinçli sınırlar / denenmedi
- Gerçek Supabase'e, gerçek oturuma, iOS Safari'ye / gerçek dokunmatik cihaza karşı denenmedi (arayüz ağ taklitli; sunucu kuralları yerel PostgreSQL'de).
- Telefonda önizleme çok küçülür (`lowDetail`: metin yerine bloklar); ayrıntı için "Panoyu aç".
- Adım içeriği yalnız prompt/istek (workflow adımlarında hazır ayar yok); bu yüzden çerçevede "hazır ayar kartı" yok.
- Satırlar arası (4'ten fazla adımda) ilişki yay olarak değil kartın altında yazı olarak gösterilir.
- Başkasının workflow'u aktarılamaz; `/share/workflow/` statik sayfası ve bildirimler değişmedi (Space'e workflow eklemek bildirim üretmez).
- Workflow silinirse Space'teki öğe "kaynak silindi" yer tutucusuna döner (mevcut `213-*` davranışı); önizleme workflow sayfasında olduğundan orada görünmez.

## Düzeltme (canlıda görülen hata)
İlk sürümde `fetchWorkflowSpaceLinks` `space_items` → `spaces` gömmesi (`spaces!inner(...)`) kullanıyordu. İki tablo arasında iki yabancı anahtar var (`space_items.space_id` ve `spaces.cover_item_id`), PostgREST gömmeyi belirsiz bulur (PGRST201) ve istek hata verir; kod hatada boş liste döndüğü için workflow sayfasında "Space panosu" hiç çıkmıyordu (pano çerçevesi çalışıyordu). Ağ taklidi bu belirsizliği modellemediği için testler yakalamadı. Düzeltme: iki ayrı okuma (önce `space_items`, sonra `spaces` `id in (…)`); `run-workflow-space` artık `spaces!` gömmesi içeren her isteği hata sayar. Kural: `space_items` ile `spaces` arasında PostgREST gömmesi kullanma.
