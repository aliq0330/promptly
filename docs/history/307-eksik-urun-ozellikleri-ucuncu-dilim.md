# 307 — Eksik ürün özellikleri: üçüncü dilim (Workflow aktarma, Kanıtlanmış sıralaması, haftalık özet, Space nesne kilidi)

**Durum:** uygulandı (kod + 5 migration repoda; **canlıya UYGULANMADI**). `tsc` temiz, lint 0 hata, `npm test` 688/688, yerel PostgreSQL 16'da yeni SQL testleri `FAILED=0`
(`import-workflows` 13, `feed-page-proven` 9, `weekly-digest` 7, `space-item-lock` 10), ağ taklitli Playwright (`run-exchange` 45/45, `run-feed-filters` 18/18, `run-space-board-tools` 15/15, `run-search-notifications` 17/17, `run-spaces` 32/32); migration denetimi temiz.
**Gerçek Supabase'e / gerçek cihaza karşı denenmedi.** İngilizce karşılıklar eklendi (aşağıda anahtar grupları).

## Yapılanlar
- **Workflow dışa/içe aktarma** (migration `20261101200000_import_workflows.sql`, `import_workflows`): 306'daki İstek/Hazır ayar ile AYNI ilkeler (INVOKER, önce doğrula sonra tek işlemde yaz, hep ÖZEL TASLAK, yazar/durum/görünürlük/sayaç dosyadan alınmaz,
  yinelenme yazarın aynı başlık+açıklaması, ≤30). Adımlar prompt'a **başvurur, kopyalamaz** (workflow modelinin ilkesi): dosyada `prompt: { id, title }` taşınır, prompt metni ASLA; içe aktarırken başvuru yalnız içe aktaran o promptu
  RLS ile okuyabiliyorsa VE prompt yayında + herkese açık + topluluksuz + silinmemişse bağlanır, aksi hâlde adım BOŞ gelir (`prompt_unavailable` uyarısı). Dışa aktarma da yalnız bu koşulu sağlayan promptun kimliğini/başlığını yazar
  (özel promptun başlığı dosyaya sızmaz). Adımlar dosya içi anahtarlara (`s1…`) çevrilir; bağlantı (`inputs[].source`) yalnız ÖNCEKİ adımın VAR olan çıktısından kurulabilir; ≤30 adım, adım başına ≤10 giriş/çıkış. Grafik mevcut `save_workflow_graph` ile yazılır
  (sürüm geçmişi açılmaz — oluşturma bir düzenleme değildir). Çekirdek `lib/exchange/content-format.ts` (`promptly.workflows`), veri katmanı `prompt-exchange.ts` (`fetchOwnWorkflowsForExport`: 25'erli workflow parçaları, sayfalı adım okuması, 100'erli prompt kimliği), arayüz `content-exchange-modals.tsx` ("İçeriklerim → Workflow'lar → İçe/Dışa aktar").
- **Kanıtlanmış sıralaması** (migration `20261101210000_feed_page_proven.sql`, `feed_page_proven`): Keşfet → Promptlar → Sıralama "Kanıtlanmış". `feed_page`'e DOKUNULMADI (221 kuralı); ayrı, küçük, yalnız Prompt döndüren RPC: "Çalıştı" oylarının Wilson alt sınırı (%95) × 1 000 000, en az 5 oy
  (`WORKS_MIN_VOTES` ile aynı eşik), `feed_page`'in prompt koluyla aynı görünürlük koşulları, aynı çıktı biçimi ve aynı keyset üçlüsü (`sort_rank, created_at, id` azalan). Tür/kategori/araç süzgeçleri taşınır. Ziyaretçiye açık (INVOKER, RLS atlanmaz).
  İstemci: `FeedOrder` `proven`, Keşfet sıralama `most-proven` (yalnız Promptlar bölümünde; diğer bölüme geçince Önerilen'e düşer). **Oy verisi yeni birikiyor**: ilk günlerde liste kısa/boş olabilir — bu doğrudur, uydurma sıralama yok.
- **Haftalık özet — UYGULAMA İÇİ** (migration `20261101220000_weekly_digest.sql`, `dispatch_my_weekly_digest`): uygulama açılışında (etkinlik hatırlatmasıyla aynı kalıp) haftada en çok bir bildirim: "Haftalık özet: 12 kopyalama, 3 tepki, 1 yorum, 2 yeni takipçi." — sayılar YALNIZ `creator_insights_summary(7)`'den
  (kendi eylemin sayılmaz); hareket yoksa bildirim yazılmaz ama hafta kayda geçer. "Gönderildi" bilgisi bildirim satırında DEĞİL `weekly_digest_sent` tablosundadır (303'teki "silinen bildirim geri geliyor" sorunu bu yüzden olmaz). Bildirim `/insights`'a gider; `notification-message.ts` İngilizceye sayıları koruyarak çevirir.
  **E-posta ve web push YAPILMADI**: dış servis (e-posta sağlayıcısı / VAPID) + gizli anahtar gerekir ve sitenin "service worker yok" kararı (CLAUDE.md §2) ile çelişir; bu bildirim aynı verinin site içi hâlidir.
- **Space nesne kilidi** (migration `20261101230000_space_item_lock.sql`): `space_items.locked`. Kilitli nesne taşınamaz, boyutlanamaz, düzenlenemez, silinemez. **Sunucu kuralıdır** (`space_items_lock_guard` tetikleyicisi): eski satır kilitliyse `locked` dışındaki (ve `updated_at/updated_by` dışındaki)
  GERÇEK her değişiklik `space_item_locked` ile reddedilir; toplu `space_save_layout` aynı değeri yeniden yazarsa sorun çıkmaz; kilidi açarken başka alan da değişiyorsa reddedilir; kaskad silmeler (Space/hesap silinirken, `pg_trigger_depth() > 1`) kilitten etkilenmez. Kilidi açıp kapatmak `can_edit_space`
  (sahip/düzenleyici) ister — kilit bir YETKİ değil güvenlik ağıdır. Arayüz: seçim çubuğunda Kilitle/Kilidi aç (hepsi kilitliyse aç, değilse hepsini kilitle), kilitli nesnede rozet, boyut tutamacı yok, sürükleme/ok tuşu/hizalama/öne-getirme (`commitLayout` tek geçit) kilitliyi atlar, Delete kilitliyi atlar ve söyler.
  `locked` isteğe bağlı sütundur (`OPTIONAL_COLUMNS`): migration'dan önce de pano açılır.

## Çeviri anahtarları (TR+EN eklendi)
`exchange.issue.invalid_steps|invalid_connection|too_many_steps`, `exchange.field.steps`, `exchange.import.warning.prompt_unavailable`, `exchange.content.*.workflow`, `discover.sortProven`, `notifMsg.weeklyDigest|weeklyCopies|weeklyReactions|weeklyComments|weeklySaves|weeklyFollowers`, `spaces.board.lock|unlock|locked|lockedSkipped`, `spaces.error.itemLocked`.

## YAPILMAYANLAR (ve nedeni)
- **E-posta / web push (haftalık özet, etkinlik hatırlatması):** dış servis + gizli anahtar; service worker kararı. Yapılabilecek tek şey site içi özet (yapıldı).
- **Sohbette çevrimiçi durumu:** Realtime Presence + bir gizlilik ayarı (kim görür, varsayılan ne) ister; Presence protokolü ağ taklidinde (`realtime-hub.mjs`) yok, yani yazılsa bile bu ortamda sınanamaz. Sınanamayan gerçek zamanlı kodu yayına vermemeyi seçtim.
- **"X katıldı" sistem satırları:** yeni bir mesaj türü (şema, `can_read_message`, önizleme, sayaç, bildirim kuralları) ve 100 000 üyeli toplulukta ölçek (258 kuralı) ister; ayrı tasarım.
- **Space serbest çizim, nesne yorumu, gerçek zamanlı ortak düzenleme:** serbest çizim yeni nesne türü + tuval aracı + `orphan` kuralları; nesne yorumu 8 hedefli yorum/beğeni zincirine dokunur (CLAUDE.md §6 uyarısı); gerçek zamanlı birleştirme Space'in "son kayıt kazanır" kayıt modelini değiştirir. Her biri tek başına bir iş.
