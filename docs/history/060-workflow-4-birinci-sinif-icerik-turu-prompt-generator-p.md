### 9.60 Workflow, 4. birinci sınıf içerik türü (Prompt / Generator / Prompt İsteği / Workflow)

Workflow artık `/workflows` altında kendine özgü bir kartla duran ayrı bir
özellik değil; Prompt, Generator ve Prompt İsteği ile aynı mimariyi
paylaşıyor. Yeni paralel sistem yazılmadı — mevcut ortak katmanlar
`workflow` hedefiyle genişletildi.
- **Kart:** `WorkflowCard`, `ContentCard` + `PostHeader` (yazar, zaman, üç nokta
  menüsü) + tür satırı + başlık/açıklama + "adım özeti" paneli + araç çipleri +
  `PromptCardFooter` (Beğeni · Yorum · Kaydet · Paylaş) ailesinde. `/workflows`,
  Ana Sayfa, Keşfet, arama, profil ve koleksiyon aynı CSS masonry'yi kullanır.
- **Akış:** `FeedItem` union'ına `workflow` üyesi eklendi; `RealWorkflowsProvider`
  (`RealGeneratorsProvider` ile aynı şekil) Ana Sayfa (Sana Özel / Popüler /
  Takip Ettiklerim + tür çipi) ve Keşfet ("Workflow'lar" sekmesi) için tek
  paylaşılan önbellek. Workflow, Keşfet'te içerik türü filtresine, zincirlediği
  türlerden biri eşleşirse girer (ortak taksonomide kategori/alt kategorisi yok).
- **Arama:** mevcut gelişmiş arama; `ContentKind`'a `workflow` eklendi, yeni
  `searchWorkflows` (başlık/açıklama, yazar, tür, araç, sıralama) ve ayrı bir
  "Workflow'lar" sonuç bölümü. Workflow'un etiketi olmadığından etiket çipi
  workflow sonucu döndürmez.
- **Kaydet:** `SaveButton`/`SaveToCollectionModal`/`useSaveState`/`collections.ts`
  `workflow` içerik türünü destekliyor; workflow, prompt ve generator ile aynı
  koleksiyonlara girer, koleksiyon detayında ve Profil → Kaydedilenler'de görünür.
- **Paylaş:** `ShareModal` `workflow` hedefi; "Promptly'de mesaj olarak gönder"
  `messages` şemasına yeni sütun EKLEMEDEN, generator'ın deseniyle
  (`workflow-share-format.ts`: başlık + gerçek link, render anında
  `SharedWorkflowCard`'a çevrilir; `?shareWorkflowId=`).
- **Detay (`/workflows/local`):** Prompt detay sayfasıyla aynı kabuk: üç nokta
  menüsü (Düzenle/Sil/Bağlantıyı kopyala), Beğeni · Yorum · Kaydet · Paylaş
  çubuğu, `#comments` yorum bölümü (`?hl=comment:` vurgusu dahil). Adım listesi
  ve girdi/çıktı bağlantıları içerik bölümünde korundu.
- **Backend:** `20260919480000_workflow_social.sql` — `prompt_likes`,
  `prompt_comments`, `collection_items` tablolarına nullable `workflow_id`
  (+ "tam olarak bir hedef" CHECK'leri, kısmi unique index'ler),
  `workflows.like_count/comment_count` ve `SECURITY DEFINER` sayaç
  trigger'ları, yorum RLS'i, `remove_workflow_from_saved_everywhere` RPC'si,
  mevcut `notifications` ile beğeni/yorum/yanıt bildirimleri (yeni tip yok,
  `hl=` hedefli), workflow silinince bildirim temizliği. Mevcut prompt/
  generator/istek/sonuç trigger'ları aynı şekilde korundu.
- **i18n:** tüm yeni metinler `{tr,en}` (`messages.*Workflow`, `workflow.view`,
  `notifMsg.likedWorkflow/commentedWorkflow`); bildirim metinleri
  `notification-message.ts` ile İngilizceye yerelleşir.
- **Doğrulama:** tsc/lint/build temiz; ağ taklitli Playwright ile Ana Sayfa kartı
  (yazar başlığı, menü, kaydet, paylaş), tür çipi, paylaşım modalı, Keşfet sekmesi,
  detay sayfası, ve giriş yapmış oturumda beğeni/kaydet/yorum isteklerinin
  `workflow_id` taşıdığı doğrulandı. Gerçek Supabase'e karşı canlı test yapılamadı.
- **Etiketler:** `20260919490000_workflow_tags.sql` — `workflow_tags` (prompt/
  generator ile aynı join deseni, mevcut `tags` kataloğu ve `TagPicker`/
  `useTagPicker`). Editörde etiket seçici, kartta `ContentTags`, detayda etiket
  linkleri, aramada etiket çipi workflow'larda da çalışır.
- **Migration'lar canlı projeye uygulandı** (`workflow_social`, `workflow_tags`;
  sütunlar, sayaçlar, trigger'lar ve tablo canlıda doğrulandı).
- **Bilinen sınırlamalar:** etiket sayfası (`/tags/local`) workflow'ları
  listelemiyor (generator'lar da yok); workflow için ayrı düzenleme
  geçmişi/öneri sistemi yok.
