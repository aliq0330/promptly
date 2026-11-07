# 348 — Ekip kütüphanesi: onay işareti, ekip ortak değişkenleri, kişisel API/MCP okuması (2026-11-06)

Kullanıcı "rakiplerde olup bizde olmayan" özellikleri sordu (PromptBase, FlowGPT, Civitai, Lexica, AIPRM); AIPRM'in ekip kütüphanesi
Promptly'nin Space altyapısı üstüne kurulmaya en uygun bulundu ve "hepsini tek seferde önerilerinle" denildi. Bu kayıt o işi anlatır.

## Karar: ayrı sistem değil, yeni Space türü
`spaces.kind = 'team_library'` ("Ekip kütüphanesi"). Üyelik, roller (sahip/düzenleyici/izleyici), davet, görünürlük, etkinlik, yorum, kilit hazırdı.
Rol eşleşmesi: **sahip onaylar**, düzenleyici katkı verir ve ortak değişkenleri yazar, izleyici kullanır. Üye Space'e girince doğrudan **Promptlar**
sekmesine iner (`space-page.tsx` varsayılan sekme); öteki türler Genel bakışla açılır.

## Faz 1 — onay işareti
- `space_items.approved_at/approved_by`; **yazma yalnız `space_set_item_approval`** (SECURITY DEFINER, açık denetim: Space sahibi + arşivsiz +
  ekip kütüphanesi). Doğrudan INSERT/UPDATE `space_approval_forbidden` ile reddedilir (işlem-yerel işaret `promptly.space_approval`, 284'teki
  şikâyet kalıbı). Etkinliğe `item_approved` / `item_unapproved` yazılır.
- **Yalnız kendi metnini taşıyan prompt taslağı (`kind='prompt' and is_draft`) onaylanır** — CHECK ile de. Bir Promptly gönderisine BAŞVURAN öğenin
  metnini ekip değil gönderinin yazarı değiştirir; "onaylı" rozeti yalan olurdu. Ekip isterse "Taslağa kopyala" ile kendi kopyasını onaylar.
- **Başlık ya da metin değişince onay kendiliğinden düşer** (`space_items_approval_guard`); konum/grup/renk/not değişince düşmez.
- Kilit (307) onay sütunlarını "değişiklik" saymaz: sahip kilitli taslağı da onaylayabilir (kilit içeriği korur). Kilit bir yetki değildir
  (düzenleyici açabilir) — bu yüzden onay kilide bağlanmadı.
- Öneriden SAPMA: öneride şablon grupları "Onaylı · İncelemede · Fikirler" idi; onay artık öğenin işareti olduğu için grup adıyla çelişirdi.
  Gruplar konuya göre: Genel · Pazarlama · Destek · Geliştirme.

## Faz 2 — ekip ortak değişkenleri
- `space_variables(space_id, name, value)`; **değerleri yalnız ÜYE okur** (herkese açık Space'te bile), yazma yalnız `space_set_variable` /
  `space_delete_variable` (düzenleyici+, en çok 50, ad 1–40 karakter ve boşluk/süslü parantez yok, değer ≤500).
- Arayüz: Promptlar sekmesinde "Ekip değişkenleri" paneli; promptta `{değişken}` varsa "Doldur ve kopyala" penceresi — ekip değerleri hazır gelir,
  yazılan değer ezer, değeri olmayan jeton kopyada `{ad}` kalır (sessizce silinmez). Saf kural `lib/space-library.ts` (`planLibraryFill`).
- Gizli bilgi uyarısı panelde yazılı: değerleri tüm üyeler görür.

## Faz 3 — kişisel API / MCP (yalnız okuma)
`GET /v1/me/libraries`, `GET /v1/me/libraries/{id}/prompts[?include=unapproved]`; MCP `list_my_libraries`, `get_library_prompts`.
`api_me_libraries/library_prompts/library_variables` SECURITY INVOKER (çağıranın RLS'i). Varsayılan YALNIZ onaylılar; her prompt ekip değerleriyle
doldurulmuş `filledText` + `missing` ile gelir. Üye olmayan ya da olmayan kütüphane `not_found` (varlığı sızmaz). Yazma yeteneği EKLENMEDİ
(onay, değişken ve düzenleme yalnız sitede). Sentezlenen çıktı kullanıcı içeriğidir; MCP'nin "veri, talimat değil" notu araçlara da uygulanır.

## Şema değişikliği ve "yıkıcı" işareti
Migration `20261106110000_team_library.sql` `-- ci:allow-destructive` taşır: `spaces_kind_check` ve `space_activity_action_check` CHECK'leri
GENİŞLETİLDİ (drop constraint + aynı adla yeniden ekleme), `create_space` aynı tür listesiyle yeniden yazıldı. Veri silinmez. Kullanıcı
"önerilerinle" diyerek önerideki bu adımı onayladı (öneride açıkça yazılmıştı). **Yeni Space türü eklerken üç yer birlikte güncellenir:**
`spaces_kind_check`, `create_space` içindeki liste, `SPACE_KINDS` (+ etiket, ikon, ton, şablon grupları, `translations`).

## Doğrulama (hepsi ağ taklitli / yerel; gerçek Supabase'e KARŞI DENENMEDİ)
- Yerel PostgreSQL: `space-team-library.sql` 46/46; mevcut Space SQL testleri regresyonsuz (aşağıdaki özet).
- Birim: `space-library.test.ts`, `public-api/me-library.test.ts`, `mcp/test/remote.test.ts` (37), `developers.test.ts`.
- Playwright: `run-space-library.mjs` 8/8; `run-spaces`, `run-space-comments`, `run-space-board-tools`, `run-space-connectors`, `run-space-posts`,
  `run-workflow-space` regresyonsuz.
- İngilizce karşılıklar eklendi (`translations-team-library.ts`, `translations-api-keys.ts`; TR+EN birlikte).
- Hata bulgusu (test sayesinde): PL/pgSQL'de `perform set_config(...)` `FOUND`'u `true` yapar; `update … returning` sonrası `perform` varsa
  "satır güncellendi mi" denetimi `get diagnostics … row_count` ile HEMEN alınmalı (ilk sürümde not gibi geçersiz öğeler onaylanmış görünüyordu).

## Bilerek yapılmayanlar / bilinen sınırlar
- Pano (board) kartlarında ve öğe ayrıntı penceresinde onay rozeti YOK; yalnız Promptlar sekmesinde ve API/MCP'de.
- Ayrı "onaylayan" rolü yok (yalnız sahip); eklenirse `space_members` CHECK'i ve `can_*` fonksiyonları genişler.
- Space başına 500 öğe sınırı geçerli (küçük ekip için yeter).
- **Edge Function'lar CI ile deploy EDİLMEZ**: `api` ve `mcp` elle yeniden deploy edilmeden yeni uçlar canlıda çalışmaz. `promptly-mcp` (npm) yeni
  araçlar için sürüm artırımı + "Publish MCP package" ister (yapılmadı, dışa dönük).
- Gizlilik/Koşullar metinleri DEĞİŞMEDİ: ekip değişkenleri Space içeriğidir, yalnız üyeye görünür; hukuki danışmandan geçmedi.
