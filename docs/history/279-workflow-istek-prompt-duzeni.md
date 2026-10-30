# 279 — Workflow ve İstek sayfaları prompt sayfasıyla aynı düzende

278'deki prompt sayfası sadeleştirmesi (kullanıcı onayladı) Workflow ve Prompt İsteği detay sayfalarına da uygulandı.

- **İlişki Haritası** eylem satırından çıktı: Hakkında kartında "İlişki haritasını aç" satırı (`RelationMapRow`) + ⋮ menüsünde (`RelationMapMenu`; sayfanın kendi ve üstteki sayfanın ekstra satırlarını korur). Prompt sayfası da aynı bileşeni kullanır.
- **Workflow kapağı** prompt çıktısı gibi: görselin kendi oranı (`clampedAspectRatio`, boyut yoksa 16:9), `StorageImage` / `StorageImg` (signed URL; düz `<img>` kalktı), bant arka planı aynı görselden.
- **Workflow yan sütunu**: kartta zaten görünen araçları tekrarlayan "Araçlar" bölümü ve gövdedeki tür çipi + adım sayısı satırı kaldırıldı (adım sayısı ve tür "Bilgi" bölümünde duruyor).
- İstek sayfasında kapak zaten aynı bileşenlerle çiziliyordu; yalnız İlişki Haritası taşındı.

Yalnız istemci kodu, migration yok. Çeviri: `relations.open` (278) yeniden kullanıldı. Kapsam dışı: Hazır ayar sayfası (İlişki Haritası eylem satırında hiç yoktu), kartlardan detaya geçiş animasyonu (yalnız prompt'ta var; workflow/istek kartlarına bağlanmadı), kapakta kayıtlı ortalama renk (workflow/istek medyasında `dominant_color` yok).
Gerçek Supabase'e / telefona karşı denenmedi; ağ taklitli `run-detail-pages` 47/47 (yeni 2d senaryoları), `run-workflow-space`, `run-preset-try`, `run-quotes`, `run-community-posts`, `run-reactions` geçti.
