// viral-fill.sql için içerik tablosu: metin / video / ses promptları + workflow'lar.
//
// Kaynaklar (hepsi açık lisanslı; ham metin fill-cases.json içinde):
//   • Metin:  f/awesome-chatgpt-prompts (prompts.chat) — CC0 / kamu malı.
//             Katkıcı e-posta adresi içeriyorsa anılmaz (kişisel veri).
//   • Video:  LichAmnesia/awesome-ad-video-prompts — CC BY 4.0.
//   • Ses:    suno-ai-farm/awesome-ai-music-prompts — MIT,
//             dimlyai/awesome-suno-resources — CC BY 4.0 (© aigclist).
// İstek ve generatorlar eski demo-content.mjs'ten (Türkçe, elle yazılmış) uyarlanır.
//
// Kategori/alt kategori/etiket değerleri canlı veritabanındaki slug'lardır.

export const SRC = {
  text: "Kaynak: prompts.chat — awesome-chatgpt-prompts (CC0, kamu malı) · https://github.com/f/awesome-chatgpt-prompts",
  video: "Kaynak: awesome-ad-video-prompts (CC BY 4.0) · https://github.com/LichAmnesia/awesome-ad-video-prompts",
  farm: "Kaynak: awesome-ai-music-prompts (MIT) · https://github.com/suno-ai-farm/awesome-ai-music-prompts",
  suno: "Kaynak: Awesome Suno Resources (CC BY 4.0, © aigclist) · https://github.com/dimlyai/awesome-suno-resources",
};

// [csv'deki başlık, persona, başlık, açıklama, kategori, alt kategori, etiketler, araçlar, yanıt?]
// yanıt: { owner, idx, selected } → owner kullanıcısının idx. isteğine verilmiş yanıt.
const T = ["chatgpt", "claude"];
export const TEXT_ROWS = [
  // veli
  ["Linux Terminal", "veli", "Linux terminalini simüle et", "Yapay zekâyı gerçek bir Linux terminaline çevirir; komut yazarsın, yalnızca terminal çıktısını döndürür.", "coding", "code", ["kodlama"], T],
  ["JavaScript Console", "veli", "JavaScript konsolu simülasyonu", "Yazdığın JavaScript'i çalıştırıp yalnızca konsol çıktısını gösteren bir konsol gibi davranır.", "coding", "javascript", ["kodlama", "javascript"], T],
  ["Code Reviewer", "veli", "Kod inceleme asistanı", "Kodundaki hataları, kötü kalıpları ve iyileştirme önerilerini madde madde çıkaran deneyimli bir inceleyici.", "coding", "debugging", ["kodlama"], T],
  ["SQL Query Explainer for Non-Engineers", "veli", "SQL sorgusunu mühendis olmayanlara anlat", "Karmaşık bir SQL sorgusunu teknik bilgisi olmayan birine sade bir dille açıklar.", "coding", "sql", ["kodlama"], T, { owner: "onur", idx: 0, selected: true }],
  // onur
  ["Commit Message Generator", "onur", "Değişiklikten commit mesajı üretici", "Yaptığın değişikliği anlatınca kısa, açıklayıcı bir commit mesajı yazar.", "coding", "automation", ["kodlama"], T, { owner: "veli", idx: 1, selected: true }],
  ["Python Interpreter", "onur", "Python yorumlayıcısı simülasyonu", "Python kodunu çalıştırmadan, yorumlayıcı gibi yalnızca çıktısını döndürür.", "coding", "python", ["kodlama"], T],
  ["SQL Terminal", "onur", "SQL terminali simülasyonu", "Örnek bir veritabanı üzerinde yazdığın SQL sorgularının sonuç tablolarını döndüren bir terminal.", "coding", "sql", ["kodlama"], T],
  ["Data Scientist", "onur", "Veri bilimci rolü", "Veri setini ve hedefi anlatınca analiz yaklaşımı, temizleme adımları ve model önerileri sunan veri bilimci.", "research", "data_analysis", ["kodlama"], T],
  ["Machine Learning Engineer", "onur", "Makine öğrenmesi mühendisi", "Bir problem için uygun algoritmayı, özellik mühendisliğini ve değerlendirme metriğini önerir.", "coding", "python", ["kodlama", "ai-sanat"], T],
  // zeynep
  ["Poet", "zeynep", "Şair rolü", "Duygu uyandıran şiirler ve kısa dizeler yazar; konuyu sen verirsin.", "writing", "poetry", ["siir", "yazarlik"], T, { owner: "ipek", idx: 1, selected: true }],
  ["Novelist", "zeynep", "Romancı rolü", "Karakterleri ve olay örgüsüyle sürükleyici, uzun soluklu bir roman kurgusu geliştirir.", "writing", "novel", ["yazarlik"], T],
  ["Etymologist", "zeynep", "Kelime kökeni uzmanı", "Bir kelimenin kökenini ve zaman içinde nasıl evrildiğini anlatan etimolog.", "education", "lesson", ["yazarlik"], T],
  ["Expert Discovery Interviewer Guide", "zeynep", "Uzman görüşmesi için keşif rehberi", "Bir uzmanla yapılacak keşif görüşmesi için soru akışı ve takip soruları hazırlayan rehber.", "research", "research", ["yazarlik"], T, { owner: "kaan", idx: 1, selected: false }],
  // ipek
  ["AI Writing Tutor", "ipek", "Yapay zekâ yazı hocası", "Öğrencinin yazısına yapıcı, adım adım geri bildirim veren bir yazma eğitmeni.", "education", "lesson", ["yazarlik"], T, { owner: "zeynep", idx: 0, selected: true }],
  ["Children's Book Creator", "ipek", "Çocuk kitabı oluşturucu", "Çocuklar için sayfa sayfa ilerleyen, resimlemeye uygun bir kitap kurgusu çıkarır.", "writing", "story", ["yazarlik"], T],
  ["Children's Story about Apples", "ipek", "Elmalar hakkında çocuk hikâyesi", "Yaş grubuna uygun, öğretici ve sevimli bir elma hikâyesi yazdırır.", "writing", "story", ["yazarlik"], T],
  // ceren
  ["Advertiser", "ceren", "Reklamveren rolü", "Bir ürün için hedef kitleyi, mesajı ve kanalları belirleyen bir reklam kampanyası tasarlar.", "marketing", "campaign", ["yazarlik"], T],
  ["Social Media Manager", "ceren", "Sosyal medya yöneticisi", "Marka için içerik takvimi, gönderi fikirleri ve etkileşim stratejisi planlar.", "social_media", "social_media_post", ["yazarlik"], T],
  ["Google Ads Title Copywriter", "ceren", "Google Ads başlık yazarı", "Karakter sınırına uyan, tıklama getiren Google Ads başlıkları üretir.", "marketing", "ad_copy", ["yazarlik"], T],
  ["SEO specialist", "ceren", "SEO uzmanı", "Bir web sitesi için anahtar kelime ve içerik stratejisi öneren SEO uzmanı.", "seo", "seo_article", ["yazarlik"], T],
  // kaan
  ["UX/UI Developer", "kaan", "UX/UI geliştirici", "Bir ürün için kullanıcı akışı ve arayüz önerileri geliştirir, gerekçelerini açıklar.", "coding", "web", ["minimalist", "kodlama"], T],
  ["Comprehensive UI/UX Mobile App Analysis", "kaan", "Mobil uygulama UI/UX analizi", "Mevcut bir mobil uygulamayı kullanılabilirlik ve arayüz açısından kapsamlı analiz eder.", "research", "analysis", ["minimalist"], T],
  // melis
  ["Chef", "melis", "Şef rolü", "Elindeki malzemelere ve damak tadına göre tarif öneren, adım adım anlatan bir şef.", null, null, ["yazarlik"], T],
  ["Recipe Finder", "melis", "Tarif bulucu", "Malzeme listene göre uygun tarifleri bulur ve eksik malzemeleri belirtir.", null, null, ["yazarlik"], T],
  ["Personal Chef", "melis", "Kişisel şef", "Bütçene, süreye ve beslenme tercihine göre haftalık yemek planı yapan kişisel şef.", null, null, ["yazarlik"], T],
  // deniz
  ["Dietitian", "deniz", "Diyetisyen rolü", "Hedefe ve yaşam tarzına göre haftalık beslenme planı hazırlayan diyetisyen.", null, null, ["yazarlik"], T, { owner: "melis", idx: 1, selected: true }],
  ["Travel Guide", "deniz", "Gezi rehberi", "Bulunduğun konuma göre gezilecek yerleri ve yerel önerileri sunan rehber.", null, null, ["manzara"], T],
  ["Travel Planner Prompt", "deniz", "Seyahat planlayıcı", "Süre, bütçe ve ilgi alanlarına göre gün gün gezi planı çıkarır.", null, null, ["manzara"], T],
  // emre
  ["Text Based Adventure Game", "emre", "Metin tabanlı macera oyunu", "Komutlarına yalnızca oyun çıktısıyla karşılık veren bir metin macerası; karakterin gördüklerini anlatır.", "writing", "fiction", ["yazarlik", "fantastik"], T],
  ["Storyteller", "emre", "Hikâye anlatıcı", "Hedef kitleye göre masal, öğretici hikâye veya macera anlatan hikâye anlatıcısı.", "writing", "story", ["yazarlik", "fantastik"], T, { owner: "baran", idx: 1, selected: false }],
  ["Game design", "emre", "Oyun tasarımı", "Bir oyun fikrini mekanikleri, döngüsü ve ilerleme sistemiyle birlikte tasarlatır.", "writing", "world_building", ["yazarlik", "fantastik"], T],
  // can
  ["Screenwriter", "can", "Senarist rolü", "Karakterleri ve diyaloglarıyla sürükleyici bir film veya dizi senaryosu geliştirir.", "writing", "screenplay", ["yazarlik"], T],
  ["Film Critic", "can", "Film eleştirmeni", "Bir filmi kurgu, oyunculuk ve yönetmenlik açısından eleştirel biçimde değerlendirir.", "writing", "creative_writing", ["yazarlik"], T],
  ["Screenplay Script with Cinematography Details", "can", "Sinematografi ayrıntılı senaryo", "Sahneleri kamera açıları, ışık ve plan ayrıntılarıyla birlikte senaryolaştırır.", "writing", "screenplay", ["yazarlik", "lighting"], T],
  // baran
  ["Time Travel Guide", "baran", "Zaman yolculuğu rehberi", "Seçtiğin dönem ve mekân için zaman yolcusuna rehberlik eden eğlenceli bir kılavuz.", "writing", "fiction", ["yazarlik", "retro"], T],
  // ali
  ["Midjourney Prompt Generator", "ali", "Midjourney prompt üretici", "Kısa bir fikri, görsel yapay zekâ için ayrıntılı ve yaratıcı sahne tarifine dönüştürür.", "writing", "creative_writing", ["ai-sanat", "siberpunk"], T],
  // selin
  ["Social Media Influencer", "selin", "Sosyal medya fenomeni", "Moda ve yaşam tarzı içerikleri için gönderi fikirleri ve etkileşim taktikleri üretir.", "social_media", "instagram", ["yazarlik"], T],
  // ece
  ["Creative Branding Strategist", "ece", "Yaratıcı marka stratejisti", "Bir marka için konumlandırma, ton ve görsel dil stratejisi geliştirir.", "marketing", "brand_copy", ["yazarlik", "minimalist"], T],
  // burak
  ["Procedural 3D Environment Designer", "burak", "Prosedürel 3D ortam tasarımcısı", "Kural tabanlı üretilebilecek 3D ortamlar ve mekân tasarımı için yapılandırılmış brief hazırlar.", null, null, ["3d-render", "mimari"], T],
  // mehmet
  ["Composer", "mehmet", "Besteci rolü", "Verdiğin ruh haline ve türe göre eser fikri, ezgi yapısı ve düzenleme önerisi sunar.", null, null, ["yazarlik"], T],
  ["Acoustic Guitar Composer", "mehmet", "Akustik gitar bestecisi", "Akustik gitar için aralıklar, akor geçişleri ve parmak düzeni içeren beste önerileri hazırlar.", null, null, ["yazarlik"], T],
  ["Classical Music Composer", "mehmet", "Klasik müzik bestecisi", "Seçtiğin enstrüman ve dönem için klasik tarzda bir eser taslağı oluşturur.", null, null, ["yazarlik"], T],
];

// [video indeksi, persona, başlık, açıklama, kategori, alt kategori, etiketler, araçlar]
const V = ["veo", "seedance", "kling"];
export const VIDEO_ROWS = [
  [47, "melis", "Soğuk demleme kahve dökme (cascade)", "Soğuk demlenmiş kahvenin bardağa şelale gibi dökülüşünü anlatan, 9:16 dikey reklam videosu promptu.", "advertising", "product_ad", ["video-uretim"], V],
  [49, "melis", "Ramen buharı ritüeli", "Sıcak bir kase ramenin buharını ve dokusunu yakın planda gösteren 16:9 yemek reklamı.", "advertising", "brand_ad", ["video-uretim", "lighting"], V],
  [48, "melis", "Tostta bal damlaması", "Ekmeğe akan balın dokusunu makro çekimle gösteren 1:1 yemek videosu.", "advertising", "product_ad", ["video-uretim"], V],
  [1, "selin", "Spor ayakkabı 360° stüdyo dönüşü", "Spor ayakkabıyı stüdyoda 360 derece döndüren 1:1 ürün tanıtım videosu promptu.", "product_commercial", "product_video", ["video-uretim", "studio-lighting"], V],
  [44, "selin", "Spor ayakkabı, ıslak beton", "Islak beton zeminde lüks hissi veren 9:16 premium ayakkabı reklamı.", "product_commercial", "fashion", ["video-uretim", "editorial-photography"], V],
  [5, "selin", "Gözlük, hareket kontrollü ışık izleri", "Gözlüğün çerçevesinde süzülen ışık izleriyle 16:9 ürün videosu.", "product_commercial", "product_video", ["video-uretim", "lighting"], V],
  [6, "ceren", "Banyo aynasında cilt bakımı itirafı", "Gerçekçi, kullanıcı içeriği (UGC) hissi veren 9:16 cilt bakımı reklamı.", "advertising", "ugc", ["video-uretim"], V],
  [37, "ceren", "POV: sabah cilt bakımı", "Birinci kişi bakışıyla sabah rutini gösteren, sosyal medya için 9:16 video.", "advertising", "social_media_ad", ["video-uretim"], V],
  [40, "ceren", "Işıltılı dönüşüm (glow-up)", "Önce/sonra geçişini hızlı bir kamera hareketiyle gösteren 9:16 trend videosu.", "social_media", "reels", ["video-uretim"], V],
  [28, "can", "Yağmurlu şehirde akşamüstü koşusu", "Islak asfaltta alçak açılı takip çekimiyle sinematik bir koşu sahnesi, 9:16.", "cinematic", "cinematic_scene", ["video-uretim", "lighting"], V],
  [30, "can", "Mum ışığında plak dinletisi", "Sıcak mum ışığında plak dinlenen, sakin ve sinematik bir 16:9 sahne.", "cinematic", "cinematic_scene", ["video-uretim", "lighting"], V],
  [43, "can", "Espresso, yavaş çekim dökülüş", "Espresso'nun yavaş çekimle dökülüşünü gösteren 16:9 lüks sahne.", "cinematic", "film", ["video-uretim"], V],
  [42, "ece", "Siyah serum, soğuk mermer", "Soğuk mermer üzerinde lüks bir serum şişesi; 9:16 premium marka videosu.", "advertising", "brand_ad", ["video-uretim", "minimalist"], V],
  [46, "ece", "Mum, gece yarısı kütüphanesi", "Kütüphane ortamında mum ışığıyla 16:9 lüks marka sahnesi.", "advertising", "brand_ad", ["video-uretim", "lighting"], V],
  [35, "kaan", "Akıllı kupa, termal veri katmanı", "Ürünün üzerine termal veri katmanı bindiren 16:9 özellik anlatım videosu.", "education", "explainer", ["video-uretim"], V],
  [3, "kaan", "Kulaklık, patlatılmış görünümde süzülme", "Kulaklık parçalarının sıfır yerçekiminde ayrılıp süzüldüğü 16:9 teknik tanıtım.", "product_commercial", "technology", ["video-uretim"], V],
  [33, "onur", "X-ray enerji dönüşü: koşu tabanlığı", "Koşu ayakkabısının tabanlığındaki enerji dönüşünü röntgen görünümüyle anlatan 16:9 video.", "education", "explainer", ["video-uretim"], V],
];

// [kimlik, persona, başlık, açıklama, kategori, alt kategori, etiketler, araçlar, prompt, kaynak]
const SU = ["suno"], UD = ["udio"];
export const AUDIO_ROWS = [
  ["pop", "ali", "Synth-pop marşı (Suno)", "Güçlü kadın vokalli, enerjik bir synth-pop şarkı için stil promptu.", "music", "pop", ["muzik-uretim"], SU,
    "infectious synth-pop anthem, female powerhouse vocals, pulsing 808 bass,\neuphoric build-ups, modern radio production, vocal harmonies on chorus,\nBPM: 128, Key: C Major", "farm"],
  ["hiphop", "mehmet", "Karanlık trap (Suno)", "Sert 808'ler ve karanlık melodilerle modern bir trap parçası için stil promptu.", "music", "hip_hop", ["muzik-uretim"], SU,
    "hard-hitting 808s, menacing trap beat, rapid hi-hat rolls,\natmospheric pads, dark melodic undertones, confident rap flow,\nad-libs throughout, hard bass drop, modern rap production,\nBPM: 75, Key: F Minor", "farm"],
  ["rock", "emre", "Stadyum rock'ı (Suno)", "Güçlü akorlar ve ezgili nakaratla stadyum havasında bir rock parçası.", "music", "rock", ["muzik-uretim"], SU,
    "massive power chords, arena rock production, anthemic chorus,\ndriving rhythm section, guitar solo at 2:15, crowd-ready hooks,\ndistorted guitars, thunderous drums, raw powerful vocals,\nBPM: 140, Key: E Minor", "farm"],
  ["orchestral", "can", "Orkestral film müziği (Udio)", "Yaylılar, bakır üflemeler ve koro ile epik, gerilimden zafere giden film müziği.", "music", "film_score", ["muzik-uretim"], UD,
    "Full orchestral arrangement, sweeping strings, brass swells,\ntimpani rolls, choir pads, dramatic film score, epic cinematic build,\nminor key progression, 90 BPM, building tension to triumphant resolution", "farm"],
  ["jazzfusion", "mehmet", "Caz füzyon (Udio)", "Rhodes, füzyon gitar ve 7/4 ritimle karmaşık armonili bir caz füzyon parçası.", "music", "jazz", ["muzik-uretim"], UD,
    "Electric piano (Rhodes), complex jazz harmony, fusion guitar with chorus effect,\nsyncopated drum kit with rimshots, walking electric bass,\nimprovised solos, 7/4 time signature, 120 BPM, virtuosic", "farm"],
  ["ambientelec", "baran", "Ambient elektronik (Udio)", "Drone sentezleyiciler ve saha kayıtlarıyla yavaş evrilen meditatif bir atmosfer.", "music", "ambient", ["muzik-uretim", "uzay"], UD,
    "Drone synth pads, granular textures, slowly evolving atmosphere,\nfield recordings of rain, sub-bass frequencies, meditative,\nno drums, 60 BPM, deep listening, 10 minute duration", "farm"],
  ["folk", "mehmet", "Akustik halk baladı (MusicGen)", "Parmak vuruşlu akustik gitar ve sıcak erkek vokalle samimi bir halk baladı. Meta'nın açık kaynak MusicGen modeli için yazılmıştır.", "music", "folk", ["muzik-uretim"], [],
    "fingerpicked acoustic guitar, warm male vocals, gentle harmonica accents,\nsparse percussion with brushed snare, upright bass,\nfolk ballad, storytelling lyrics, intimate room recording,\nBPM: 85, Key: G Major", "farm"],
  ["edm", "baran", "Festival ana sahne dansı (MusicGen)", "Dörtlük vuruş, arpej synth ve yükselen gerilimle festival enerjili bir elektronik dans parçası.", "music", "electronic", ["muzik-uretim"], [],
    "four-on-the-floor kick drum, pulsing bassline, shimmering hi-hats,\narpeggiated synth lead, filtered vocal samples, rising tension,\nfestival main stage energy, sidechain compression, BPM: 128, Key: A Minor", "farm"],
  ["lofiloop", "melis", "Lo-fi hip hop döngüsü (Stable Audio)", "Cızırtılı plak sesi ve caz piyano akoruyla 4 ölçülük, döngüye uygun lo-fi.", "music", "lo_fi", ["muzik-uretim"], [],
    "lo-fi hip hop loop, jazzy electric piano chord, vinyl crackle,\ndusty boom bap drum break, warm tape saturation, 85 BPM, 4 bars, loopable", "farm"],
  ["impact", "can", "Sinematik darbe efekti (Stable Audio)", "Derin bas düşüşü ve metalik çınlamayla 3 saniyelik korku fragmanı darbe sesi.", "sound_effects", "cinematic_effect", ["muzik-uretim"], [],
    "cinematic impact, deep sub bass drop, resonant metallic clang,\nreverb tail, horror trailer sound design, 3 second duration", "farm"],
  ["ambientpad", "baran", "Etereal ambient pad (Stable Audio)", "Yavaş evrilen, rüya gibi, 30 saniyelik giriş-çıkışlı geniş bir sentezleyici zemin sesi.", "ambience", "space", ["muzik-uretim", "uzay"], [],
    "lush ambient synth pad, ethereal, slowly evolving, dreamy,\ndetuned oscillators, cavernous reverb, 30 second fade in and out", "farm"],
  ["rainyballad", "melis", "Yağmurlu gece baladı (Suno)", "Nefesli kadın vokal ve yumuşak piyanoyla 'saat gece ikide kulaklık' hissi veren bir balad; hem stil hem söz yapısı.", "music", "song", ["muzik-uretim"], SU,
    "Styles: melancholic, rainy night, female vocal, breathy, close-mic, soft piano, lo-fi\n\nLyrics:\n[Intro]\n[Verse 1]\nNeon on the window, the kettle's gone cold\nYour coat's on the hook where you left it last June\n[Chorus]\nI keep the porch light burning\nFor a car that's never driving home\n[Verse 2]\n...\n[Chorus]\n[Outro]", "suno"],
  ["phonk", "mehmet", "Drift phonk (Suno)", "Kovboy çanı melodisi ve bozuk 808 ile drift'e uygun phonk; kısa, vurucu dizeler ve [Drop] bölümleri.", "music", "hip_hop", ["muzik-uretim"], SU,
    "Styles: phonk, memphis rap, cowbell melody, distorted 808, menacing\n\nLyrics:\n[Intro]\n[Verse 1]\nShort, punchy lines — one bar each\n[Drop]\n(no vocals — let the cowbell carry it)\n[Verse 2]\n[Drop]\n[Outro]", "suno"],
  ["citypop", "mehmet", "City pop (Suno)", "Parlak bakır üflemeler ve kıvrak bas hattıyla 80'ler Tokyo sürüş müziği.", "music", "pop", ["muzik-uretim"], SU,
    "Styles: city pop, japanese funk, bright brass, slinky bassline, female vocal, radio-ready pop mix\n\nLyrics:\n[Intro]\n[Verse 1]\n(Write the lyrics, then declare the language — add \"japanese\" or \"mandarin\"\nto the Styles box so pronunciation follows the words)\n[Pre-Chorus]\n[Chorus]\n[Instrumental Break]\n[Chorus]\n[Outro]", "suno"],
];

// Workflow'lar — adımlar var olan gerçek prompt/generatorlara referans verir.
// ref biçimi: "img:<vaka>" (görsel prompt), "text:<csv başlığı>", "video:<indeks>",
//             "audio:<kimlik>", "gen:<persona>:<sıra>" (kişinin generatorlarından)
// Adım: [başlık, açıklama, talimat, ref, çıktı etiketi]; ilk adımın dışındakilerin girdisi bir önceki adımın çıktısına bağlanır.
export const WORKFLOWS = [
  { user: "ceren", title: "Ürün lansman içerik paketi", desc: "Reklam metninden başlayıp ürün görseline ve kısa videoya uzanan bir lansman akışı.", types: ["text", "image", "video"], category: "marketing", sub: "campaign", tools: ["chatgpt", "gpt-image", "veo"], cover: 37,
    steps: [["Reklam stratejisi", "Ürün için hedef kitle ve mesajı belirle.", "Ürün adını ve hedef kitleyi yaz, çıktıdaki ana mesajı sonraki adıma taşı.", "text:Advertiser", "Ana mesaj"],
            ["Ürün görseli", "Ana mesaja uygun pastel 3D ürün görseli üret.", "Ana mesajı görsel promptundaki [brand product] alanına uyarla.", "img:37", "Ürün görseli"],
            ["Kısa tanıtım videosu", "Görselin dilini kısa bir sosyal medya videosuna taşı.", "Üretilen ürün görselini referans alarak POV rutin videosunu çalıştır.", "video:37", "Reklam videosu"]] },
  { user: "can", title: "Kısa film konsepti", desc: "Senaryo fikrinden sinematik bir kareye, oradan hareketli bir sahneye.", types: ["text", "image", "video"], category: "cinematic", sub: "cinematic_scene", tools: ["chatgpt", "gpt-image", "veo"], cover: 77,
    steps: [["Senaryo taslağı", "Hikâyenin ana sahnelerini yazdır.", "Sahne sayısını ve türü belirt.", "text:Screenwriter", "Sahne listesi"],
            ["Atmosfer karesi", "Ana sahnenin ruhunu yakalayan tek bir kare üret.", "Sahne listesinden en güçlü sahneyi seçip görsel promptuna uyarla.", "img:77", "Atmosfer karesi"],
            ["Hareketli sahne", "Seçtiğin sahneyi kısa bir sinematik videoya çevir.", "Kare ile aynı ışık ve renk paletini koru.", "video:28", "Sahne videosu"]] },
  { user: "ali", title: "Siberpunk dünya kurma hattı", desc: "Fikirden prompt'a, oradan fütüristik şehir ve koleksiyon kartı görsellerine.", types: ["text", "image"], category: "style", sub: "cyberpunk", tools: ["chatgpt", "gpt-image"], cover: 71,
    steps: [["Sahne tarifi", "Kısa fikri ayrıntılı bir sahne tarifine çevir.", "Fikrini bir cümleyle yaz.", "text:Midjourney Prompt Generator", "Sahne tarifi"],
            ["Minyatür şehir", "Tarife uygun minyatür siberpunk şehri üret.", "Sahne tarifini [Cyberpunk] alanına uyarla.", "img:71", "Şehir görseli"],
            ["Koleksiyon kartı", "Dünyanın markasını bir koleksiyon kartına işle.", "Şehrin adını ve renk paletini karta taşı.", "img:68", "Kart görseli"]] },
  { user: "emre", title: "Oyun karakteri geliştirme hattı", desc: "Oyun fikrinden karakter konseptine ve koleksiyon kartına.", types: ["text", "image"], category: "art_illustration", sub: "concept_art", tools: ["chatgpt", "gpt-image"], cover: 44,
    steps: [["Oyun tasarımı", "Oyunun dünyasını ve karakter rollerini belirle.", "Türü, dünyayı ve rolleri tanımla.", "text:Game design", "Karakter rolleri"],
            ["Karakter konsepti", "Rolü fiziksel özelliklere dök.", "Generator'daki seçimleri role göre doldur.", "gen:emre:0", "Karakter özellikleri"],
            ["RPG karakter kartı", "Karakteri koleksiyon kartı biçiminde sun.", "Karakterin mesleğini ve yeteneklerini karta işle.", "img:44", "Karakter kartı"]] },
  { user: "ipek", title: "Çocuk kitabı sayfa üretimi", desc: "Hikâye kurgusundan sayfa illüstrasyonuna ve oyuncak çizimine.", types: ["text", "image"], category: "art_illustration", sub: "children_s_illustration", tools: ["chatgpt", "gpt-image"], cover: 97,
    steps: [["Kitap kurgusu", "Sayfa sayfa ilerleyen kısa bir kurgu çıkar.", "Yaş grubunu ve temayı belirt.", "text:Children's Book Creator", "Sayfa metni"],
            ["Sayfa illüstrasyonu", "Sayfa metnine uygun illüstrasyon ayarlarını seç.", "Sayfa metnindeki sahneyi generator alanlarına yansıt.", "gen:ipek:0", "Sayfa tasarımı"],
            ["Sevimli figür", "Ana karakteri örgü oyuncak olarak resimle.", "Karakterin özelliklerini oyuncağa uyarla.", "img:97", "Karakter figürü"]] },
  { user: "selin", title: "Lookbook ve ürün videosu", desc: "Editoryal çekim konseptinden ayakkabı tanıtım videosuna.", types: ["image", "video"], category: "photography", sub: "fashion_photography", tools: ["gpt-image", "veo"], cover: 49,
    steps: [["Editoryal çekim ayarları", "Çekimin ışığını, kıyafetini ve pozunu seç.", "Sezonu ve temayı belirle.", "gen:selin:0", "Çekim konsepti"],
            ["Dergi kapağı", "Konsepti dergi kapağı düzenine yerleştir.", "Konsepti kapak başlığına uyarla.", "img:49", "Kapak görseli"],
            ["Ayakkabı videosu", "Kampanyanın ayakkabısını 360° döndür.", "Kampanya renklerini videoya aktar.", "video:1", "Tanıtım videosu"]] },
  { user: "melis", title: "Tariften yemek videosuna", desc: "Tarif bulmadan yemek fotoğrafı stiline ve buharlı bir tanıtım videosuna.", types: ["text", "image", "video"], category: "photography", sub: "food_photography", tools: ["chatgpt", "gpt-image", "veo"], cover: 63,
    steps: [["Tarif bulma", "Malzemelerine uygun tarifi seç.", "Elindeki malzemeleri yaz.", "text:Recipe Finder", "Seçilen tarif"],
            ["Yemek fotoğrafı stili", "Tarifi fotoğraf stiline ve ışığa bağla.", "Tarifin adını ve sunumunu generator'a gir.", "gen:melis:0", "Fotoğraf stili"],
            ["Buharlı tanıtım", "Sıcak yemeğin buharını videoda öne çıkar.", "Yemeğin cinsine göre prompt'u uyarla.", "video:49", "Yemek videosu"]] },
  { user: "mehmet", title: "Şarkıdan albüm kapağına", desc: "Müzik promptundan albüm kapağı tasarımına ve poster dile.", types: ["audio", "image"], category: "music", sub: "jazz", tools: ["udio", "gpt-image"], cover: 59,
    steps: [["Parçanın stili", "Albümün sesini tanımlayan stil promptunu çalıştır.", "Parçanın ruh halini ve tarzını not et.", "audio:jazzfusion", "Ruh hali ve tarz"],
            ["Kapak tasarımı", "Ruh haline uygun kapak ayarlarını seç.", "Ruh halini renk ve doku seçimine çevir.", "gen:mehmet:2", "Kapak konsepti"],
            ["Tanıtım posteri", "Kapağın dilini albüm posterine taşı.", "Albüm adını poster başlığına yaz.", "img:59", "Poster"]] },
  { user: "burak", title: "Mimari konsept akışı", desc: "Ortam tasarımı brief'inden konsept render'a ve minyatür maket görüntüsüne.", types: ["text", "image"], category: "spaces", sub: "architecture", tools: ["chatgpt", "gpt-image"], cover: 56,
    steps: [["Ortam brief'i", "Mekânın kurallarını ve atmosferini yazdır.", "Arsa, program ve atmosferi tanımla.", "text:Procedural 3D Environment Designer", "Mekân brief'i"],
            ["Konsept render", "Brief'i render ayarlarına dök.", "Stil ve ışık seçimlerini brief'e göre yap.", "gen:burak:0", "Render ayarları"],
            ["Minyatür maket", "Konsepti maket görseline çevir.", "Yapının adını ve formunu uyarla.", "img:56", "Maket görseli"]] },
  { user: "kaan", title: "Arayüz tasarım akışı", desc: "Kullanıcı akışından ekran mockup'ına ve minimalist illüstrasyona.", types: ["text", "image"], category: "design", sub: "ui", tools: ["chatgpt", "gpt-image"], cover: 25,
    steps: [["UX/UI önerileri", "Ürünün akışını ve ekranlarını belirle.", "Ürünü ve hedef kullanıcıyı anlat.", "text:UX/UI Developer", "Ekran listesi"],
            ["Ekran mockup'ı", "Ana ekranın mockup ayarlarını seç.", "Ekran listesinden ana ekranı seç.", "gen:kaan:0", "Mockup ayarları"],
            ["Minimalist illüstrasyon", "Ürüne eşlik edecek minimalist illüstrasyon.", "Ürünün sembolünü illüstrasyona dönüştür.", "img:25", "İllüstrasyon"]] },
  { user: "onur", title: "Veri analizi hattı", desc: "Analiz planı, SQL sorgusu ve Python ile çıktıyı doğrulama.", types: ["text"], category: "coding", sub: "sql", tools: ["chatgpt", "claude"], cover: null,
    steps: [["Analiz planı", "Veri setine uygun analiz yaklaşımını belirle.", "Veri setinin yapısını ve hedefi yaz.", "text:Data Scientist", "Analiz planı"],
            ["SQL ile çekme", "Plana uygun sorguları çalıştır.", "Analiz planındaki metrikleri sorguya çevir.", "text:SQL Terminal", "Sorgu sonuçları"],
            ["Python ile doğrulama", "Sonuçları Python'da yeniden hesapla.", "Sorgu sonuçlarını betikte karşılaştır.", "text:Python Interpreter", "Doğrulama çıktısı"]] },
  { user: "deniz", title: "Seyahat planından kartpostala", desc: "Gezi planı yapıp rotadaki bir noktayı kartpostal görseline dönüştür.", types: ["text", "image"], category: "nature_environment", sub: "landscape", tools: ["chatgpt", "gpt-image"], cover: 94,
    steps: [["Gezi planı", "Süre ve ilgi alanına göre rotayı çıkar.", "Gün sayısını ve bütçeyi yaz.", "text:Travel Planner Prompt", "Rota"],
            ["Kartpostal ayarları", "Rotadaki bir durağı kartpostala çevir.", "Rotadaki en güzel durağı seç.", "gen:deniz:2", "Kartpostal ayarları"],
            ["Simge yapıda selfie", "Durağın simgesiyle eğlenceli bir görsel üret.", "Simge yapıyı ve hayvanları değiştir.", "img:94", "Selfie görseli"]] },
];
