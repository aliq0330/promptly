/**
 * Ekip dosyası ⇄ pano ve ekibe özgü içerik (docs/history/376-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamFileItemsTranslations`).
 * Kullanıcı içeriği (proje/dosya/pano adı, içerik başlığı) çevrilmez.
 */
export const teamFileItemsTranslations = {
  // --- Sunucu hataları ---
  "error.teamContentNotShareable": { tr: "Ekibe özgü içerik beğenilemez, kaydedilemez ya da paylaşılamaz; dosyasında yaşar.", en: "Team-only content can't be liked, saved or shared; it lives in its file." },
  "error.teamContentImmutable": { tr: "Ekibe özgü içeriğin dosyası sonradan değiştirilemez.", en: "The file of team-only content can't be changed afterwards." },

  // --- İçerik seçme penceresi ---
  "tf.pick.title.prompt": { tr: "Prompt seç", en: "Pick a prompt" },
  "tf.pick.title.request": { tr: "İstek seç", en: "Pick a request" },
  "tf.pick.title.workflow": { tr: "Workflow seç", en: "Pick a workflow" },
  "tf.pick.title.preset": { tr: "Ayar paketi seç", en: "Pick a preset" },
  "tf.pick.tab.mine": { tr: "Paylaştıklarım", en: "My shares" },
  "tf.pick.tab.others": { tr: "Başkalarının paylaştıkları", en: "Shared by others" },
  "tf.pick.search": { tr: "Ara, kişi, etiket ya da araç ekle", en: "Search, add a person, tag or tool" },
  "tf.pick.filter": { tr: "Filtre", en: "Filter" },
  "tf.pick.add": { tr: "Ekle", en: "Add" },
  "tf.pick.added": { tr: "Eklendi", en: "Added" },
  "tf.pick.done": { tr: "Bitti", en: "Done" },
  "tf.pick.empty.mine": { tr: "Bu türde henüz paylaştığın bir şey yok. Aramayı ya da filtreyi değiştir.", en: "You haven't shared anything of this kind yet. Change the search or filter." },
  "tf.pick.empty.others": { tr: "Sonuç bulunamadı. Aramayı ya da filtreyi değiştir.", en: "No results. Change the search or filter." },

  // --- Ekip dosyasından oluşturma ---
  "tf.create.destination": { tr: "Ekip dosyasına ekle", en: "Add to the team file" },
  "tf.create.hint": { tr: "İçerik yalnız bu projeyi görenlere görünür; akışta, aramada ve profilde yer almaz.", en: "The content is visible only to people who can see this project; it does not appear in feeds, search or profiles." },
  "tf.create.summary": { tr: "{{path}} dosyasına eklenecek. Normal akışta paylaşılmaz.", en: "Will be added to {{path}}. It is not shared in the regular feed." },
  "tf.create.withBoard": { tr: "{{path}} · {{board}} panosunda da gösterilir", en: "{{path}} · also shown on the {{board}} board" },
  "tf.create.confirm": { tr: "Dosyaya ekle", en: "Add to file" },
  "tf.create.failedAttach": { tr: "İçerik oluşturuldu ama dosyaya eklenemedi. Tekrar dene.", en: "The content was created but couldn't be added to the file. Try again." },

  // --- Ekle: dosyada ve panoda aynı satırlar ---
  "tf.add.create.prompt": { tr: "Prompt oluştur", en: "Create a prompt" },
  "tf.add.createHint.prompt": { tr: "Yeni bir prompt yaz; yalnız bu dosyaya eklenir", en: "Write a new prompt; it is added to this file only" },
  "tf.add.pick.prompt": { tr: "Prompt seç", en: "Pick a prompt" },
  "tf.add.pickHint.prompt": { tr: "Paylaşılmış bir prompt'u bu dosyaya ekle", en: "Add a shared prompt to this file" },
  "tf.add.create.request": { tr: "İstek oluştur", en: "Create a request" },
  "tf.add.createHint.request": { tr: "Yeni bir istek yaz; yalnız bu dosyaya eklenir", en: "Write a new request; it is added to this file only" },
  "tf.add.pick.request": { tr: "İstek seç", en: "Pick a request" },
  "tf.add.pickHint.request": { tr: "Paylaşılmış bir isteği bu dosyaya ekle", en: "Add a shared request to this file" },
  "tf.add.create.workflow": { tr: "Workflow oluştur", en: "Create a workflow" },
  "tf.add.createHint.workflow": { tr: "Yeni bir workflow kur; yalnız bu dosyaya eklenir", en: "Build a new workflow; it is added to this file only" },
  "tf.add.pick.workflow": { tr: "Workflow seç", en: "Pick a workflow" },
  "tf.add.pickHint.workflow": { tr: "Paylaşılmış bir workflow'u bu dosyaya ekle", en: "Add a shared workflow to this file" },
  "tf.add.create.preset": { tr: "Ayar paketi oluştur", en: "Create a preset" },
  "tf.add.createHint.preset": { tr: "Yeni bir ayar paketi kur; yalnız bu dosyaya eklenir", en: "Build a new preset; it is added to this file only" },
  "tf.add.pick.preset": { tr: "Ayar paketi seç", en: "Pick a preset" },
  "tf.add.pickHint.preset": { tr: "Paylaşılmış bir ayar paketini bu dosyaya ekle", en: "Add a shared preset to this file" },

  // --- Pano: kaldır ≠ dosyadan sil ---
  "tf.board.removeFromBoard": { tr: "Panodan kaldır", en: "Remove from board" },
  "tf.board.deleteFromFile": { tr: "Dosyadan sil", en: "Delete from file" },
  "tf.board.deleteFromFileTitle": { tr: "{{count}} öğe dosyadan silinsin mi?", en: "Delete {{count}} items from the file?" },
  "tf.board.deleteFromFileBody": { tr: "Öğe dosyadan ve tüm panolardan kalkar; geri alınamaz. Yalnız bu panodan kaldırmak için \"Panodan kaldır\" de.", en: "The item is removed from the file and from every board, and this can't be undone. To only take it off this board, choose \"Remove from board\"." },
  "tf.board.fileDeleted": { tr: "{{count}} öğe dosyadan silindi.", en: "{{count}} items deleted from the file." },

  // --- Öğe çekmecesi / Panoya ekle ---
  "tf.item.boards": { tr: "Panolarda", en: "On boards" },
  "tf.item.noBoards": { tr: "Hiçbir panoda gösterilmiyor", en: "Not shown on any board" },
  "tf.item.removeTitle": { tr: "Panodan kaldırılsın mı?", en: "Remove from this board?" },
  "tf.item.removeBody": { tr: "\"{{title}}\" yalnız bu panodan kalkar; dosyada ve öteki panolarda durur.", en: "\"{{title}}\" is removed from this board only; it stays in the file and on other boards." },
  "tf.item.deleteBodyFile": { tr: "\"{{title}}\" dosyadan ve tüm panolardan silinecek. Bu işlem geri alınamaz.", en: "\"{{title}}\" will be deleted from the file and from every board. This can't be undone." },
  "tf.addToBoard.note": { tr: "Öğe dosyada kalır; pano onu yalnız gösterir. Aynı öğe birden çok panoda görünebilir.", en: "The item stays in the file; a board only shows it. The same item can appear on several boards." },
  "tf.addToBoard.already": { tr: "Bu panoda zaten gösteriliyor", en: "Already shown on this board" },
  "tf.board.expandWorkflow": { tr: "Adımlara aç", en: "Open into steps" },
} as const;
