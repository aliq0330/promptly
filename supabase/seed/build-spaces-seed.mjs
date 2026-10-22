// Promptly Spaces demo seed'i (docs/history/213-*). Çıktı: supabase/seed/spaces-demo.sql
// Kullanım: node supabase/seed/build-spaces-seed.mjs
//
// Kurallar: yalnızca INSERT/UPDATE (silme yok); her satırın kimliği `md5('seed-…')::uuid` olduğu için betik tekrar
// çalıştırılabilir (on conflict do nothing). Çıktı tek bir DO bloğudur: veri JSON, mantık bir kez (bütün Space'ler tek işlemde). Space'lere eklenen içerik KOPYALANMAZ: mevcut herkese açık promptların ve
// görsellerin kimliğine başvurulur (gerçek `prompt_media`). "Görsellerden çıkarılan renkler" paleti, görsellerin kayıtlı
// baskın renklerinden (`prompt_media.dominant_color`) üretilir — uydurma değil. Elle yazılan paletler tema renkleridir (manual).
import { writeFileSync } from "node:fs";

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const BASE = "x.community_id is null and x.visibility = 'public' and x.status = 'published' and x.deleted_at is null";
const tagAny = (tags) => `exists (select 1 from public.prompt_tags t where t.prompt_id = x.id and t.tag_slug = any(array[${tags.map(q).join(",")}]))`;
const cat = (cats) => `x.category = any(array[${cats.map(q).join(",")}])`;
const type = (t) => `x.content_type = ${q(t)}`;
const or = (...p) => `(${p.join(" or ")})`;
const GROUP_COLORS = ["primary", "secondary", "success", "warning", "danger", "neutral"];

/** @typedef {{t:string,b:string,c?:string,priv?:boolean}} Note */
const SPACES = [
  {
    key: "retro", owner: "melis", title: "Retro Poster Koleksiyonu", kind: "moodboard", visibility: "public", age: 34, touched: 2,
    description: "70'ler ve 80'lerden esinlenen afişler: kalın tipografi, sınırlı renk paleti ve cesur kompozisyonlar.",
    sel: or(tagAny(["retro", "typography", "composition", "minimalist"]), cat(["design"])), images: 12, prompts: 6,
    groups: ["Tipografi", "Renk şemaları", "Düzen fikirleri"],
    palettes: [
      { name: "Sıcak retro", description: "Turuncu-hardal ağırlıklı, krem zemin.", colors: ["#e4572e", "#f3a712", "#ede0c8", "#2b4162", "#17301c"] },
      { name: "Okul posteri", description: "Soluk lacivert, kırık beyaz ve tuğla kırmızısı.", colors: ["#1d3557", "#f1faee", "#e63946", "#a8dadc", "#457b9d"] },
    ],
    imgNotes: ["Başlıktaki harf aralığı çok iyi, aynısını denemeliyim.", "Zemin dokusu kâğıt gibi — grain eklemek yeterli.", "Üç renkle bu kadar etkili olabilir mi?"],
    promptNotes: ["Poster serisinin ortak şablonu olabilir.", "{konu} değişkeni her afişte değişecek."],
    draft: { t: "Retro konser afişi şablonu", b: "Retro bir konser afişi: {grup_adı} için kalın sans-serif başlık, turuncu ve hardal tonları, kırık beyaz kâğıt dokusu, hafif baskı kayması, merkezde geometrik güneş motifi, 3:4 dikey kadraj, ayrıntılı ama sade." },
    notes: [
      { t: "Seri için kurallar", b: "• En çok 3 ana renk\n• Başlık her zaman kalın ve büyük\n• Kâğıt dokusu + hafif baskı kayması\n• Her afişte tek bir odak noktası", c: "primary" },
      { t: "Basılı örnekler", b: "Kütüphanede gördüğüm 70'ler konser afişlerinde ortak nokta: yazı görselin bir parçası gibi duruyor, üstüne yapıştırılmış gibi değil.", c: "secondary" },
      { t: "Sıradaki deneme", b: "Aynı şablonu 'bilim fuarı' ve 'film festivali' için de dene; renkleri tek tek değiştirip yan yana koy.", c: "success" },
      { t: "Özel: yayın planı", b: "Seriyi Cuma günü paylaşmak istiyorum — önce 6 afiş seçilecek, kalanlar arşive.", c: "warning", priv: true },
    ],
  },
  {
    key: "fantasy", owner: "can", title: "Fantastik Dünya Karakterleri", kind: "character", visibility: "public", age: 30, touched: 5,
    description: "Bir fantastik roman serisi için ana karakterler, yardımcı roller ve yaratıklar; tutarlı yüz ve kostüm referansları.",
    sel: tagAny(["karakter-tasarimi", "fantastik"]), images: 12, prompts: 6,
    groups: ["Ana karakterler", "Yardımcı roller", "Yaratıklar"],
    members: [{ u: "aliq", role: "editor" }, { u: "melis", role: "viewer" }],
    palettes: [
      { name: "Orman kraliçesi", description: "Zümrüt, eski altın ve gece mavisi.", colors: ["#1b4332", "#52b788", "#d4a017", "#1d3557", "#f1e3c6"] },
      { name: "Gölge sarayı", description: "Mor-siyah ağırlıklı soğuk palet.", colors: ["#240046", "#5a189a", "#9d4edd", "#c8b6ff", "#10002b"] },
    ],
    imgNotes: ["Kostüm silueti net — yan karakterlerde de bu oranı koruyalım.", "Yüz hatları tutarlı kalıyor, seed'i not al.", "Zırhın omuz parçası çok ayırt edici."],
    promptNotes: ["Karakter sayfası için temel prompt.", "Yaratık varyasyonlarında bu bloğu kullan."],
    draft: { t: "Karakter sayfası taslağı", b: "Fantastik roman karakteri, tam boy ön-yan-arka görünüm, nötr gri zemin, {kıyafet} giyen {yaş} yaşında {ırk}, detaylı kostüm yapısı, tutarlı yüz, dengeli ışık, karakter sayfası düzeni, 3 poz." },
    notes: [
      { t: "Karakter bible", b: "Her karakter için: yaş, silüet, imza renk, bir kusur, bir sır. Görseller bu sırayla Gruplar'a eklenecek.", c: "primary" },
      { t: "Tutarlılık ipucu", b: "Aynı yüz için: aynı prompt gövdesi + sadece kıyafet ve poz değişkenleri. Seed sabit tutulursa daha iyi.", c: "secondary" },
      { t: "Yaratık listesi", b: "1) Bataklık bekçisi\n2) Taş kanatlı kartal\n3) Gece tilkisi\n4) Sis ruhu", c: "success" },
      { t: "Özel: bölüm taslağı", b: "3. bölümde Gölge sarayı sahnesi var, mor palet orada devreye girecek.", c: "danger", priv: true },
    ],
  },
  {
    key: "render3d", owner: "mehmet", title: "3B Ürün Render Rehberi", kind: "brand", visibility: "public", age: 27, touched: 9,
    description: "Temiz arka plan, doku ve ışık odaklı 3B ürün görselleri için çalışan promptlar ve referanslar.",
    sel: or(tagAny(["3d-render", "texture", "clean-background"]), cat(["product_commercial"])), images: 12, prompts: 6,
    groups: ["Işık kurulumları", "Malzeme / doku", "Kompozisyon"],
    members: [{ u: "aliq", role: "viewer" }],
    contentCats: { workflow: ["design", "style"], preset: ["product_commercial", "design"] },
    palettes: [
      { name: "Stüdyo nötr", description: "Ürün çekimi için sakin, nötr zeminler.", colors: ["#f4f1ea", "#d9d4c7", "#8a8578", "#3a3a3a", "#111111"] },
      { name: "Vurgu renkleri", description: "Ürün başına tek vurgu rengi.", colors: ["#ff6b35", "#00a6a6", "#6a4c93", "#ffca3a"] },
    ],
    imgNotes: ["Yumuşak ışık + hafif yansıma: ürün yüzeyi çok iyi okunuyor.", "Zemin gölgesi burada daha doğal.", "Doku haritası fikri: pürüzlü metal."],
    promptNotes: ["Ürün render'ının ana şablonu bu.", "Zemin rengi değişkeni marka paletinden gelecek."],
    draft: { t: "Ürün render şablonu", b: "{ürün} için stüdyo ürün render'ı, {zemin_rengi} sonsuz zemin, yumuşak softbox ışığı, hafif yansıma, ürün odakta, keskin ayrıntı, gerçekçi malzeme, 1:1 kare." },
    notes: [
      { t: "Işık kuralı", b: "Anahtar ışık 45°, dolgu ışığı %30, arkadan kenar ışığı ince bir hat bırakmalı. Gölge sertliği ürünün malzemesine göre ayarlanır.", c: "primary" },
      { t: "Malzeme listesi", b: "Mat plastik · fırçalı metal · cam · seramik · deri. Her biri için ayrı doku satırı tut.", c: "secondary" },
      { t: "Teslim ölçüleri", b: "E-ticaret: 1:1 ve 4:5. Kapak: 16:9. Arka plan şeffaf istenirse ayrı çıktı al.", c: "success" },
      { t: "Özel: müşteri notu", b: "Müşteri parlak yüzeyleri istemiyor; mat varyantları öne çıkar.", c: "warning", priv: true },
    ],
  },
  {
    key: "minimalbrand", owner: "ceren", title: "Minimalist Marka Kimliği", kind: "brand", visibility: "private", age: 21, touched: 1,
    description: "Yeni bir kafe markası için logo, tipografi ve ambalaj yönü. Ekip içi çalışma alanı.",
    sel: or(tagAny(["minimalist", "typography", "clean-background"]), cat(["design", "style"])), images: 8, prompts: 4,
    groups: ["Logo yönleri", "Ambalaj", "Sosyal medya"],
    members: [{ u: "onur", role: "editor" }, { u: "zeynep", role: "viewer" }],
    invites: [{ u: "aliq", role: "editor" }],
    palettes: [
      { name: "Kafe ana palet", description: "Kahve, krem ve adaçayı yeşili.", colors: ["#3e2c23", "#c9a66b", "#f6efe3", "#8a9a5b", "#1f1b16"] },
    ],
    imgNotes: ["Logo çok sade; küçük boyutta da okunuyor.", "Ambalaj üzerinde ince çizgi tipografisi iyi duruyor."],
    promptNotes: ["Logo denemelerinin ortak başlangıcı.", "Menü kartı için uyarlanacak."],
    draft: { t: "Kafe logosu denemesi", b: "Minimalist bir kafe logosu, tek renk, {sembol} ve ince sans-serif yazı, bol boşluk, dairesel yerleşim, vektör çizim hissi, beyaz zemin." },
    notes: [
      { t: "Marka sesi", b: "Sakin, samimi, hafif esprili. Logo da aynı tonda: gösterişsiz ama akılda kalıcı.", c: "primary" },
      { t: "Görev dağılımı", b: "Ceren: logo yönleri\nOnur: ambalaj\nZeynep: sosyal medya şablonları (görüntüleme)", c: "secondary" },
      { t: "Toplantı özeti", b: "Cuma günü 3 logo yönü sunulacak. Her yön için 1 ambalaj ve 1 sosyal medya örneği hazır olmalı.", c: "warning" },
    ],
  },
  {
    key: "cyber", owner: "onur", title: "Siberpunk Şehir Atmosferi", kind: "game_world", visibility: "public", age: 25, touched: 4,
    description: "Yağmurlu neon sokaklar, uzay istasyonları ve soyut fütüristik mimari için ilham ve prompt koleksiyonu.",
    sel: or(tagAny(["siberpunk", "neon", "surreal", "uzay", "soyut"]), tagAny(["fantastik"])), images: 10, prompts: 5,
    groups: ["Sokaklar", "Neon ve ışık", "İstasyon / iç mekân"],
    palettes: [
      { name: "Neon gece", description: "Macenta, turkuaz ve koyu mor.", colors: ["#0b0c1e", "#ff2e97", "#00e5ff", "#7b2cbf", "#f9f871"] },
      { name: "Yağmurlu asfalt", description: "Islak zemin yansımaları.", colors: ["#1b1f2a", "#3a4560", "#7a8fb0", "#c3cfe2"] },
    ],
    imgNotes: ["Yağmur yansımaları çok iyi, zemin ıslak görünüyor.", "Neon tabelalardaki harfler okunabilir değil ama doğal duruyor."],
    promptNotes: ["Sahne açılış planı için bu bloğu kullan.", "Uzay istasyonu iç mekânına uyarlanacak."],
    draft: { t: "Yağmurlu neon sokak", b: "Gece yağmurlu siberpunk sokak, {renk} neon tabelalar, ıslak asfaltta yansımalar, buhar yükselen bacalar, uzakta devasa hologram reklam, sinematik geniş açı, yüksek kontrast, 21:9." },
    notes: [
      { t: "Dünya kuralları", b: "Güneş hiç görünmüyor. Işık kaynakları: neon, ekranlar, yağmurun içinden geçen farlar. Gökyüzü hep kapalı.", c: "primary" },
      { t: "Mekân listesi", b: "1) Yağmur sokağı\n2) Çatı pazarı\n3) Yörünge istasyonu\n4) Yeraltı tren hattı", c: "secondary" },
      { t: "Ses atmosferi", b: "Yağmur, uzaktan siren, tabela vızıltısı. Selin'in müzik panosuyla eşleştirilebilir.", c: "success" },
      { t: "Özel: oyun fikri", b: "Keşif ağırlıklı oyun: oyuncu her bölgede bir tabela çözüyor.", c: "danger", priv: true },
    ],
  },
  {
    key: "nature", owner: "zeynep", title: "Doğa ve Altın Saat", kind: "moodboard", visibility: "public", age: 19, touched: 3,
    description: "Gün batımı, sis ve manzara fotoğraflarında kullandığım ışık ve renk referansları.",
    sel: or(tagAny(["manzara", "golden-hour"]), cat(["nature_environment"])), images: 8, prompts: 4,
    groups: ["Gün batımı", "Sis ve bulut", "Detay çekimler"],
    contentCats: { workflow: ["nature_environment", "photography"], preset: ["nature_environment", "photography"] },
    palettes: [
      { name: "Altın saat", description: "Sıcak sarı, şeftali ve derin mavi gölge.", colors: ["#ffb347", "#ff8c5a", "#fbe7c6", "#355c7d", "#2a3a4a"] },
      { name: "Sisli sabah", description: "Gri-yeşil, yumuşak kontrast.", colors: ["#cfd8d3", "#9fb6a8", "#5c7a6b", "#2f4538"] },
    ],
    imgNotes: ["Işık tam ufukta; gölgeler uzun ve sıcak.", "Sisin içinden gelen ışın çok doğal."],
    promptNotes: ["Manzara için temel prompt.", "Saat değişkenini 'gün doğumu' ile de dene."],
    draft: { t: "Altın saat manzara", b: "{yer} üzerinde altın saat, alçak güneş ışığı, uzun gölgeler, hafif sis, geniş açı manzara fotoğrafı, doğal renkler, ön planda {nesne}, 3:2 yatay." },
    notes: [
      { t: "Işık günlüğü", b: "Altın saat: gün batımından önceki 45 dk. En iyi sonuç: güneş kadrajın dışında ama ışığı kenardan vuruyor.", c: "primary" },
      { t: "Renk notu", b: "Sıcak ışık + soğuk gölge = derinlik. Gölgeyi maviye çekmeyi unutma.", c: "secondary" },
      { t: "Çekim listesi", b: "Sahil · orman kenarı · göl · yaylalar", c: "success" },
    ],
  },
  {
    key: "skycity", owner: "baran", title: "Oyun Dünyası: Gökyüzü Şehri", kind: "game_world", visibility: "link", age: 17, touched: 6,
    description: "Bulutların üstündeki yüzen şehirler için mimari, karakter ve atmosfer referansları. Bağlantı paylaşımı için hazır.",
    sel: or(tagAny(["fantastik", "surreal", "uzay", "mimari"]), cat(["spaces"])), images: 10, prompts: 5,
    groups: ["Şehir silueti", "Köprüler ve ulaşım", "Sakinler"],
    members: [{ u: "kaan", role: "editor" }],
    palettes: [
      { name: "Gün ışığı", description: "Açık mavi, krem ve bulut gri.", colors: ["#a8d8ea", "#fff6e5", "#c7ceea", "#ffb7b2", "#6d8ea0"] },
    ],
    imgNotes: ["Şehir silueti iyi; köprüler biraz daha ince olabilir.", "Bulut katmanları arası derinlik çok iyi."],
    promptNotes: ["Ana şehir panoraması.", "Gece versiyonu için renkleri tersine çevir."],
    draft: { t: "Gökyüzü şehri panorama", b: "Bulutların üzerinde yüzen şehir, {mimari_stil} yapılar, asma köprüler, uçan gemiler, gün doğumu ışığı, derinlik katmanları, geniş panoramik kadraj, ayrıntılı fantastik illüstrasyon." },
    notes: [
      { t: "Bölgeler", b: "Üst katman: yönetim sarayı\nOrta: pazar ve atölyeler\nAlt: rüzgâr bahçeleri", c: "primary" },
      { t: "Ulaşım", b: "Halat arabaları, küçük uçan gemiler ve rüzgâr kuşları. Halat arabaları ana motif olsun.", c: "secondary" },
      { t: "Paylaşım planı", b: "Bağlantıyı oyun ekibiyle paylaşacağım; kaan düzenleyebiliyor.", c: "warning" },
    ],
  },
  {
    key: "interior", owner: "kaan", title: "İç Mekân ve Mimari İlhamları", kind: "interior", visibility: "public", age: 15, touched: 8,
    description: "Sıcak ışıklı salonlar, ahşap detaylar ve modern mimari cepheler. Ev renovasyonu projesi için panolar.",
    sel: or(cat(["spaces"]), tagAny(["mimari", "architecture", "lighting"])), images: 8, prompts: 5,
    groups: ["Salon", "Mutfak ve yemek", "Cephe"],
    members: [{ u: "selin", role: "viewer" }],
    palettes: [
      { name: "Sıcak ahşap", description: "Ceviz, krem ve terracotta.", colors: ["#6b4226", "#d9b99b", "#f3e9dc", "#c8553d", "#2f2f2f"] },
      { name: "Skandinav", description: "Açık gri, beyaz ve ince siyah detay.", colors: ["#f5f5f4", "#d6d3d1", "#a8a29e", "#292524"] },
    ],
    imgNotes: ["Ahşap dokusu ile ışık birlikte çalışıyor.", "Pencere ışığı çok doğal; yapay ışık eklenmemiş."],
    promptNotes: ["Salon görselleştirmesi için ana şablon.", "Mutfak versiyonunu bu yapıyla üret."],
    draft: { t: "Salon görselleştirme", b: "{stil} salon iç mekân, büyük pencereden gelen doğal ışık, ceviz ahşap zemin, {renk} kanepe, bitkiler, mimari fotoğraf, geniş açı, gerçekçi malzeme, 3:2." },
    notes: [
      { t: "Proje hedefi", b: "70 m² daire: salon + mutfak açık plan. Doğal ışık ve sıcak malzeme öncelikli.", c: "primary" },
      { t: "Malzeme listesi", b: "Ceviz kaplama · beton görünümlü tezgâh · keten perde · pirinç detay", c: "secondary" },
      { t: "Bütçe notu", b: "Önce ışık ve perde; mobilya sonra. Görsellerden ışık düzenini çıkar.", c: "success" },
      { t: "Özel: usta görüşmesi", b: "Pazartesi 14:00 — ahşap kaplama ölçüsü için.", c: "warning", priv: true },
    ],
  },
  {
    key: "music", owner: "selin", title: "Müzik Kapakları ve Ses Atmosferi", kind: "free", visibility: "public", age: 14, touched: 12,
    description: "Albüm kapağı fikirleri, müzik üretim promptları ve ortam sesi referansları bir arada.",
    sel: or(type("audio"), tagAny(["muzik-uretim"])), images: 10, prompts: 8,
    groups: ["Albüm kapakları", "Müzik promptları", "Ses atmosferi"],
    contentCats: { workflow: ["music"], preset: ["music"], request: ["music"] },
    palettes: [
      { name: "Vinil gece", description: "Koyu mavi, bordo ve altın.", colors: ["#0d1b2a", "#8b1e3f", "#e0a96d", "#f2e9dc"] },
    ],
    imgNotes: ["Kapak görseli parçanın ritmini yansıtıyor.", "Tipografi küçültülünce de okunuyor."],
    promptNotes: ["Lo-fi albüm için temel müzik promptu.", "Aynı tarifin enstrümantal versiyonu."],
    draft: { t: "Lo-fi albüm kapağı", b: "Lo-fi albüm kapağı: yağmurlu pencere önünde {nesne}, sıcak lamba ışığı, hafif tane (grain), pastel renkler, merkezde ince sans-serif başlık, kare kadraj." },
    notes: [
      { t: "Albüm konsepti", b: "'Gece yarısı kafe' temalı 8 parçalık lo-fi albüm. Her parça için bir kapak varyasyonu.", c: "primary" },
      { t: "Parça listesi", b: "1) Yağmur öncesi\n2) Son tramvay\n3) Açık pencere\n4) Çay demleme\n5) Sokak lambası…", c: "secondary" },
      { t: "Mix notları", b: "Bas çok hafif, vinil çıtırtısı %8, parçalar arası 2 sn boşluk.", c: "success" },
    ],
  },
  {
    key: "adv", owner: "emre", title: "Reklam Filmi Fikirleri", kind: "free", visibility: "private", age: 12, touched: 7,
    description: "Kısa reklam filmleri için video promptları, storyboard görselleri ve çekim notları.",
    sel: or(type("video"), cat(["advertising", "cinematic"])), images: 10, prompts: 8,
    groups: ["Açılış planları", "Ürün çekimleri", "Kapanış / slogan"],
    members: [{ u: "burak", role: "viewer" }],
    palettes: [
      { name: "Marka mavisi", description: "Kampanya ana renkleri.", colors: ["#0b3d91", "#1e88e5", "#e3f2fd", "#ff7043"] },
    ],
    imgNotes: ["Açılış planı için doğru enerji.", "Ürün bu açıdan çok net."],
    promptNotes: ["15 sn'lik reklam için çerçeve.", "Kapanışta logo animasyonuna bağla."],
    draft: { t: "15 sn ürün reklamı", b: "15 saniyelik ürün reklamı, 3 plan: (1) {mekan}'da yavaş sürüklenen kamera, (2) ürün yakın plan, (3) logo ve slogan. Sinematik renk, hafif lens parlaması, 16:9." },
    notes: [
      { t: "Brief özeti", b: "Hedef kitle: 25-35 yaş, şehirli. Ton: enerjik ama samimi. Süre: 15 sn + 6 sn kesilmiş versiyon.", c: "primary" },
      { t: "Çekim sırası", b: "Önce kapanış planı (logo için temiz zemin), sonra ürün, en son açılış.", c: "secondary" },
      { t: "Özel: bütçe", b: "Stok müzik yerine kendi müziğimizi kullanırsak maliyet %20 düşer.", c: "warning", priv: true },
    ],
  },
  {
    key: "anime", owner: "ipek", title: "Anime Karakter Stüdyosu", kind: "character", visibility: "public", age: 11, touched: 10,
    description: "Anime estetiğinde karakter tasarımı: ifade sayfaları, kostüm varyasyonları ve renk paletleri.",
    sel: or(tagAny(["anime", "animation"]), tagAny(["karakter-tasarimi"])), images: 10, prompts: 5,
    groups: ["İfadeler", "Kostüm varyasyonları", "Arka plan"],
    members: [{ u: "deniz", role: "viewer" }],
    palettes: [
      { name: "Sakura", description: "Pembe-mor pastel.", colors: ["#ffd6e0", "#ffb3c6", "#cdb4db", "#a2d2ff", "#fefae0"] },
    ],
    imgNotes: ["Göz çizimi çok net — ifade sayfası için temel.", "Saç ışığı (rim light) çok iyi."],
    promptNotes: ["İfade sayfası şablonu.", "Kostüm varyasyonları için {kıyafet} değişkeni."],
    draft: { t: "Anime ifade sayfası", b: "Anime kız karakter ifade sayfası, 6 ifade (mutlu, şaşkın, utangaç, kızgın, üzgün, düşünceli), aynı yüz ve saç, temiz çizgiler, beyaz zemin, pastel gölgeleme." },
    notes: [
      { t: "Karakter: Mio", b: "16 yaş, lise öğrencisi, hafif utangaç. İmza: mavi saç tokası ve sarı atkı.", c: "primary" },
      { t: "İfade listesi", b: "Mutlu · şaşkın · utangaç · kızgın · üzgün · düşünceli · uykulu · gururlu", c: "secondary" },
      { t: "Çizim ipucu", b: "Gözler büyükse ağız küçük tutulmalı; ifade ağırlığı kaşlarda.", c: "success" },
    ],
  },
  {
    key: "writing", owner: "deniz", title: "Yazı Atölyesi Notları", kind: "free", visibility: "public", age: 9, touched: 11,
    description: "Hikâye, şiir ve içerik yazarlığı için kullandığım promptlar, haftalık yazı alıştırmaları ve notlar.",
    sel: tagAny(["yazarlik", "siir"]), images: 0, prompts: 10,
    groups: ["Hikâye", "Şiir", "İçerik yazarlığı"],
    palettes: [
      { name: "Kâğıt ve mürekkep", description: "Not defteri havası.", colors: ["#fdf6e3", "#eee8d5", "#586e75", "#073642", "#b58900"] },
    ],
    promptNotes: ["Hikâye açılışı için çok işe yarıyor.", "Şiir için dize sayısı değişkenini kullan."],
    draft: { t: "Haftalık yazı alıştırması", b: "Bana {tema} temalı, {sözcük_sayısı} sözcüklük kısa bir hikâye öner: güçlü bir ilk cümle, tek bir dönüm noktası ve sürpriz bir son. Önce üç alternatif başlık ver." },
    notes: [
      { t: "Haftalık plan", b: "Pzt: hikâye açılışı\nÇar: şiir\nCum: içerik yazısı\nPaz: gözden geçirme", c: "primary" },
      { t: "Üslup notu", b: "Kısa cümle, somut görüntü, sıfat az. Soyut kavramı bir nesneyle anlat.", c: "secondary" },
      { t: "Kitap listesi", b: "Yazma sanatı üzerine okunacaklar: 3 kitap seçildi, her biri için 1 sayfalık not çıkaracağım.", c: "success" },
      { t: "Özel: günlük", b: "Bu hafta yazmaya 20 dk ayırabildim; hedef 30 dk.", c: "warning", priv: true },
    ],
  },
  {
    key: "portrait", owner: "ece", title: "Portre ve Işık Çalışması", kind: "moodboard", visibility: "public", age: 8, touched: 14,
    description: "Stüdyo ve doğal ışıkla portre: editoryal kompozisyon, ışık yönleri ve cilt tonu referansları.",
    sel: or(tagAny(["portre", "lighting", "studio-lighting", "editorial-photography", "photography"]), cat(["photography", "human_character"])), images: 10, prompts: 5,
    groups: ["Işık yönleri", "Kompozisyon", "Renk / ton"],
    invites: [{ u: "aliq", role: "viewer" }],
    palettes: [
      { name: "Cilt tonları", description: "Retuş sırasında referans alınan tonlar.", colors: ["#f6d5c1", "#e8b796", "#c68b67", "#8d5a3b", "#4a2c1b"] },
      { name: "Editoryal zemin", description: "Portre arka planları.", colors: ["#e7e2dc", "#a39e93", "#3d3a36", "#1b1a19"] },
    ],
    imgNotes: ["Rembrandt ışığı çok net.", "Gölge tarafı kontrollü — dolgu ışığı çok az."],
    promptNotes: ["Stüdyo portresi için ana şablon.", "Doğal ışık versiyonu için pencere ışığını ekle."],
    draft: { t: "Editoryal portre", b: "{yaş} yaşında {kişi} editoryal portre, tek softbox 45° yandan, hafif gölge, nötr gri zemin, 85mm lens, sığ alan derinliği, doğal cilt dokusu, 4:5 dikey." },
    notes: [
      { t: "Işık şemaları", b: "Rembrandt · loop · kelebek · split. Her biri için kısa bir not ve en iyi örnek görsel bu panoda.", c: "primary" },
      { t: "Cilt tonu", b: "Retuşta tonları paletle karşılaştır; kırmızıya kayma çoğunlukla fazla sıcak ışıktan geliyor.", c: "secondary" },
      { t: "Çekim günü", b: "Cumartesi: 3 model, 2 arka plan, toplam 4 saat.", c: "success" },
    ],
  },
  {
    key: "coding", owner: "burak", title: "Kodlama Prompt Kitaplığı", kind: "free", visibility: "private", age: 6, touched: 15,
    description: "Hata ayıklama, kod gözden geçirme ve dokümantasyon için denenmiş prompt şablonlarım.",
    sel: or(cat(["coding", "research"]), tagAny(["kodlama"])), images: 0, prompts: 8,
    groups: ["Hata ayıklama", "Kod gözden geçirme", "Dokümantasyon"],
    palettes: [],
    promptNotes: ["PR açıklamasını bununla yazdırıyorum.", "Hata mesajını olduğu gibi yapıştır."],
    draft: { t: "Hata ayıklama şablonu", b: "Aşağıdaki hata mesajını ve kodu incele. Önce olası 3 nedeni olasılık sırasıyla listele, sonra en olası neden için minimal bir düzeltme öner ve neden işe yaradığını tek paragrafta açıkla.\n\nHata: {hata}\nKod: {kod}" },
    notes: [
      { t: "Kural", b: "Her prompta: bağlam + beklenen çıktı + kısıt. 'Tek dosyada kal', 'bağımlılık ekleme' gibi kısıtlar sonucu iyileştiriyor.", c: "primary" },
      { t: "Denenecek", b: "Kod gözden geçirme için kontrol listesi formatı: güvenlik, performans, okunabilirlik.", c: "secondary" },
    ],
  },
  {
    key: "writing2", owner: "elif", title: "Yaratıcı Yazarlık Tohumları", kind: "free", visibility: "public", age: 5, touched: 16,
    description: "Hikâye fikirleri, karakter tohumları ve ilk cümle denemeleri.",
    sel: or(cat(["writing", "education"]), tagAny(["yazarlik"])), images: 0, prompts: 8,
    groups: ["Karakterler", "Mekânlar", "Olay örgüsü"],
    palettes: [
      { name: "Sonbahar defteri", description: "Sıcak kahve ve turuncu.", colors: ["#7f5539", "#b08968", "#e6ccb2", "#ede0d4", "#9c6644"] },
    ],
    promptNotes: ["Karakter tohumu üretmek için ideal.", "Mekân betimi için duyu odaklı iste."],
    draft: { t: "Karakter tohumu", b: "Bana {tür} bir hikâye için sıradan görünen ama gizli bir sırrı olan 3 karakter öner. Her biri için: ad, meslek, bir alışkanlık, korktuğu şey ve hikâyeyi çatallandıracak tek bir karar." },
    notes: [
      { t: "Tohum defteri", b: "Duyduğum ilginç cümleleri buraya yazıyorum: 'Kapıyı kimse çalmadı ama zil sesi duyuldu.'", c: "secondary" },
      { t: "Alıştırma", b: "Her gün 1 mekân betimi yaz: 5 duyu, 6 cümle.", c: "primary" },
      { t: "Özel: roman fikri", b: "Küçük bir sahil kasabasında geçen, zaman döngüsüne takılmış bir kütüphaneci.", c: "warning", priv: true },
    ],
  },
  {
    key: "surreal", owner: "ayse", title: "Sürreal Rüya Panosu", kind: "moodboard", visibility: "public", age: 4, touched: 17,
    description: "Gerçeküstü sahneler, soyut formlar ve rüya mantığıyla kurulmuş görüntüler.",
    sel: tagAny(["surreal", "soyut", "fantastik", "ai-sanat"]), images: 8, prompts: 4,
    groups: ["Rüya mekânları", "Nesne dönüşümleri"],
    palettes: [
      { name: "Rüya pastel", description: "Lavanta, şeftali ve nane.", colors: ["#cdb4db", "#ffc8dd", "#ffafcc", "#bde0fe", "#a2d2ff"] },
    ],
    imgNotes: ["Ölçek oyunu çok iyi — küçük nesne dev gibi duruyor.", "Gökyüzü ve zemin yer değiştirmiş: ilginç."],
    promptNotes: ["Rüya sahnelerinin çekirdeği.", "Nesne dönüşümü için 'dönüşüyor' fiilini kullan."],
    draft: { t: "Rüya mekânı", b: "Gerçeküstü bir oda: tavan gökyüzü, zemin sonsuz bir göl, havada süzülen {nesne}, yumuşak pastel renkler, dingin ışık, rüya mantığı, düşük kontrast, geniş açı." },
    notes: [
      { t: "Rüya mantığı", b: "Üç kural: ölçek tutarsız, yerçekimi seçmeli, ışığın kaynağı belli değil.", c: "primary" },
      { t: "Nesne listesi", b: "Saat · kapı · merdiven · balık · ayna", c: "secondary" },
    ],
  },
  {
    key: "campaign", owner: "ali", title: "Eski Kampanya Fikirleri", kind: "free", visibility: "private", archived: true, age: 40, touched: 30,
    description: "Geçen yılın kampanya çalışmaları — arşivlendi, ihtiyaç olursa geri alınır.",
    sel: or(cat(["advertising", "marketing"]), tagAny(["composition"])), images: 4, prompts: 4,
    groups: ["Afişler"],
    palettes: [],
    promptNotes: ["Eski kampanya metni için örnek."],
    draft: { t: "Kampanya sloganı denemesi", b: "{marka} için 5 kısa slogan öner: sıcak, esprili, 6 sözcüğü geçmeyen. Her slogan için neden işe yarayacağını bir cümleyle açıkla." },
    notes: [
      { t: "Arşiv notu", b: "Bu pano geçen yılın kampanyasına ait. Yeni kampanya için 'Reklam Filmi Fikirleri' panosuna bak.", c: "neutral" },
    ],
  },
  {
    key: "favorites", owner: "aliq", title: "Favori Promptlarım", kind: "free", visibility: "private", age: 13, touched: 0,
    description: "Beğendiğim, denemek istediğim ve ilham aldığım promptlar. Sadece benim için.",
    sel: "true", images: 12, prompts: 8,
    groups: ["Denenecek", "Beğendiklerim", "İlham"],
    palettes: [
      { name: "Promptly paleti", description: "Kobalt, turuncu ve krem.", colors: ["#2447f9", "#ff7a30", "#f7f4ee", "#111827"] },
    ],
    imgNotes: ["Bu stil çok iyi — kendi prompt serime uyarlayacağım.", "Işık ve renk uyumu referans olabilir."],
    promptNotes: ["Önce bunu dene.", "Değişkenleri kendi projeme göre düzenle."],
    draft: { t: "Haftalık deneme promptu", b: "Haftanın teması: {tema}. Bu tema için 3 farklı kompozisyon öner: yakın plan, geniş plan ve kuş bakışı. Her biri için ışık ve renk paletini belirt." },
    notes: [
      { t: "Nasıl kullanıyorum", b: "Gördüğüm iyi bir promptu 'Space'e ekle' ile buraya atıyorum, hafta sonu hepsini deniyorum.", c: "primary" },
      { t: "Hafta sonu listesi", b: "1) Retro afiş\n2) Neon sokak\n3) Portre ışığı", c: "secondary" },
      { t: "Özel: fikir", b: "Haftalık 'en iyi 3' paylaşımı yap: pano + kısa not.", c: "warning", priv: true },
    ],
  },
  {
    key: "styles", owner: "aliq", title: "Sevdiğim Görsel Üslupları", kind: "moodboard", visibility: "public", age: 10, touched: 3,
    description: "Tasarım ve illüstrasyonda beni etkileyen üsluplar: renk, doku ve kompozisyon örnekleri.",
    sel: or(cat(["style", "design", "art_illustration"])), images: 10, prompts: 4,
    groups: ["Renk", "Doku", "Kompozisyon"],
    palettes: [
      { name: "Sevdiğim tonlar", description: "Sık döndüğüm palet.", colors: ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"] },
    ],
    imgNotes: ["Renk geçişleri çok yumuşak.", "Doku, düz renk alanlarını canlı tutuyor."],
    promptNotes: ["Stil serisi için temel.", "Aynı tarifi farklı konuyla dene."],
    draft: { t: "Stil deneme şablonu", b: "{konu}, {stil} tarzında illüstrasyon, sınırlı renk paleti, belirgin doku, güçlü silüet, düz arka plan, 4:5 dikey." },
    notes: [
      { t: "Ortak noktalar", b: "Sınırlı palet, belirgin doku ve güçlü silüet. Üslup ne olursa olsun bu üçü varsa iyi görünüyor.", c: "primary" },
      { t: "Sıradaki", b: "Bu pano ile kendi prompt setimi oluşturacağım.", c: "success" },
    ],
  },
];

// Favori / son açılan: kullanıcı başına kişisel durum (kendi Space'i dışındakiler de olabilir).
const USER_STATE = [
  { u: "aliq", key: "fantasy", favorite: true, h: 4 },
  { u: "aliq", key: "render3d", favorite: true, h: 26 },
  { u: "aliq", key: "retro", favorite: true, h: 50 },
  { u: "aliq", key: "cyber", favorite: false, h: 72 },
  { u: "aliq", key: "portrait", favorite: false, h: 100 },
  { u: "melis", key: "fantasy", favorite: true, h: 8 },
  { u: "selin", key: "interior", favorite: true, h: 20 },
  { u: "deniz", key: "anime", favorite: false, h: 33 },
  { u: "kaan", key: "skycity", favorite: true, h: 12 },
  { u: "onur", key: "minimalbrand", favorite: false, h: 6 },
  { u: "zeynep", key: "minimalbrand", favorite: false, h: 40 },
];


const BASE_SQL = "x.community_id is null and x.visibility = 'public' and x.status = 'published' and x.deleted_at is null";
const data = SPACES.map(({ key, owner, title, description, kind, visibility, age, touched, archived, sel, images, prompts, groups, members, invites, palettes, imgNotes, promptNotes, draft, notes, contentCats }) => ({
  key, owner, title, description, kind, visibility, age, touched, archived: !!archived, sel, images, prompts, groups,
  members: members ?? [], invites: invites ?? [], palettes, imgNotes: imgNotes ?? [], promptNotes: promptNotes ?? [], draft, notes, cc: contentCats ?? null,
}));

const sql = String.raw`-- Promptly Spaces demo seed (docs/history/213-*). ÜRETİLDİ: node supabase/seed/build-spaces-seed.mjs — elle düzenleme.
-- Yalnızca INSERT/UPDATE (silme yok); tekrar çalıştırılabilir (deterministik kimlikler + on conflict do nothing).
-- Space'ler mevcut herkese açık promptlara/görsellere BAŞVURUR (kopya yok). Tek işlemdir: biri başarısız olursa hiçbiri yazılmaz.
do $seed$
declare
  sp jsonb; mb jsonb; nt jsonb; pl jsonb; us jsonb;
  v_key text; v_sid uuid; v_owner uuid; v_ng int; v_np int; v_base text; v_src uuid; v_parts text; v_cc jsonb; i int;
  v_colors text[] := array['primary', 'secondary', 'success', 'warning', 'danger', 'neutral'];
begin
  for sp in select value from jsonb_array_elements($d$${JSON.stringify(data)}$d$::jsonb) loop
    v_key := sp->>'key';
    v_sid := md5('seed-space:' || v_key)::uuid;
    select id into v_owner from public.profiles where username = sp->>'owner';
    if v_owner is null then continue; end if;
    v_ng := jsonb_array_length(sp->'groups');
    v_np := jsonb_array_length(sp->'palettes');
    v_base := '${BASE_SQL.replace(/'/g, "''")} and ' || (sp->>'sel');

    insert into public.spaces (id, owner_id, title, description, kind, visibility, archived_at, created_at, updated_at, updated_by)
    values (v_sid, v_owner, sp->>'title', sp->>'description', sp->>'kind', sp->>'visibility',
            case when (sp->>'archived')::boolean then now() - interval '20 days' end,
            now() - make_interval(days => (sp->>'age')::int), now() - make_interval(days => (sp->>'touched')::int), v_owner)
    on conflict (id) do nothing;

    for mb in select value from jsonb_array_elements(sp->'members') loop
      insert into public.space_members (space_id, user_id, role, added_by)
      select v_sid, p.id, mb->>'role', v_owner from public.profiles p where p.username = mb->>'u'
      on conflict (space_id, user_id) do nothing;
    end loop;

    for i in 0 .. v_ng - 1 loop
      insert into public.space_groups (id, space_id, name, color, position, created_by)
      values (md5('seed-group:' || v_key || ':' || i)::uuid, v_sid, sp->'groups'->>i, v_colors[1 + i % 6], i, v_owner)
      on conflict (id) do nothing;
    end loop;

    for i in 0 .. v_np - 1 loop
      pl := sp->'palettes'->i;
      insert into public.space_palettes (id, space_id, name, description, colors, source, position, created_by)
      values (md5('seed-palette:' || v_key || ':' || i)::uuid, v_sid, pl->>'name', pl->>'description',
              array(select jsonb_array_elements_text(pl->'colors')), 'manual', i, v_owner)
      on conflict (id) do nothing;
    end loop;

    if (sp->>'images')::int > 0 then
      execute format($f$
        insert into public.space_items (id, space_id, kind, x, y, w, h, z, group_id, prompt_id, media_url, media_width, media_height, title, note, color, created_by)
        select md5('seed-item:' || %1$L || ':img:' || m.media_id::text)::uuid, %2$L::uuid, 'image',
               ((m.rn - 1) %% 4) * 300, ((m.rn - 1) / 4) * 320, 260,
               least(300, greatest(160, round(260.0 * coalesce(m.height, 260) / greatest(coalesce(m.width, 260), 1))::int)),
               m.rn, md5('seed-group:' || %1$L || ':' || ((m.rn - 1) %% %5$s))::uuid, m.prompt_id, m.url, m.width, m.height, '',
               coalesce(%6$L::jsonb ->> (m.rn::int - 1), ''), 'neutral', %3$L::uuid
          from (
            select pm.id as media_id, pm.prompt_id, pm.url, pm.width, pm.height,
                   row_number() over (order by x.like_count desc, x.created_at, pm.id) as rn
              from public.prompts x join public.prompt_media pm on pm.prompt_id = x.id
             where %4$s and pm.position = (select min(p2.position) from public.prompt_media p2 where p2.prompt_id = x.id)
          ) m
         where m.rn <= %7$s
        on conflict (id) do nothing$f$, v_key, v_sid, v_owner, v_base, greatest(v_ng, 1), sp->'imgNotes', sp->>'images');

      -- Görsellerin KAYITLI baskın renklerinden palet (uydurma değil; renksiz görseller atlanır).
      insert into public.space_palettes (id, space_id, name, description, colors, source, source_item_id, position, created_by)
      select md5('seed-palette:' || v_key || ':img')::uuid, v_sid, 'Görsellerden çıkarılan renkler', 'Bu Space''teki görsellerin kayıtlı baskın renkleri.', c.cols, 'image',
             (select it.id from public.space_items it where it.space_id = v_sid and it.kind = 'image' order by it.y, it.x limit 1), v_np, v_owner
        from (
          select array_agg(col order by ord) as cols
            from (
              select col, min(ord) as ord
                from (
                  select lower(pm.dominant_color) as col, row_number() over (order by si.y, si.x) as ord
                    from public.space_items si join public.prompt_media pm on pm.prompt_id = si.prompt_id and pm.url = si.media_url
                   where si.space_id = v_sid and si.kind = 'image' and pm.dominant_color ~ '^#[0-9a-fA-F]{6}$'
                ) a group by col order by min(ord) limit 6
            ) b
        ) c
       where c.cols is not null and cardinality(c.cols) >= 3
      on conflict (id) do nothing;
    end if;

    insert into public.space_items (id, space_id, kind, x, y, w, h, z, palette_id, created_by)
    select md5('seed-item:' || v_key || ':pal:' || pl2.id::text)::uuid, v_sid, 'palette', pl2.position * 420, -380, 400, 280, 100 + pl2.position, pl2.id, v_owner
      from public.space_palettes pl2 where pl2.space_id = v_sid
    on conflict (id) do nothing;

    if (sp->>'prompts')::int > 0 then
      execute format($f$
        insert into public.space_items (id, space_id, kind, x, y, w, h, z, group_id, prompt_id, note, color, created_by)
        select md5('seed-item:' || %1$L || ':prm:' || x.id::text)::uuid, %2$L::uuid, 'prompt',
               1300 + ((x.rn - 1) %% 2) * 380, ((x.rn - 1) / 2) * 300, 340, 260, 200 + x.rn,
               md5('seed-group:' || %1$L || ':' || ((x.rn - 1) %% %5$s))::uuid, x.id,
               coalesce(%6$L::jsonb ->> (x.rn::int - 1), ''), 'neutral', %3$L::uuid
          from (
            select x.id, row_number() over (order by x.like_count desc, x.created_at, x.id) as rn
              from public.prompts x where %4$s
          ) x
         where x.rn <= %7$s
        on conflict (id) do nothing$f$, v_key, v_sid, v_owner, v_base, greatest(v_ng, 1), sp->'promptNotes', sp->>'prompts');
    end if;

    -- Kullanıcının kendi prompt taslağı (kaynak: Space'teki en çok beğenilen prompt).
    execute format('select x.id from public.prompts x where %s order by x.like_count desc, x.created_at limit 1', v_base) into v_src;
    insert into public.space_items (id, space_id, kind, x, y, w, h, z, is_draft, source_prompt_id, title, body, color, created_by)
    values (md5('seed-item:' || v_key || ':draft')::uuid, v_sid, 'prompt', 1300, -380, 340, 280, 300, true, v_src,
            sp->'draft'->>'t', sp->'draft'->>'b', 'primary', v_owner)
    on conflict (id) do nothing;

    for i in 0 .. jsonb_array_length(sp->'notes') - 1 loop
      nt := sp->'notes'->i;
      insert into public.space_items (id, space_id, kind, x, y, w, h, z, title, body, color, is_private, created_by)
      values (md5('seed-item:' || v_key || ':note:' || i)::uuid, v_sid, 'note', 2100 + (i % 2) * 320, (i / 2) * 280, 290, 230, 400 + i,
              nt->>'t', nt->>'b', coalesce(nt->>'c', 'neutral'), coalesce((nt->>'priv')::boolean, false), v_owner)
      on conflict (id) do nothing;
    end loop;

    v_cc := sp->'cc';
    if v_cc is not null and v_cc <> 'null'::jsonb then
      v_parts := '';
      if v_cc ? 'workflow' then
        v_parts := v_parts || format('select ''workflow''::text as ct, w.id as cid, w.like_count as lc, w.created_at as ca from public.workflows w where w.visibility = ''public'' and w.status = ''published'' and w.community_id is null and w.category = any(array[%s])',
          (select string_agg(quote_literal(c), ',') from jsonb_array_elements_text(v_cc->'workflow') c));
      end if;
      if v_cc ? 'preset' then
        v_parts := v_parts || case when v_parts = '' then '' else ' union all ' end || format('select ''preset'', s.id, s.like_count, s.created_at from public.presets s where s.visibility = ''public'' and s.status = ''published'' and s.community_id is null and s.category = any(array[%s])',
          (select string_agg(quote_literal(c), ',') from jsonb_array_elements_text(v_cc->'preset') c));
      end if;
      if v_cc ? 'request' then
        v_parts := v_parts || case when v_parts = '' then '' else ' union all ' end || format('select ''request'', r.id, r.like_count, r.created_at from public.prompt_requests r where r.visibility = ''public'' and r.community_id is null and r.deleted_at is null and not r.is_draft and r.category = any(array[%s])',
          (select string_agg(quote_literal(c), ',') from jsonb_array_elements_text(v_cc->'request') c));
      end if;
      execute format($f$
        insert into public.space_items (id, space_id, kind, x, y, w, h, z, content_type, content_id, color, created_by)
        select md5('seed-item:' || %1$L || ':content:' || c.cid::text)::uuid, %2$L::uuid, 'content',
               2100 + ((c.rn - 1) %% 2) * 320, 640 + ((c.rn - 1) / 2) * 260, 290, 220, 500 + c.rn, c.ct, c.cid, 'neutral', %3$L::uuid
          from (select u.*, row_number() over (order by u.lc desc, u.ca, u.cid) as rn from (%4$s) u) c
         where c.rn <= 4
        on conflict (id) do nothing$f$, v_key, v_sid, v_owner, v_parts);
    end if;

    for mb in select value from jsonb_array_elements(sp->'invites') loop
      insert into public.space_invitations (id, space_id, invitee_id, role, invited_by, status, created_at)
      select md5('seed-invite:' || v_key || ':' || (mb->>'u'))::uuid, v_sid, p.id, mb->>'role', v_owner, 'pending', now() - interval '2 days'
        from public.profiles p where p.username = mb->>'u'
      on conflict (id) do nothing;
      insert into public.notifications (id, recipient_id, actor_id, type, message, target_href, created_at)
      select md5('seed-invite-notif:' || v_key || ':' || (mb->>'u'))::uuid, p.id, v_owner, 'system',
             'Seni "' || (sp->>'title') || '" Space''ine davet etti.', '/spaces', now() - interval '2 days'
        from public.profiles p where p.username = mb->>'u'
      on conflict (id) do nothing;
    end loop;

    -- Tetikleyicilerin yazdığı etkinlik satırlarını sahibe bağla ve zamanlara yay; son düzenleme zamanı (öğe tetikleyicileri şimdiye çeker).
    update public.space_activity
       set actor_id = v_owner,
           created_at = now() - make_interval(days => (sp->>'age')::int) + random() * make_interval(days => greatest((sp->>'age')::int - (sp->>'touched')::int, 1))
     where space_id = v_sid and actor_id is null;
    update public.spaces set updated_at = now() - make_interval(days => (sp->>'touched')::int) where id = v_sid;
  end loop;

  -- Kişisel durum: favoriler ve son açılanlar.
  for us in select value from jsonb_array_elements($u$${JSON.stringify(USER_STATE)}$u$::jsonb) loop
    insert into public.space_user_state (user_id, space_id, favorite, last_opened_at)
    select p.id, s.id, (us->>'favorite')::boolean, now() - make_interval(hours => (us->>'h')::int)
      from public.profiles p join public.spaces s on s.id = md5('seed-space:' || (us->>'key'))::uuid
     where p.username = us->>'u'
    on conflict (user_id, space_id) do nothing;
  end loop;
  -- Sahiplerin kendi Space'leri "son açılanlar"da.
  insert into public.space_user_state (user_id, space_id, favorite, last_opened_at)
  select s.owner_id, s.id, false, s.updated_at from public.spaces s
   where s.id in (select md5('seed-space:' || (e.value->>'key'))::uuid from jsonb_array_elements($d2$${JSON.stringify(data.map((d) => ({ key: d.key })))}$d2$::jsonb) e)
  on conflict (user_id, space_id) do nothing;
end
$seed$;
`;
writeFileSync(new URL("./spaces-demo.sql", import.meta.url), sql);
console.log(`spaces-demo.sql: ${SPACES.length} Space, ${sql.length} bayt`);
