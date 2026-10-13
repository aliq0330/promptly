### 9.47 Test sayfası geri eklendi: üç akışı tek yerden test etme

Bölüm 9.45'in kaldırdığı `/dev/image-analysis-test` sayfası, kullanıcının
açık isteği üzerine YENİDEN eklendi — ama artık eski, tek modlu (yalnızca
ham `analyze-image` çağrısı yapan) hâliyle değil, üç akışın (Generator
Builder / Prompt Builder / Prompt İsteği) hepsini tek sayfadan test
edebilecek şekilde genişletilmiş olarak.

**Sayfa 4 sekmeden oluşuyor:**
- İlk üç sekme (**Generator Builder**/**Prompt Builder**/**Prompt
  İsteği**), üretim formlarının (`CreatePromptForm`/`CreateRequestForm`/
  `GeneratorVisionAssist`) KULLANDIĞI BİREBİR AYNI fonksiyonları çağırıyor
  (`analyzeImageForGenerator`/`analyzeImageForPrompt`/
  `analyzeImageForRequest`, `src/lib/supabase/image-analysis.ts`) — yani
  buradaki sonuç (Bölüm 9.46'nın eklediği `validateModeShape` doğrulaması
  dahil) gerçek sitedeki davranışla birebir aynı. Generator Builder sekmesi,
  test için gerçek bir generator oluşturmaya gerek kalmadan düzenlenebilir
  bir JSON bağlam (generator adı/açıklaması/kategorisi + alan listesi)
  alıyor, sayfa açılışında örnek, gerçekçi bir varsayılanla dolu geliyor.
- Dördüncü sekme (**"Ham İstek — Edge Function"**) bu sarmalayıcıları
  TAMAMEN atlayıp Edge Function'a doğrudan `{ mode, context, image,
  mimeType }` gönderip HAM cevabı (hiçbir şekil doğrulaması olmadan)
  gösteriyor — Edge Function'ın deploy edilmiş sürümünün eski (mode'suz)
  mi yoksa yeni (mode farkındalıklı) mi olduğunu bu sekmede net olarak
  görmek mümkün; Bölüm 9.46'nın kök neden hipotezini (Edge Function henüz
  yeniden deploy edilmemiş olabilir) doğrudan test edebilecek en hızlı yol
  bu sekme.

**Bilinçli olarak eski sayfadan farklı olan kısımlar:** eski sayfa
yalnızca ham response gösteriyordu (tek mod); yenisi hem sarmalanmış
(validate edilmiş, kategorize edilmiş hatalı) sonucu HEM ham response'u
ayrı ayrı gösterebiliyor. Kurallar aynı kaldı: görsel Storage'a hiç
yüklenmiyor, yalnızca Base64'e çevrilip Edge Function'a gönderiliyor;
hiçbir API key burada yok, yalnızca projenin mevcut public anon key'li
Supabase client'ı kullanılıyor.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (placeholder Supabase env ile, 26 statik rota — yeni `/dev/
image-analysis-test` dahil) sıfır hatayla geçti. Gerçek bir Gemini/
Supabase çağrısı bu sandbox'ta yine hiç test edilemedi (Bölüm 17'den beri
tekrarlanan aynı ağ kısıtı) — kullanıcının bu sayfayı canlı sitede
ziyaret edip (`/dev/image-analysis-test`) dördüncü sekmeyle Edge
Function'ın gerçekte ne döndürdüğünü görmesi gerekiyor.

**Bilinen sınırlamalar:** Bu, önceki sayfalarla aynı bilinçli "geçici test
sayfası" kategorisinde — üretime kalıcı bir özellik olarak sunulmuyor,
istenirse (Bölüm 9.45'te olduğu gibi) sonradan güvenle kaldırılabilir;
proje genelinde başka hiçbir yerden import edilmiyor.
