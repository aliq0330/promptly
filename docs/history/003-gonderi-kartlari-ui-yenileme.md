### 9.3 Gönderi Kartları UI Yenileme

Kullanıcının referans görsellerle (Lavender Studio diliyle uyumlu, üstte
kullanıcı başlığı + kebab menü, remix/istek bağlamları için lavanta kutu,
altta "Kullanılan prompt" kutusu) verdiği detaylı tasarım isteği üzerine,
normal/remix/istek-yanıtı gönderi kartlarının tamamı tek bir ortak bileşen
ailesi etrafında yeniden tasarlandı — üç ayrı kart sistemi değil, aynı
`ImagePromptCard`/`TextPromptCard`'ın paylaştığı yeni alt bileşenler:

- **`features/prompts/post-header.tsx`** (yeni) — her kartın üstünde
  avatar + görünen ad + göreli zaman (+ yanıt ise " · Yanıt paylaştı") +
  üç nokta menüsü. Yazar bilgisi daha önce kart FOOTER'ındaydı (bkz. Bölüm
  14); artık başa taşındı — `PromptCardFooter` yalnızca etkileşim
  ikonlarını (beğeni/yorum/remix/kaydet/paylaş) içeriyor. Şemada
  "doğrulanmış kullanıcı" kavramı hiç yok (`profiles` tablosunda böyle bir
  kolon yok) — referans görseldeki mavi tik bilinçli olarak eklenmedi
  (CLAUDE.md'nin "backend'de olmayanı çalışıyormuş gibi gösterme" kuralı).
- **`features/prompts/post-menu.tsx`** (yeni, eski `ProfileContentMenu`'nun
  yerine geçti ve profil galerisiyle sınırlı kalmaktan çıkıp HER karta
  taşındı) — herkese "Bağlantıyı kopyala"; yalnızca gönderinin gerçek
  sahibine (`useAuth()` ile karşılaştırılıyor) ek olarak "Kopyasını
  oluştur" ve gerçek, kalıcı "Sil" (iki tıklamalı onay). Başkasının
  gönderisinde rapor/engelle gibi seçenekler YOK — bu özellik (Bölüm 22)
  henüz hiç yazılmadı, sahte bir menü öğesi eklenmedi.
- **`features/prompts/post-context.tsx`** (yeni) — `RemixContext` ve
  `RequestResponseContext`: kart başlığının hemen altında, gönderinin
  kendi başlığından önce gösterilen lavanta, sol mor şeritli kutular.
  Eskiden yalnızca düz metin bir bağlantı olan `RemixSourceLink`'in
  (silindi) yerini aldı — artık kaynağın gerçek küçük önizlemesini
  (remix: küçük görsel + başlık + yazar), isteğin gerçek durumunu (Açık/
  Kapandı rozeti, `request-card.tsx`'in `STATUS_LABELS`/`STATUS_VARIANTS`'ı
  paylaşılarak) ve seçiliyse "Bu yanıt seçildi" etiketini gösteriyor — bu
  üçüncüsü, aynı fetch'ten bedavaya geldiği için Bölüm 21 Faz 3'ten beri
  bilinen "kartın kendisi seçili yanıtı göstermiyor" sınırlamasını da
  kapattı (yalnızca istek detay sayfasında gösterilmeye devam etmiyor,
  artık her yerde).
- **`features/prompts/prompt-preview-box.tsx`** (yeni) — her kartta aynı
  "Kullanılan prompt" kutusu (terminal ikonu + kısaltılmış prompt metni +
  "Promptun tamamını gör" bağlantısı); önceden yalnızca metin/video/kod/
  müzik kartlarında vardı, artık görsel kartlarda da var, ve iki ayrı
  kopya yerine tek bir bileşen.
- Medya artık kartın kendi kenarına değil (üstte artık başlık olduğundan),
  kart içinde `px-4` ile içeri çekilmiş, kendi `rounded-md` köşeleri olan
  bir blok — referans görsellerdeki "yuvarlatılmış, hafif lavanta yüzeyli"
  görünüm bunun doğal sonucu.
- **`profile-content-grid.tsx`** sadeleşti: eskiden kartın üzerine
  `position: absolute` ile bindirilen ayrı bir `ProfileContentMenu`
  overlay'i vardı (yalnızca kendi profilinde); artık menü kartın kendi
  başlığının parçası olduğundan grid yalnızca `onDeleted`'i doğrudan
  `PromptCard`'a geçiyor.
- `prompt-detail-view.tsx` de aynı context kutularını kullanacak şekilde
  güncellendi (kendi ayrı `isSelectedAnswer` state/effect'i silindi — artık
  gereksiz, kutu bunu kendi başına hesaplıyor) ve başlığın yanına aynı
  `PostMenu` eklendi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Statik export
`npx serve` ile (GitHub Pages basePath'i taklit eden bir symlink
düzeniyle) yerel olarak sunulup, Supabase REST uç noktaları ağ seviyesinde
taklit edilerek Playwright ile gerçek bir tarayıcıda test edildi: normal/
remix/istek-yanıtı kartlarının üçü de masaüstü+mobil × açık+koyu tema
kombinasyonlarının tamamında doğru render edildi (context kutuları, rozet,
"Kullanılan prompt" kutusu, footer aksiyonları); kod içerik türü kartı
medyasız doğru çalıştı; kendi profilindeki kart menüsü gerçekten
"Bağlantıyı kopyala / Kopyasını oluştur / Sil" gösterdi; remix zinciri ve
yorum bölümü dahil detay sayfaları bozulmadı — hepsi sıfır JS hatasıyla.
Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 21'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Kart menüsünde başkasının gönderisi için rapor/engelle seçeneği yok
  (Bölüm 22 henüz yazılmadı).
- "Doğrulanmış kullanıcı" rozeti eklenmedi (şemada karşılığı yok).
- Kart menüsünden silme, yalnızca profil galerisinde `onDeleted` ile listeyi
  günceller; feed/keşfet gibi diğer bağlamlarda kendi gönderini silersen
  DB'den gerçekten silinir ama o sayfadaki kart yenileme yapılmadan
  kaybolmaz (sayfa yenilenince görünür) — düşük öncelikli, kozmetik.
- `RequestCard` (bir isteğin kendisini temsil eden kart, bir yanıtı değil)
  bu görevin kapsamında değildi, dokunulmadı.
