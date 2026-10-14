# 9.164 — Workflow adım adım çalıştırma modu

Durum: uygulandı (kod; `main`'e birleşince yayınlanır). Veritabanı değişikliği yok.

## Ne

Herkese açık workflow detayında, adımların altında **Akış | Adım adım** sekmesi (ve başlıkta "Adım adım çalıştır" düğmesi; `?run=1` doğrudan bu modda açar). Promptly **model çalıştırmaz** (CLAUDE.md Bölüm 1): kişi her adımın prompt'unu kendi aracında çalıştırır, sonucu adımın "sonuç" kutusuna yapıştırır; o sonuç, ona bağlanmış sonraki adımların **girdisi olarak** yeniden karşısına çıkar. Böylece akış gerçekten "çıktı → girdi" olarak yürür ama sahte bir çalıştırma yoktur.

## Davranış

- Üstte ilerleme çubuğu (`role=progressbar`, "N / M adım tamamlandı"), numaralı adım gezgini (tamamlananlar işaretli, `aria-current="step"`), Önceki/Sonraki, son adımda "Özeti gör".
- Adım paneli: başlık, açıklama, "Bu adımda ne yapılacak?" (adımın talimatı), **girdiler** (önceki adıma bağlı olan: yapıştırılmış değer + Kopyala, yapıştırılmamışsa "Adım N'in çıktısını henüz yapıştırmadın" + o adıma git; bağlı olmayan: yazılabilir alan), **prompt** (bağlı prompt, değişken alanlarıyla — prompt detayındaki `PromptVariableInputs` + `effectiveVariableValues` + `resolvePromptText` yeniden kullanıldı; Kopyala, "AI aracında çalıştır", "Studio'da aç", içeriği aç), **sonuç** alanları (adımın her çıktısı için), "Tamamlandı olarak işaretle".
- Prompt kopyalama/çalıştırma, mevcut kullanım sayacına (`record_prompt_copy`, docs/160) yazılır (oturumlu, günde bir) — yeni sayım yolu yok.
- Özet: yapıştırılan tüm sonuçlar adım sırasıyla + Kopyala; "Baştan başla" iki tıklamalı (onaylı) ve her şeyi siler.
- Girdi/sonuç metni **yalnızca bu tarayıcı oturumunda** (`sessionStorage`, `promptly-workflow-run:<id>`) tutulur, hiçbir yere gönderilmez; sayfa yenilenince durur. Kaydedilmiş durum, workflow sonradan değişmişse artık var olmayan adım/girdi/çıktı kimliklerinden temizlenir (`sanitizeRunState`).
- Eski "istek" adımı: istek bağlantısı gösterilir (çalıştırılacak prompt yok); içerik silinmiş/erişilemezse mevcut metinler gösterilir.

## Parçalar

`lib/workflow-run.ts` (saf durum: `resolveInput` bağlı/kendi girdi, `missingLinkedInputs`, `runProgress`, `collectResults`, `sanitizeRunState`; 9 birim testi), `features/workflows/workflow-runner.tsx`, `workflow-view.tsx` (sekme + düğme + `?run=1`). Metinler `workflow.run.*` (TR+EN).

## Etki alanı taraması

Yalnızca herkese açık detay sayfasına eklendi; **düzenleyici, akış görünümü (`WorkflowFlow`), kartlar, Odak/liste görünümleri DEĞİŞMEDİ** (akış sekmesi önceki görünümün aynısı). Kartlardan doğrudan çalıştırma düğmesi bilerek yok (`?run=1` bağlantısı hazır). Bağlı olmayan girdiyi bir prompt değişkenine otomatik eşleme yok (kişi kopyalayıp yapıştırır).

## Doğrulama

Birim: 225 test. Tarayıcı (Playwright, sahte Supabase, 12 senaryo): akış varsayılan ve bozulmadı, başlatma/ilerleme/talimat/değişkenli prompt metni, değişken yazınca canlı güncelleme, çıktı → sonraki adımda girdi, yapıştırılmamış bağ uyarısı, tamamlandı + yenilemede durumun korunması, özet + onaylı sıfırlama, oturumlu kopyalamada tam 1 `record_prompt_copy`, TR metinler, `?run=1`, Akış'a dönüş, 360px'te yatay taşma yok. Gerçek Supabase'e karşı gerçek içerikle DENENMEDİ; istek-adımı yolu tarayıcıda ayrıca sınanmadı.
