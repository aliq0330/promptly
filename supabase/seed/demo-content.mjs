// Demo hesapların içerikleri — build-demo-seed.mjs bu dosyayı okuyup
// demo-users.sql'i üretir. Görseller loremflickr.com'dan (gerçek Flickr
// fotoğrafları, anahtar kelimeye göre, `lock` ile sabit), avatarlar
// randomuser.me'den geliyor.
//
// Alan kısaltmaları:
//   prompt:    [tür, başlık, açıklama, prompt metni, araç, etiketler, görsel anahtar kelimeleri]
//   request:   [tür, başlık, açıklama, yaratıcı yön, araç, etiketler, durum]   durum: "open" | "closed"
//   generator: [kategori, başlık, açıklama, alt kategori, görsel anahtar kelimeleri, negatif prompt?, alanlar]
//   alan:      [tip, etiket, anahtar (nokta ile jsonPath), seçenekler/varsayılan...]

export const PASSWORD = "ac8d5c55";
export const EMAIL_DOMAIN = "msn.com";

export const USERS = [
  {
    u: "ali", name: "Ali Yılmaz", g: "men", a: 32,
    bio: "Siberpunk şehirler, neon ışıklar ve yağmurlu geceler. Midjourney ile her gece bir sahne.",
    interests: ["Siberpunk", "Bilim Kurgu", "Konsept Sanat"], site: null,
    prompts: [
      ["image", "Yağmurlu Neo-İstanbul Gecesi", "Galata Kulesi'ni siberpunk bir geleceğe taşıdım. Islak zemindeki neon yansımaları için çok uğraştım.", "cyberpunk Istanbul at night, Galata tower covered in holographic billboards, heavy rain, neon reflections on wet cobblestones, flying cars, cinematic lighting, blade runner atmosphere, 35mm, ultra detailed --ar 3:4 --v 6", "Midjourney", ["siberpunk", "neon", "mimari"], "cyberpunk,city,night"],
      ["image", "Neon Sokak Satıcısı", "Gece pazarında ramen satan yaşlı bir robot. Karakterin yüzündeki yorgunluğu yakalamak istedim.", "an old humanoid robot selling ramen at a street food stall in a neon-lit alley, steam rising, rain, warm and cold contrast lighting, detailed rust and scratches, cinematic still, shallow depth of field --ar 4:5", "Midjourney", ["siberpunk", "karakter-tasarimi", "neon"], "neon,street,night"],
      ["image", "Terk Edilmiş Metro İstasyonu", "Bitkilerin geri aldığı fütüristik bir metro. Işık hüzmeleri tavandaki çatlaklardan giriyor.", "abandoned futuristic subway station reclaimed by nature, overgrown vines, god rays through cracked ceiling, dust particles, moody teal and orange palette, post-apocalyptic, octane render --ar 16:9", "Midjourney", ["siberpunk", "surreal", "3d-render"], "subway,abandoned"],
      ["image", "Hologram Kız", "Portre serisinin ilk parçası. Yüzün yarısı hologram, yarısı insan.", "portrait of a young woman, half of her face made of translucent glitching hologram, cyberpunk, pink and cyan rim light, dark background, hyper realistic skin texture, 85mm lens --ar 3:4", "Midjourney", ["portre", "siberpunk", "neon"], "neon,portrait"],
      ["text", "Siberpunk Hikaye Açılışı Promptu", "Hikaye yazarken ilk paragrafı ChatGPT'ye böyle yazdırıyorum, sonrasını ben devam ettiriyorum.", "Write the opening paragraph of a cyberpunk noir short story set in a rainy, overpopulated future Istanbul. The narrator is a burned-out memory broker. Use sensory details (smell, sound, light), short punchy sentences and end with a hook that introduces a mysterious client. Max 150 words.", "ChatGPT", ["yazarlik", "siberpunk"], null],
    ],
    requests: [
      ["image", "Kapadokya'yı siberpunk yapabilecek var mı?", "Peri bacalarını neon tabelalarla, uçan balonları dronelarla değiştiren bir sahne arıyorum. Duvar kağıdı olarak kullanacağım.", "Gün doğumu olsun ama neonlar hâlâ yanık olsun, 16:9", "Midjourney", ["siberpunk", "manzara"], "open"],
      ["image", "Blade Runner tarzı yağmur efekti", "Yağmur damlalarını gerçekçi ve hareketli gösteren bir prompt yapısı lazım. Benimkiler hep düz çizgi gibi çıkıyor.", "Motion blur ve bokeh önemli", "Stable Diffusion", ["siberpunk", "neon"], "open"],
    ],
    generators: [
      ["image", "Siberpunk Şehir Sahnesi Üretici", "Şehir, saat, hava durumu ve ışık seçerek tutarlı siberpunk sahneleri üret.", "Sahne", "cyberpunk,city", "blurry, low quality, daylight, cartoon", [
        ["select", "Şehir", "scene.city", ["İstanbul", "Tokyo", "New York", "Hong Kong", "Berlin"]],
        ["radio", "Saat", "scene.time", ["Gece yarısı", "Alacakaranlık", "Şafak"]],
        ["select", "Hava", "scene.weather", ["Yoğun yağmur", "Sis", "Kar", "Açık"]],
        ["multi_select", "Işık renkleri", "lighting.colors", ["Pembe", "Camgöbeği", "Mor", "Turuncu"]],
        ["toggle", "Uçan araçlar", "scene.flying_cars"],
      ]],
      ["image", "Neon Portre Stüdyosu", "Neon ışıklı portreler için hızlı ayar paneli.", "Portre", "neon,portrait", "deformed, extra fingers, watermark", [
        ["select", "Kişi", "subject.type", ["Genç kadın", "Yaşlı adam", "Android", "Sokak müzisyeni"]],
        ["select", "Işık kurulumu", "lighting.setup", ["İki renkli rim light", "Tek neon tabela", "Tepe ışığı"]],
        ["slider", "Hologram oranı", "subject.hologram", 0, 100, 10, "30"],
        ["select", "Lens", "camera.lens", ["35mm", "50mm", "85mm", "135mm"]],
      ]],
      ["writing", "Noir Karakter Oluşturucu", "Siberpunk noir hikayeler için karakter kartı üretir.", "Karakter", "detective,noir", null, [
        ["select", "Meslek", "character.job", ["Hafıza simsarı", "Kiralık hacker", "Emekli polis", "Kaçak doktor"]],
        ["select", "Takıntı", "character.flaw", ["Kumar", "Geçmiş bir aşk", "Sibernetik bağımlılık", "İntikam"]],
        ["text", "İsim", "character.name"],
        ["slider", "Yaş", "character.age", 18, 80, 1, "42"],
      ]],
    ],
  },
  {
    u: "veli", name: "Veli Demir", g: "men", a: 45,
    bio: "Backend geliştirici. İşimi kolaylaştıran kod promptlarını burada paylaşıyorum. TypeScript & Go.",
    interests: ["Yazılım", "Otomasyon"], site: "https://github.com",
    prompts: [
      ["code", "Kod İnceleme Asistanı", "PR açmadan önce kendi kodumu bu promptla inceletiyorum. Güvenlik açıklarını gerçekten yakalıyor.", "You are a senior software engineer doing a strict code review. Review the following diff for: (1) correctness bugs, (2) security issues (injection, auth, secrets), (3) performance problems, (4) readability. For each finding give: severity, file:line, why it is a problem, and a concrete fix as a code snippet. Do not comment on formatting. If everything is fine, say so explicitly.\n\n{diff}", "Claude", ["kodlama"], null],
      ["code", "SQL Sorgu Optimizasyonu", "Yavaş çalışan Postgres sorgularımı buna veriyorum, EXPLAIN çıktısıyla birlikte.", "Act as a PostgreSQL performance expert. Given the query and its EXPLAIN ANALYZE output below, identify the bottleneck, explain it in plain language, and propose (a) a rewritten query and (b) any indexes to add with the exact CREATE INDEX statement. Mention trade-offs.\n\nQuery:\n{query}\n\nEXPLAIN:\n{explain}", "ChatGPT", ["kodlama"], null],
      ["code", "Birim Testi Yazdırma", "Jest ile test yazmaktan sıkılınca bunu kullanıyorum. Edge case'leri gerçekten düşünüyor.", "Write Jest unit tests for the TypeScript function below. Cover: happy path, edge cases (empty input, null, very large values), and error handling. Use describe/it blocks, meaningful test names in English and no mocks unless necessary.\n\n{code}", "Claude", ["kodlama"], null],
      ["image", "Gece Yarısı Kod Masası", "Kendi çalışma masamın hayali versiyonu. Monitör ışığı ve kahve olmazsa olmaz.", "cozy developer desk at midnight, dual monitors with code, mechanical keyboard, steaming coffee mug, warm desk lamp, rain on window, lofi aesthetic, isometric illustration, soft lighting --ar 4:3", "Midjourney", ["minimalist", "3d-render"], "desk,computer,night"],
    ],
    requests: [
      ["code", "Regex açıklayan prompt", "Karmaşık regex'leri adım adım Türkçe açıklatan bir prompt arıyorum.", "Çıktı tablo şeklinde olsun", "ChatGPT", ["kodlama"], "open"],
      ["code", "Commit mesajı üreten prompt", "git diff'ten Conventional Commits formatında mesaj üretmek istiyorum.", null, "Claude", ["kodlama"], "open"],
      ["image", "Terminal temalı duvar kağıdı", "Siyah arka plan, yeşil yazı, ama modern ve sade bir wallpaper.", "Minimal olsun, 4K", "DALL·E 3", ["minimalist", "retro"], "closed"],
    ],
    generators: [
      ["code", "API Endpoint Dokümantasyonu", "Endpoint bilgilerini girip OpenAPI tarzı açıklama promptu üret.", "Dokümantasyon", "code,computer", null, [
        ["select", "HTTP metodu", "endpoint.method", ["GET", "POST", "PUT", "PATCH", "DELETE"]],
        ["text", "Yol", "endpoint.path"],
        ["select", "Kimlik doğrulama", "endpoint.auth", ["Yok", "Bearer token", "API anahtarı", "Session cookie"]],
        ["toggle", "Sayfalama var", "endpoint.paginated"],
        ["select", "Dil", "output.language", ["Türkçe", "İngilizce"]],
      ]],
      ["code", "Refactor Planı Oluşturucu", "Kod dili, hedef ve kısıtları seç; AI'a adım adım refactor planı yazdır.", "Refactor", "programming,laptop", null, [
        ["select", "Dil", "code.language", ["TypeScript", "Python", "Go", "Java", "PHP"]],
        ["multi_select", "Hedefler", "goals", ["Okunabilirlik", "Performans", "Test edilebilirlik", "Tip güvenliği"]],
        ["radio", "Risk toleransı", "constraints.risk", ["Düşük", "Orta", "Yüksek"]],
        ["toggle", "Davranış değişmemeli", "constraints.no_behavior_change"],
      ]],
      ["code", "SQL Şema Tasarımcısı", "Uygulama türünü seç, tablo ve ilişki önerisi isteyen prompt üret.", "Veritabanı", "database,server", null, [
        ["select", "Uygulama", "app.type", ["E-ticaret", "Sosyal medya", "Rezervasyon", "Blog", "SaaS"]],
        ["select", "Veritabanı", "db.engine", ["PostgreSQL", "MySQL", "SQLite"]],
        ["toggle", "RLS politikaları dahil", "db.rls"],
        ["slider", "Tahmini kullanıcı (bin)", "app.users_k", 1, 1000, 1, "50"],
      ]],
      ["code", "Hata Ayıklama Yardımcısı", "Hata mesajı ve ortam bilgisiyle kök neden analizi promptu.", "Debug", "bug,code", null, [
        ["textarea", "Hata mesajı", "error.message"],
        ["select", "Ortam", "env.runtime", ["Node.js", "Tarayıcı", "Python", "Docker", "Mobil"]],
        ["toggle", "Sadece üretimde oluyor", "env.prod_only"],
      ]],
    ],
  },
  {
    u: "ayse", name: "Ayşe Kaya", g: "women", a: 44,
    bio: "Portre fotoğrafçısı. AI ile ışık denemeleri yapıyorum, gerçek çekimlerime ilham oluyor.",
    interests: ["Fotoğrafçılık", "Portre"], site: null,
    prompts: [
      ["image", "Rembrandt Işığında Anneanne", "Anneannemin eski bir fotoğrafından ilham aldım. Pencere ışığı ve yüzdeki çizgiler.", "portrait of an elderly Turkish grandmother wearing a white headscarf, Rembrandt lighting from a small window, deep wrinkles, gentle smile, dark background, medium format film photography, Kodak Portra 400 --ar 4:5 --style raw", "Midjourney", ["portre"], "grandmother,portrait"],
      ["image", "Altın Saat Tarlasında", "Buğday tarlasında gün batımı portresi. Saçlardaki ışık çok hoşuma gitti.", "young woman standing in a golden wheat field at sunset, backlit hair glowing, lens flare, soft warm tones, candid moment, 85mm f1.4, shallow depth of field, fine art photography --ar 3:4", "Midjourney", ["portre", "manzara"], "wheat,sunset,woman"],
      ["image", "Siyah Beyaz Balıkçı", "Karaköy'de sabah balık tutan bir amca. Kontrast yüksek, dokular net.", "black and white street portrait of an old fisherman in Karaköy Istanbul at dawn, weathered face, cigarette, fishing rod, high contrast, grainy Tri-X film, documentary photography --ar 4:5", "Midjourney", ["portre", "retro"], "fisherman,blackandwhite"],
      ["image", "Pencere Kenarında Kitap", "Loş bir odada kitap okuyan genç. Yumuşak doğal ışık denemesi.", "young man reading a book by the window on a rainy afternoon, soft natural window light, muted colors, cozy knitted sweater, cinematic stillness, 50mm, film look --ar 3:4", "Stable Diffusion", ["portre", "minimalist"], "reading,window"],
    ],
    requests: [
      ["image", "Vesikalık fotoğrafı profesyonel stüdyo portresine çevirmek", "Elimdeki sıradan bir fotoğrafı stüdyo ışığında çekilmiş gibi gösterecek prompt yapısı arıyorum.", "Gri fon, yumuşak ışık", "Stable Diffusion", ["portre"], "open"],
      ["image", "Film grenli düğün fotoğrafı stili", "Analog film hissi veren düğün kareleri için stil promptu lazım.", "Portra 400 renkleri", "Midjourney", ["portre", "retro"], "open"],
    ],
    generators: [
      ["image", "Portre Işık Kurulumu", "Klasik fotoğraf ışık şemalarını tek tıkla prompta çevir.", "Fotoğraf", "portrait,studio", "overexposed, plastic skin, cartoon", [
        ["select", "Işık şeması", "lighting.pattern", ["Rembrandt", "Butterfly", "Split", "Loop", "Broad"]],
        ["select", "Kişi", "subject.type", ["Yaşlı kadın", "Genç adam", "Çocuk", "Orta yaşlı kadın"]],
        ["select", "Film", "camera.film", ["Kodak Portra 400", "Ilford HP5", "Fuji Pro 400H", "Dijital"]],
        ["color", "Fon rengi", "background.color", "#2b2b2b"],
      ]],
      ["image", "Sokak Fotoğrafı Sahnesi", "Şehir, saat ve atmosfer seçerek belgesel tarzı sokak kareleri.", "Sokak", "street,photography", "posed, studio, oversaturated", [
        ["select", "Şehir", "scene.city", ["İstanbul", "İzmir", "Mardin", "Paris", "Havana"]],
        ["radio", "Renk", "style.color", ["Siyah beyaz", "Renkli"]],
        ["select", "Saat", "scene.time", ["Şafak", "Öğle", "Altın saat", "Gece"]],
        ["text", "Ana karakter", "subject.description"],
      ]],
      ["image", "Film Emülasyonu Seçici", "Dijital görsellere analog film karakteri ekleyen stil eki.", "Stil", "film,camera", null, [
        ["select", "Film stoku", "film.stock", ["Portra 400", "Ektar 100", "Tri-X 400", "Cinestill 800T"]],
        ["slider", "Gren", "film.grain", 0, 10, 1, "4"],
        ["toggle", "Işık sızıntısı", "film.light_leak"],
      ]],
    ],
  },
  {
    u: "mehmet", name: "Mehmet Aksoy", g: "men", a: 67,
    bio: "Müzik prodüktörü. Suno ve Udio ile Türk müziği enstrümanlarını modern türlerle harmanlıyorum.",
    interests: ["Müzik", "Prodüksiyon"], site: null,
    prompts: [
      ["music", "Bağlama + Lo-fi Hip Hop", "Bağlama tınısını lo-fi davullarla birleştirdim, ders çalışırken dinlemelik.", "lo-fi hip hop instrumental, 78 bpm, dusty vinyl crackle, warm Turkish bağlama melody as the main hook, soft boom bap drums, mellow Rhodes chords, rain ambience, relaxing, study music", "Suno", ["muzik-uretim"], null],
      ["music", "Anadolu Rock Revival", "70'lerin Anadolu rock'ını modern prodüksiyonla yeniden yorumlama denemesi.", "Anatolian psychedelic rock, 1970s inspired, fuzzy electric saz, groovy bass, live drums, Hammond organ, male vocals in Turkish, modern crisp mix, energetic, 120 bpm", "Suno", ["muzik-uretim", "retro"], null],
      ["music", "Ney ile Ambient", "Meditasyon için uzun, yavaş gelişen bir parça. Ney sesi merkezde.", "ambient meditation track, slow evolving pads, Turkish ney flute improvisation, deep reverb, gentle sub bass drone, no drums, peaceful, spiritual, 8 minutes", "Udio", ["muzik-uretim"], null],
      ["image", "Stüdyoda Gece Seansı", "Kendi stüdyomun sinematik hali. Albüm kapağı için deneme.", "moody music studio at night, analog synthesizers and mixing console glowing, a bağlama leaning against the wall, warm tungsten light, cinematic, shallow depth of field, album cover aesthetic --ar 1:1", "Midjourney", ["muzik-uretim", "neon"], "music,studio"],
      ["music", "Darbuka Drum & Bass", "Hızlı ve enerjik. Darbuka ritimlerini DnB'ye oturtmak zordu ama güzel oldu.", "drum and bass, 174 bpm, live darbuka percussion layered with breakbeats, reese bass, oriental string samples, dark and energetic, festival drop", "Suno", ["muzik-uretim"], null],
    ],
    requests: [
      ["music", "Kemençe ile synthwave olur mu?", "Karadeniz kemençesiyle 80'ler synthwave karışımı istiyorum, prompt denemelerim hep saçma çıkıyor.", "Vokalsiz, 100 bpm civarı", "Suno", ["muzik-uretim", "retro"], "open"],
      ["image", "Albüm kapağı: minimal ve Anadolu motifli", "Kilim desenlerinden ilham alan ama modern, minimal bir kapak lazım.", "Kare format, 2-3 renk", "Midjourney", ["minimalist", "muzik-uretim"], "open"],
    ],
    generators: [
      ["audio", "Füzyon Müzik Promptu", "Bir Türk enstrümanı + bir modern tür seç, Suno'ya hazır prompt al.", "Müzik", "music,instrument", null, [
        ["select", "Enstrüman", "music.instrument", ["Bağlama", "Ney", "Kanun", "Kemençe", "Darbuka", "Ud"]],
        ["select", "Tür", "music.genre", ["Lo-fi", "Drum & Bass", "Synthwave", "Trap", "Ambient", "House"]],
        ["slider", "Tempo (BPM)", "music.bpm", 60, 180, 2, "100"],
        ["radio", "Vokal", "music.vocals", ["Yok", "Kadın", "Erkek", "Koro"]],
        ["select", "Duygu", "music.mood", ["Hüzünlü", "Enerjik", "Sakin", "Karanlık", "Neşeli"]],
      ]],
      ["audio", "Podcast Jingle Üretici", "Kısa intro/outro müzikleri için.", "Jingle", "podcast,microphone", null, [
        ["select", "Süre", "jingle.duration", ["5 saniye", "10 saniye", "15 saniye", "30 saniye"]],
        ["select", "Hava", "jingle.mood", ["Kurumsal", "Eğlenceli", "Gizemli", "Samimi"]],
        ["toggle", "Ses efekti eklensin", "jingle.sfx"],
      ]],
      ["image", "Albüm Kapağı Tasarlayıcı", "Tür ve duyguya göre albüm kapağı görsel promptu.", "Kapak", "vinyl,album", "text, letters, watermark, blurry", [
        ["select", "Müzik türü", "album.genre", ["Rock", "Elektronik", "Caz", "Hip hop", "Folk"]],
        ["select", "Görsel stil", "style.art", ["Kolaj", "Minimal", "Fotoğraf", "İllüstrasyon", "Retro poster"]],
        ["multi_select", "Renkler", "style.palette", ["Siyah", "Kırmızı", "Hardal", "Lacivert", "Krem"]],
      ]],
    ],
  },
  {
    u: "zeynep", name: "Zeynep Çelik", g: "women", a: 68,
    bio: "Edebiyat öğretmeni ve şair. Yapay zekayı yazma atölyelerimde öğrencilerle birlikte kullanıyorum.",
    interests: ["Şiir", "Yazarlık", "Eğitim"], site: null,
    prompts: [
      ["text", "Haiku Atölyesi Promptu", "Öğrencilerime haiku yapısını öğretirken kullandığım prompt. 5-7-5 kuralını açıklatıyor.", "Sen bir şiir öğretmenisin. Bana {mevsim} mevsimiyle ilgili 3 Türkçe haiku yaz. Her birinde 5-7-5 hece yapısını koru ve her haikudan sonra hecelerini parantez içinde say. Son olarak hangisinin neden en güçlü olduğunu tek cümleyle açıkla.", "ChatGPT", ["siir", "yazarlik"], null],
      ["text", "Karakter Mektubu Egzersizi", "Romandaki bir karakterin başka birine mektup yazması. Öğrencilerin empatisi için harika.", "Suç ve Ceza'daki Raskolnikov'un kız kardeşi Dunya'ya hapisten yazdığı bir mektubu yaz. Dostoyevski'nin iç monolog üslubunu taklit et, pişmanlık ve gurur arasındaki çelişkiyi hissettir. 250 kelimeyi geçmesin.", "Claude", ["yazarlik"], null],
      ["text", "Serbest Şiir: Şehir ve Yalnızlık", "Kalabalıkta yalnızlık temalı serbest şiirler için başlangıç promptu.", "Write a free verse poem in Turkish about feeling lonely in a crowded city ferry crossing the Bosphorus. Use concrete images (simit, seagulls, tea glasses), avoid clichés like 'kalbim' and 'gözyaşı', and end on an unexpected, quiet image.", "ChatGPT", ["siir"], null],
      ["image", "Şiirin Görseli: Vapur", "Yukarıdaki şiirim için hazırladığım görsel.", "a lonely woman on a crowded Istanbul ferry, seagulls, tea glass in hand, overcast sky, melancholic, soft watercolor illustration style, muted blue and grey palette --ar 4:5", "Midjourney", ["siir", "manzara"], "ferry,istanbul"],
    ],
    requests: [
      ["text", "Lise öğrencileri için yaratıcı yazma ısınma soruları", "Derse girişte 5 dakikalık ısınma için ilginç yazma soruları üreten prompt.", "Yaş grubu 15-17", "ChatGPT", ["yazarlik"], "open"],
      ["text", "Aruz vezni kontrolü yapan prompt", "Divan şiiri örneklerinde aruz kalıbını tespit ettirmek istiyorum. Mümkün mü?", null, "Claude", ["siir"], "open"],
    ],
    generators: [
      ["writing", "Şiir Üretici", "Tema, biçim ve ton seç; şiir yazdırma promptu hazır.", "Şiir", "poetry,book", null, [
        ["select", "Biçim", "poem.form", ["Serbest", "Haiku", "Sone", "Koşma", "Rubai"]],
        ["text", "Tema", "poem.theme"],
        ["select", "Ton", "poem.tone", ["Hüzünlü", "Umutlu", "İronik", "Nostaljik"]],
        ["slider", "Dize sayısı", "poem.lines", 3, 30, 1, "12"],
      ]],
      ["writing", "Yazma Atölyesi Egzersizi", "Öğretmenler için sınıf seviyesine göre yazma egzersizi.", "Eğitim", "classroom,writing", null, [
        ["select", "Seviye", "class.level", ["Ortaokul", "Lise", "Üniversite", "Yetişkin"]],
        ["select", "Tür", "exercise.genre", ["Öykü", "Şiir", "Deneme", "Mektup", "Diyalog"]],
        ["slider", "Süre (dk)", "exercise.minutes", 5, 60, 5, "15"],
        ["toggle", "Değerlendirme ölçütü ekle", "exercise.rubric"],
      ]],
      ["writing", "Kitap Özeti ve Analiz", "Kitap adı gir, seviyene uygun özet ve tema analizi al.", "Analiz", "books,library", null, [
        ["text", "Kitap adı", "book.title"],
        ["radio", "Uzunluk", "summary.length", ["Kısa", "Orta", "Detaylı"]],
        ["multi_select", "Odak", "analysis.focus", ["Karakterler", "Temalar", "Semboller", "Tarihsel bağlam"]],
      ]],
    ],
  },
  {
    u: "can", name: "Can Öztürk", g: "men", a: 11,
    bio: "Kısa film yönetmeni. Runway ve Sora ile storyboard ve konsept video çalışıyorum.",
    interests: ["Film", "Video", "Sinematografi"], site: null,
    prompts: [
      ["video", "Kapadokya Balon Timelapse", "Gün doğumunda yükselen balonlar. Kamera yavaşça sağa kayıyor.", "cinematic drone shot at sunrise over Cappadocia, dozens of hot air balloons rising slowly, fairy chimneys below, slow lateral camera move to the right, golden light, volumetric haze, 24fps, film grain, 8 seconds", "Runway Gen-3", ["video-uretim", "manzara"], null],
      ["video", "Tek Plan Kovalamaca", "Dar sokaklarda tek plan kovalamaca sahnesi denemesi.", "handheld one-take chase scene through narrow old town alleys at night, runner seen from behind, camera following closely, flickering street lamps, laundry lines overhead, tense atmosphere, realistic motion blur, 10 seconds", "Sora", ["video-uretim"], null],
      ["image", "Storyboard: Deniz Feneri", "Kısa filmimin açılış karesi için konsept.", "cinematic still of a lonely lighthouse keeper standing on rocks during a storm, huge waves crashing, lighthouse beam cutting through rain, anamorphic lens flare, teal and orange grading, 2.39:1 aspect ratio --ar 21:9", "Midjourney", ["video-uretim", "manzara"], "lighthouse,storm"],
      ["video", "Kahve Reklamı Makro Çekim", "Müşteri için hazırladığım 6 saniyelik kahve reklamı denemesi.", "extreme macro slow motion shot of espresso pouring into a white cup, crema forming swirls, warm backlight, steam rising, dark background, commercial product video, 120fps look, 6 seconds", "Runway Gen-3", ["video-uretim"], null],
      ["image", "Karakter Konsepti: Yaşlı Kaptan", "Aynı filmin ana karakteri.", "portrait of a weathered old sea captain with a grey beard and a knitted beanie, piercing blue eyes, rain on his face, harbor lights in background, cinematic lighting, shot on Arri Alexa --ar 4:5", "Midjourney", ["portre", "karakter-tasarimi"], "sailor,oldman"],
    ],
    requests: [
      ["video", "Tutarlı karakterle birden fazla sahne", "Aynı karakteri 3-4 farklı video sahnesinde tutarlı göstermenin prompt yöntemi var mı?", "Runway veya Kling olabilir", "Runway Gen-3", ["video-uretim", "karakter-tasarimi"], "open"],
      ["video", "Dolly zoom (Vertigo efekti)", "Hitchcock'un vertigo efektini AI videoda elde etmek istiyorum.", null, "Sora", ["video-uretim"], "open"],
      ["image", "Kısa film afişi", "Deniz feneri temalı gerilim filmim için afiş lazım.", "Başlık alanı boş kalsın", "Midjourney", ["video-uretim"], "closed"],
    ],
    generators: [
      ["video", "Sinematik Çekim Tarifi", "Kamera hareketi, lens ve ışığı seçerek video promptu oluştur.", "Çekim", "cinema,camera", "shaky, low resolution, text, watermark", [
        ["select", "Kamera hareketi", "camera.movement", ["Dolly in", "Pan sola", "Crane up", "Handheld", "Orbit", "Sabit"]],
        ["select", "Lens", "camera.lens", ["Anamorfik", "24mm geniş", "50mm", "Makro"]],
        ["select", "Işık", "lighting.mood", ["Altın saat", "Mavi saat", "Neon gece", "Kapalı hava"]],
        ["slider", "Süre (sn)", "video.duration_seconds", 3, 20, 1, "8"],
        ["toggle", "Ağır çekim", "video.slow_motion"],
      ]],
      ["video", "Ürün Reklam Videosu", "Ürün türü ve stil seç, kısa reklam videosu promptu al.", "Reklam", "product,commercial", null, [
        ["select", "Ürün", "product.type", ["Kahve", "Parfüm", "Saat", "Ayakkabı", "Telefon"]],
        ["select", "Stil", "ad.style", ["Makro lüks", "Enerjik", "Minimal", "Doğa içinde"]],
        ["color", "Ana renk", "ad.color", "#c08457"],
      ]],
      ["image", "Storyboard Karesi", "Sahne açıklamasından geniş ekran storyboard karesi.", "Storyboard", "film,scene", null, [
        ["textarea", "Sahne", "shot.description"],
        ["radio", "Çekim ölçeği", "shot.size", ["Geniş", "Orta", "Yakın", "Detay"]],
        ["radio", "Görünüm", "shot.look", ["Renkli", "Siyah beyaz karakalem"]],
      ]],
      ["video", "Müzik Klibi Konsepti", "Şarkının duygusuna göre klip sahnesi fikri.", "Klip", "concert,stage", null, [
        ["select", "Tür", "music.genre", ["Pop", "Rock", "Rap", "Elektronik", "Akustik"]],
        ["select", "Mekan", "scene.location", ["Terk edilmiş fabrika", "Sahil", "Çatı katı", "Metro", "Orman"]],
        ["toggle", "Performans çekimi", "scene.performance"],
      ]],
    ],
  },
  {
    u: "elif", name: "Elif Şahin", g: "women", a: 21,
    bio: "Anime ve manga çizeri 🌸 AI'ı eskiz ve renk denemeleri için kullanıyorum.",
    interests: ["Anime", "İllüstrasyon"], site: null,
    prompts: [
      ["image", "Sakura Altında Okul Çıkışı", "Klasik bir anime sahnesi ama İstanbul'da! Arka plan Kadıköy.", "anime style, high school girl walking home under cherry blossom trees in Kadıköy Istanbul, petals falling, golden afternoon light, Makoto Shinkai inspired sky, detailed background, soft colors --niji 6 --ar 3:4", "Niji Journey", ["anime", "manzara"], "cherryblossom,street"],
      ["image", "Kedi Kafe Barista", "Kedi kulaklı barista karakter tasarımım.", "cute anime barista girl with cat ears, apron, holding latte art, cozy cat cafe background with sleeping cats, warm pastel palette, character sheet style, clean lineart --niji 6 --ar 4:5", "Niji Journey", ["anime", "karakter-tasarimi"], "cat,cafe"],
      ["image", "Ghibli Tarzı Yağmurlu Köy", "Karadeniz köyünü Ghibli filmlerindeki gibi hayal ettim.", "Studio Ghibli inspired Black Sea village in the rain, wooden houses on green hills, tea plantations, fog, a small girl with a red umbrella, hand-painted watercolor background, nostalgic --ar 16:9", "Midjourney", ["anime", "manzara", "fantastik"], "village,rain,hills"],
      ["image", "Chibi Ejderha", "Sticker olarak bastıracağım minik ejderha.", "chibi baby dragon, big sparkling eyes, pastel mint scales, tiny wings, sitting on a cloud, sticker design with white outline, kawaii, flat colors, simple background --niji 6 --ar 1:1", "Niji Journey", ["anime", "fantastik"], "dragon,toy"],
      ["image", "Neon Tokyo Kız", "Siberpunk ve anime karışımı gece sahnesi.", "anime girl with headphones standing in neon-lit Tokyo street at night, rain, reflections, city pop aesthetic, 80s anime style, cel shading, vibrant pink and blue --niji 6 --ar 3:4", "Niji Journey", ["anime", "neon", "retro"], "tokyo,night"],
    ],
    requests: [
      ["image", "Aynı karakteri farklı pozlarda çizdirme", "Kendi OC'mi 5 farklı pozda tutarlı çizdirmek istiyorum.", "Character sheet formatı", "Niji Journey", ["anime", "karakter-tasarimi"], "open"],
      ["image", "90'lar anime ekran görüntüsü efekti", "VHS ve cel animasyon hissi veren prompt eki arıyorum.", "Hafif bulanık, 4:3", "Midjourney", ["anime", "retro"], "open"],
    ],
    generators: [
      ["image", "Anime Karakter Tasarlayıcı", "Saç, göz, kıyafet ve stili seç; karakter sheet promptu hazır.", "Karakter", "anime,illustration", "extra limbs, bad hands, blurry, realistic", [
        ["select", "Saç rengi", "character.hair_color", ["Pembe", "Gümüş", "Siyah", "Mavi", "Kızıl"]],
        ["select", "Göz rengi", "character.eye_color", ["Mor", "Yeşil", "Altın", "Mavi"]],
        ["select", "Kıyafet", "character.outfit", ["Okul üniforması", "Kimono", "Siberpunk ceket", "Büyücü cüppesi"]],
        ["select", "Stil", "style.anime", ["Modern anime", "90'lar cel", "Ghibli", "Chibi"]],
        ["toggle", "Character sheet (çoklu poz)", "output.sheet"],
      ]],
      ["image", "Anime Arka Plan Üretici", "Shinkai tarzı detaylı arka planlar için.", "Arka plan", "landscape,sky", null, [
        ["select", "Mekan", "scene.location", ["Tren istasyonu", "Okul çatısı", "Sahil kasabası", "Şehir kavşağı", "Orman tapınağı"]],
        ["select", "Gökyüzü", "scene.sky", ["Pembe gün batımı", "Yıldızlı gece", "Yağmur sonrası", "Kümülüs bulutlar"]],
        ["toggle", "İnsan olmasın", "scene.no_people"],
      ]],
      ["image", "Sticker Tasarımı", "Sevimli sticker'lar için sade prompt.", "Sticker", "sticker,cute", "background clutter, text", [
        ["text", "Karakter", "sticker.subject"],
        ["select", "İfade", "sticker.emotion", ["Mutlu", "Uykulu", "Kızgın", "Şaşkın", "Aşık"]],
        ["color", "Ana renk", "sticker.color", "#f9a8d4"],
      ]],
    ],
  },
  {
    u: "burak", name: "Burak Arslan", g: "men", a: 52,
    bio: "Mimar. Konsept aşamasında AI render'ları kullanıyorum, müşteriye ilk fikri 10 dakikada gösteriyorum.",
    interests: ["Mimari", "3D", "İç Mekan"], site: null,
    prompts: [
      ["image", "Ege'de Taş Villa", "Bodrum'da bir müşteri için ilk konsept. Yerel taş ve beyaz sıva.", "modern minimalist villa on a hillside in Bodrum, local stone walls and white plaster, infinity pool overlooking the Aegean sea, olive trees, late afternoon sun, architectural photography, 24mm tilt-shift --ar 16:9", "Midjourney", ["mimari", "minimalist"], "villa,sea"],
      ["image", "Brütalist Kütüphane İçi", "Beton ve doğal ışık. Merdivenlerin ritmi çok hoşuma gitti.", "interior of a brutalist public library, raw concrete, massive skylight, sunbeams, floating staircases, warm wooden shelves, people reading, architectural visualization, V-Ray render --ar 3:4", "Midjourney", ["mimari", "3d-render"], "library,concrete"],
      ["image", "Japandi Salon", "Japon ve İskandinav karışımı sade bir oturma odası.", "japandi living room interior, low wooden furniture, linen sofa, paper lamp, bonsai, neutral beige palette, soft diffused light, clean lines, interior design magazine photo --ar 4:3", "Stable Diffusion", ["mimari", "minimalist"], "livingroom,interior"],
      ["image", "Dikey Orman Kulesi", "Şehir içinde yeşil bir gökdelen fikri.", "futuristic residential skyscraper covered with vertical forest gardens, balconies full of trees, sustainable architecture, Istanbul skyline in the background, sunny day, photorealistic render --ar 3:4", "Midjourney", ["mimari", "3d-render"], "skyscraper,green"],
    ],
    requests: [
      ["image", "Kesit (section) çizimi stili", "Mimari kesit çizimlerini AI'a yaptırmak mümkün mü? Siyah beyaz teknik çizim tarzı.", "Beyaz zemin, ince çizgiler", "Stable Diffusion", ["mimari", "minimalist"], "open"],
      ["image", "Eski konağın restorasyon sonrası hali", "Ahşap bir Osmanlı konağının restore edilmiş halini görselleştirmek istiyorum.", "Gerçekçi fotoğraf", "Midjourney", ["mimari", "retro"], "open"],
    ],
    generators: [
      ["design", "Mimari Konsept Render", "Yapı türü, malzeme ve çevreyi seç; render promptu üret.", "Mimari", "architecture,building", "distorted perspective, people blur, low detail", [
        ["select", "Yapı", "building.type", ["Villa", "Kütüphane", "Otel", "Ofis kulesi", "Kafe", "Müze"]],
        ["multi_select", "Malzemeler", "building.materials", ["Beton", "Ahşap", "Taş", "Cam", "Çelik", "Tuğla"]],
        ["select", "Çevre", "site.context", ["Deniz kenarı", "Orman", "Şehir merkezi", "Çöl", "Dağ"]],
        ["select", "Saat", "lighting.time", ["Sabah", "Öğle", "Gün batımı", "Gece"]],
      ]],
      ["design", "İç Mekan Stil Seçici", "Oda ve stil seç, iç mimari görselleştirme promptu al.", "İç mekan", "interior,room", null, [
        ["select", "Oda", "room.type", ["Salon", "Yatak odası", "Mutfak", "Banyo", "Çalışma odası"]],
        ["select", "Stil", "room.style", ["Japandi", "Endüstriyel", "Boho", "Modern klasik", "Minimalist"]],
        ["color", "Vurgu rengi", "room.accent", "#8b6b4a"],
        ["toggle", "Bitkiler", "room.plants"],
      ]],
      ["design", "Peyzaj Tasarımı", "Bahçe ve peyzaj konseptleri için.", "Peyzaj", "garden,landscape", null, [
        ["select", "Alan", "garden.type", ["Avlu", "Çatı bahçesi", "Kır bahçesi", "Zen bahçesi"]],
        ["select", "İklim", "garden.climate", ["Akdeniz", "Ilıman", "Kurak"]],
        ["toggle", "Su öğesi", "garden.water"],
      ]],
    ],
  },
  {
    u: "selin", name: "Selin Koç", g: "women", a: 12,
    bio: "Moda editörü ✦ Kampanya fikirleri ve lookbook konseptleri üretiyorum.",
    interests: ["Moda", "Ürün Fotoğrafı"], site: null,
    prompts: [
      ["image", "Kapalıçarşı Moda Çekimi", "Tarihi mekanda modern bir koleksiyon fikri.", "high fashion editorial photoshoot inside the Grand Bazaar Istanbul, model wearing an oversized emerald silk suit, patterned lanterns, rich textures, dramatic lighting, Vogue style, 50mm --ar 4:5", "Midjourney", ["portre"], "fashion,model"],
      ["image", "Minimal Çanta Lookbook", "Beyaz fonda yumuşak gölgeli ürün çekimi.", "minimalist product photo of a caramel leather handbag on a white plinth, soft shadows, beige background, luxury brand aesthetic, studio lighting, high detail texture --ar 1:1", "Midjourney", ["minimalist"], "handbag,leather"],
      ["image", "Sokak Stili: Kadıköy", "Gündelik ama iddialı kombinler.", "street style fashion photo in Kadıköy Istanbul, young woman wearing a vintage leather jacket, wide leg jeans and chunky sneakers, candid walking shot, natural light, film look --ar 3:4", "Stable Diffusion", ["portre", "retro"], "streetstyle,fashion"],
      ["image", "Kum Tepelerinde Koleksiyon", "Yaz koleksiyonu için çöl temalı kampanya.", "fashion campaign in desert sand dunes, model in flowing terracotta linen dress, strong wind, golden hour, long shadows, minimal composition, editorial photography --ar 3:4", "Midjourney", ["portre", "manzara"], "desert,dunes"],
    ],
    requests: [
      ["image", "Ürün fotoğrafında gerçekçi yansıma", "Parlak yüzeyde gerçekçi yansıma alamıyorum. Parfüm şişesi için yardım!", "Siyah akrilik zemin", "Midjourney", ["minimalist", "3d-render"], "open"],
      ["image", "Sonbahar lookbook konsepti", "Kahve ve bordo tonlarında 6 karelik lookbook fikri.", null, "Midjourney", ["portre"], "open"],
    ],
    generators: [
      ["image", "Moda Editoryal Çekim", "Kıyafet, mekan ve ışık seçerek dergi çekimi promptu.", "Moda", "fashion,editorial", "deformed hands, cheap fabric, blurry", [
        ["text", "Kıyafet", "outfit.description"],
        ["select", "Mekan", "scene.location", ["Stüdyo", "Tarihi çarşı", "Çöl", "Çatı katı", "Sahil"]],
        ["select", "Işık", "lighting.style", ["Sert flaş", "Yumuşak doğal", "Altın saat", "Dramatik"]],
        ["select", "Dergi stili", "style.magazine", ["Vogue", "Kinfolk", "i-D", "Harper's Bazaar"]],
      ]],
      ["marketing", "Ürün Fotoğrafı Kurulumu", "E-ticaret ve kampanya ürün çekimleri için.", "Ürün", "product,photography", "text, logo, clutter", [
        ["select", "Ürün", "product.type", ["Çanta", "Parfüm", "Ayakkabı", "Takı", "Kozmetik"]],
        ["select", "Zemin", "scene.surface", ["Beyaz fon", "Mermer", "Kum", "Akrilik", "Keten"]],
        ["color", "Arka plan rengi", "scene.background", "#f5efe6"],
        ["toggle", "Gölge dramatik", "lighting.hard_shadow"],
      ]],
      ["image", "Kombin Önerici", "Mevsim ve etkinliğe göre kombin görseli.", "Stil", "outfit,clothes", null, [
        ["select", "Mevsim", "outfit.season", ["İlkbahar", "Yaz", "Sonbahar", "Kış"]],
        ["select", "Etkinlik", "outfit.event", ["İş", "Düğün", "Hafta sonu", "Gece"]],
        ["multi_select", "Renkler", "outfit.colors", ["Bej", "Siyah", "Bordo", "Haki", "Beyaz"]],
      ]],
    ],
  },
  {
    u: "emre", name: "Emre Güneş", g: "men", a: 76,
    bio: "Bağımsız oyun geliştiricisi. Konsept sanat, dünya kurma ve NPC diyalogları için AI kullanıyorum.",
    interests: ["Oyun", "Fantastik", "Dünya Kurma"], site: null,
    prompts: [
      ["image", "Kayıp Orman Tapınağı", "Oyunumun ikinci bölümü için ortam konsepti.", "ancient overgrown temple in a misty fantasy forest, giant tree roots wrapping stone pillars, glowing blue runes, shafts of light, a small adventurer for scale, painterly concept art, artstation trending --ar 16:9", "Midjourney", ["fantastik", "manzara"], "temple,forest"],
      ["image", "Cüce Demirci", "NPC karakter tasarımı. Sakalındaki örgüler detaylı olsun istedim.", "dwarf blacksmith character design, braided red beard with metal rings, leather apron, glowing forge behind, holding a hammer, fantasy RPG style, detailed full body, concept art --ar 3:4", "Midjourney", ["fantastik", "karakter-tasarimi"], "blacksmith,forge"],
      ["text", "NPC Diyalog Üretici", "Oyundaki tüccar NPC'ler için dallanan diyaloglar.", "Create a branching dialogue for a fantasy RPG merchant NPC named Old Tobin who secretly works for the thieves guild. Include: a greeting, 3 player choices (friendly, suspicious, threatening), and 2 responses for each. Keep each line under 25 words and give him a distinct verbal tic.", "ChatGPT", ["yazarlik", "fantastik"], null],
      ["image", "Piksel Art Kasaba", "Retro oyun havası için piksel kasaba.", "pixel art fantasy village at dusk, 16-bit style, cozy houses with warm lit windows, river and wooden bridge, fireflies, top-down 3/4 view, limited color palette --ar 16:9", "Stable Diffusion", ["retro", "fantastik"], "village,medieval"],
      ["code", "Unity Envanter Sistemi", "Envanter sistemini sıfırdan yazdırırken kullandığım prompt.", "Write a clean, extensible inventory system for Unity in C#. Requirements: ScriptableObject item definitions, stackable items with max stack size, add/remove/split stack methods, events when inventory changes, and a simple example of saving to JSON. Explain the architecture briefly first.", "Claude", ["kodlama"], null],
    ],
    requests: [
      ["image", "İzometrik oyun haritası", "Strateji oyunum için izometrik ada haritası stili lazım.", "Tile'lara bölünebilir olsun", "Midjourney", ["fantastik", "3d-render"], "open"],
      ["text", "Oyun lore'u için mitoloji üretimi", "Türk mitolojisinden esinlenen özgün tanrılar ve efsaneler ürettirmek istiyorum.", null, "Claude", ["yazarlik", "fantastik"], "open"],
    ],
    generators: [
      ["image", "RPG Karakter Konsepti", "Irk, sınıf ve ekipman seç; konsept sanat promptu al.", "Karakter", "knight,armor", "bad anatomy, blurry, text", [
        ["select", "Irk", "character.race", ["İnsan", "Elf", "Cüce", "Ork", "Yarı ejder"]],
        ["select", "Sınıf", "character.class", ["Savaşçı", "Büyücü", "Hırsız", "Şifacı", "Okçu"]],
        ["multi_select", "Ekipman", "character.gear", ["Kılıç", "Kalkan", "Asa", "Yay", "Pelerin", "Miğfer"]],
        ["select", "Sanat stili", "style.art", ["Boyalı konsept", "Anime", "Piksel art", "Gerçekçi"]],
        ["toggle", "Tam boy", "shot.full_body"],
      ]],
      ["image", "Oyun Ortamı Üretici", "Biyom ve atmosfer seçerek seviye konsepti.", "Ortam", "fantasy,landscape", null, [
        ["select", "Biyom", "env.biome", ["Orman", "Çöl", "Buz", "Volkanik", "Bataklık", "Yeraltı"]],
        ["select", "Atmosfer", "env.mood", ["Gizemli", "Huzurlu", "Tehlikeli", "Epik"]],
        ["radio", "Kamera", "env.camera", ["Yandan", "İzometrik", "Birinci şahıs"]],
      ]],
      ["writing", "Görev (Quest) Tasarımcısı", "Yan görev fikirleri ve ödül yapısı.", "Görev", "map,adventure", null, [
        ["select", "Görev türü", "quest.type", ["Kurtarma", "Teslimat", "Gizem", "Avlanma", "Koruma"]],
        ["slider", "Zorluk", "quest.difficulty", 1, 10, 1, "5"],
        ["toggle", "Ahlaki ikilem içersin", "quest.moral_choice"],
        ["text", "Mekan adı", "quest.location"],
      ]],
      ["code", "Oyun Mekaniği Kodlayıcı", "Motor ve mekanik seç, kod yazdırma promptu.", "Kod", "gamepad,computer", null, [
        ["select", "Motor", "engine.name", ["Unity", "Godot", "Unreal", "Phaser"]],
        ["select", "Mekanik", "mechanic.type", ["Çift zıplama", "Diyalog sistemi", "Envanter", "Kaydet/Yükle", "Düşman yapay zekası"]],
        ["toggle", "Yorum satırları", "code.comments"],
      ]],
    ],
  },
  {
    u: "deniz", name: "Deniz Yıldız", g: "men", a: 23,
    bio: "Doğa fotoğrafçısı ve dağcı. Gerçekte göremediğim manzaraları AI ile tamamlıyorum.",
    interests: ["Doğa", "Manzara", "Seyahat"], site: null,
    prompts: [
      ["image", "Kaçkarlar'da Sis Denizi", "Yayla sabahı, bulutların üstünde.", "sea of clouds over the Kaçkar mountains at sunrise, wooden plateau houses on a green ridge, soft pink light, layered mountains fading into mist, landscape photography, 70-200mm compression --ar 16:9", "Midjourney", ["manzara"], "mountains,fog"],
      ["image", "Salda Gölü Gece Gökyüzü", "Samanyolu ve beyaz kum. Uzun pozlama hissi.", "Milky Way over Lake Salda at night, white shores reflecting starlight, turquoise water, long exposure, astrophotography, crisp stars, a lone tent glowing --ar 3:4", "Midjourney", ["manzara", "uzay"], "milkyway,lake"],
      ["image", "Kuzey Işıkları Altında Kulübe", "Hayalimdeki kış tatili.", "small red wooden cabin in snowy Lapland under vivid green northern lights, snow-covered pines, warm light in the window, deep blue night, landscape photography --ar 16:9", "Midjourney", ["manzara"], "aurora,cabin"],
      ["image", "Yağmur Ormanında Şelale", "Yeşilin her tonu.", "hidden waterfall in a lush tropical rainforest, moss-covered rocks, ferns, soft mist, long exposure silky water, rays of sunlight, vibrant greens, nature photography --ar 3:4", "Stable Diffusion", ["manzara"], "waterfall,jungle"],
      ["image", "Kapadokya Kış Sabahı", "Karla kaplı peri bacaları.", "snow-covered fairy chimneys in Cappadocia at dawn, a few hot air balloons in a pastel sky, quiet winter morning, soft light, wide landscape photography --ar 16:9", "Midjourney", ["manzara"], "cappadocia,snow"],
    ],
    requests: [
      ["image", "Drone fotoğrafı perspektifi", "Tepeden (top-down) gerçekçi drone kareleri için prompt yapısı?", "Kıyı şeridi, dalgalar", "Midjourney", ["manzara"], "open"],
      ["image", "Aynı manzara dört mevsim", "Tek bir göl manzarasını 4 mevsimde tutarlı göstermek istiyorum.", "Kompozisyon aynı kalmalı", "Stable Diffusion", ["manzara"], "open"],
    ],
    generators: [
      ["image", "Manzara Fotoğrafı Üretici", "Yer, mevsim, saat ve lens seçerek manzara promptu.", "Manzara", "landscape,nature", "oversaturated, hdr halo, people, text", [
        ["select", "Yer", "scene.place", ["Dağlar", "Göl", "Sahil", "Orman", "Çöl", "Kanyon"]],
        ["select", "Mevsim", "scene.season", ["İlkbahar", "Yaz", "Sonbahar", "Kış"]],
        ["select", "Saat", "scene.time", ["Şafak", "Altın saat", "Mavi saat", "Gece"]],
        ["select", "Lens", "camera.lens", ["14mm ultra geniş", "35mm", "70-200mm tele"]],
        ["toggle", "Uzun pozlama", "camera.long_exposure"],
      ]],
      ["image", "Astrofotoğraf Sahnesi", "Gece gökyüzü kareleri için.", "Gece", "stars,night", null, [
        ["select", "Gökyüzü", "sky.object", ["Samanyolu", "Kuzey ışıkları", "Yıldız izi", "Dolunay"]],
        ["select", "Ön plan", "scene.foreground", ["Çadır", "Tek ağaç", "Kaya", "Kulübe"]],
        ["slider", "Işık kirliliği", "sky.light_pollution", 0, 10, 1, "1"],
      ]],
      ["image", "Seyahat Kartpostalı", "Şehir ve stil seçerek kartpostal görseli.", "Seyahat", "travel,city", null, [
        ["text", "Şehir", "postcard.city"],
        ["select", "Stil", "postcard.style", ["Vintage poster", "Suluboya", "Fotoğraf", "Minimal çizim"]],
        ["toggle", "Şehir adı yazısı", "postcard.title_text"],
      ]],
    ],
  },
  {
    u: "ceren", name: "Ceren Aydın", g: "women", a: 33,
    bio: "Dijital pazarlama uzmanı. Reklam metinleri, sosyal medya içerikleri ve kampanya fikirleri.",
    interests: ["Pazarlama", "Metin Yazarlığı"], site: null,
    prompts: [
      ["text", "Instagram Carousel Metni", "Tek bir fikirden 7 slaytlık carousel metni çıkarıyor. Etkileşim ciddi arttı.", "Sen deneyimli bir sosyal medya metin yazarısın. \"{konu}\" hakkında 7 slaytlık bir Instagram carousel metni yaz. 1. slayt merak uyandıran bir kanca, 2-6. slaytlar her biri tek bir fikir (maks 20 kelime), 7. slayt net bir eylem çağrısı olsun. Samimi, sen dilinde ve emojisiz yaz.", "ChatGPT", ["yazarlik"], null],
      ["text", "Ürün Açıklaması (E-ticaret)", "SEO uyumlu ve satış odaklı ürün açıklamaları.", "Write an SEO-friendly Turkish product description for {ürün}. Structure: a 1-sentence emotional hook, 3 bullet benefits (not features), a short paragraph about materials/usage, and a closing line that reduces purchase anxiety (return policy, warranty). Naturally include the keywords: {anahtar_kelimeler}. Max 120 words.", "Claude", ["yazarlik"], null],
      ["text", "Marka Sesi Analizi", "Rakip markaların iletişim dilini analiz ettiriyorum.", "Analyze the brand voice of the following 5 social media posts. Describe the tone in 3 adjectives, list recurring phrases, the average sentence length, how they use humor, and give me 3 example posts written in the SAME voice for a different product. Posts:\n{posts}", "Claude", ["yazarlik"], null],
      ["image", "Kahve Kampanyası Görseli", "Sonbahar kahve kampanyası için sosyal medya görseli.", "flat lay of a pumpkin spice latte on a rustic wooden table, autumn leaves, cinnamon sticks, knitted scarf, warm cozy tones, top-down view, instagram ad style, copy space on the left --ar 4:5", "Midjourney", ["minimalist"], "latte,autumn"],
    ],
    requests: [
      ["text", "LinkedIn için hikaye anlatımı", "Kuru B2B içerikleri hikayeye çeviren bir prompt yapısı arıyorum.", "Profesyonel ama samimi", "ChatGPT", ["yazarlik"], "open"],
      ["image", "Reklam görselinde metin alanı bırakmak", "AI görsellerinde başlık yazacak boş alanı nasıl garantiliyorsunuz?", null, "Midjourney", ["minimalist"], "open"],
      ["text", "E-posta konu satırı A/B testi", "Açılma oranı yüksek 10 farklı konu satırı üreten prompt.", null, "ChatGPT", ["yazarlik"], "closed"],
    ],
    generators: [
      ["marketing", "Reklam Metni Üretici", "Platform, hedef kitle ve tonu seç; reklam metni promptu hazır.", "Reklam", "advertising,marketing", null, [
        ["select", "Platform", "ad.platform", ["Instagram", "Google Ads", "LinkedIn", "TikTok", "E-posta"]],
        ["text", "Ürün / Hizmet", "ad.product"],
        ["select", "Hedef kitle", "audience.segment", ["Öğrenciler", "Yeni ebeveynler", "KOBİ sahipleri", "Profesyoneller", "Emekliler"]],
        ["select", "Ton", "ad.tone", ["Samimi", "Esprili", "Premium", "Aciliyet"]],
        ["slider", "Varyasyon sayısı", "ad.variants", 1, 10, 1, "3"],
      ]],
      ["marketing", "İçerik Takvimi Planlayıcı", "Bir aylık sosyal medya içerik takvimi promptu.", "Planlama", "calendar,planning", null, [
        ["select", "Sektör", "brand.industry", ["Kafe", "Butik", "Yazılım", "Güzellik", "Eğitim"]],
        ["slider", "Haftalık gönderi", "plan.posts_per_week", 1, 14, 1, "4"],
        ["multi_select", "Formatlar", "plan.formats", ["Reels", "Carousel", "Story", "Tek görsel", "Canlı yayın"]],
      ]],
      ["writing", "SEO Blog Taslağı", "Anahtar kelime ve niyet seç, başlık yapısı dahil blog taslağı.", "SEO", "blog,laptop", null, [
        ["text", "Ana anahtar kelime", "seo.keyword"],
        ["select", "Arama niyeti", "seo.intent", ["Bilgi", "Karşılaştırma", "Satın alma", "Nasıl yapılır"]],
        ["slider", "Kelime sayısı", "post.words", 500, 3000, 100, "1200"],
        ["toggle", "SSS bölümü", "post.faq"],
      ]],
      ["image", "Sosyal Medya Görseli", "Kampanya görselleri için boş metin alanlı kompozisyon.", "Görsel", "flatlay,coffee", "text, watermark, logo", [
        ["text", "Ürün", "visual.product"],
        ["select", "Kompozisyon", "visual.layout", ["Flat lay", "Yakın çekim", "Yaşam tarzı", "Minimal ürün"]],
        ["radio", "Boş alan", "visual.copy_space", ["Sol", "Sağ", "Üst", "Yok"]],
      ]],
    ],
  },
  {
    u: "kaan", name: "Kaan Polat", g: "men", a: 5,
    bio: "UI/UX tasarımcı. Wireframe'den moodboard'a, AI'ı tasarım sürecimin her adımında deniyorum.",
    interests: ["UI/UX", "Tasarım", "Minimalizm"], site: "https://dribbble.com",
    prompts: [
      ["image", "Fintech Uygulaması Dashboard", "Koyu tema bir finans uygulaması için moodboard.", "dark mode fintech mobile app dashboard UI, glassmorphism cards, purple and teal gradients, balance chart, recent transactions list, clean typography, Dribbble shot, high fidelity mockup on iPhone --ar 3:4", "Midjourney", ["minimalist", "3d-render"], "smartphone,app"],
      ["image", "3D İkon Seti", "Uygulama içi ikonlar için yumuşak 3D stil.", "set of 9 soft 3D icons for a productivity app (calendar, bell, folder, chart, chat, settings, star, cloud, lock), clay render, pastel lavender and mint, isometric, white background, Blender style --ar 1:1", "Midjourney", ["3d-render", "minimalist"], "icons,3d"],
      ["text", "UX Mikro Metin Promptu", "Hata mesajlarını insancıl yapmak için.", "Rewrite the following error messages for a Turkish mobile banking app so they are: human, calm, never blame the user, max 12 words, and always include what the user can do next. Give 2 alternatives for each.\n{errors}", "Claude", ["yazarlik"], null],
      ["image", "Landing Page Hero", "Yapay zeka startup'ı için hero bölümü konsepti.", "website hero section for an AI startup, minimal layout, large headline area, abstract flowing lavender 3D shape on the right, soft gradients, lots of whitespace, modern sans-serif, web design mockup --ar 16:9", "Midjourney", ["minimalist", "soyut"], "abstract,gradient"],
    ],
    requests: [
      ["image", "Wireframe'i yüksek sadakatli tasarıma çevirme", "El çizimi wireframe'imi hi-fi mockup'a çevirecek prompt nasıl olmalı?", "Mobil, açık tema", "Stable Diffusion", ["minimalist"], "open"],
      ["text", "Kullanıcı görüşmesi soruları", "Yeni bir özellik için keşif görüşmesi soru listesi üreten prompt.", null, "ChatGPT", ["yazarlik"], "open"],
    ],
    generators: [
      ["design", "UI Ekran Mockup'ı", "Uygulama türü, ekran ve tema seçerek UI görsel promptu.", "UI", "app,interface", "blurry text, distorted layout, lorem ipsum", [
        ["select", "Uygulama", "app.type", ["Fintech", "Fitness", "Yemek siparişi", "Seyahat", "Müzik"]],
        ["select", "Ekran", "screen.name", ["Ana sayfa", "Profil", "Ödeme", "Onboarding", "Ayarlar"]],
        ["radio", "Tema", "screen.theme", ["Açık", "Koyu"]],
        ["color", "Marka rengi", "brand.color", "#7c3aed"],
        ["select", "Stil", "style.ui", ["Glassmorphism", "Neumorphism", "Flat", "Brutalist"]],
      ]],
      ["design", "İkon Seti Tasarlayıcı", "Tutarlı ikon setleri için.", "İkon", "icons,design", null, [
        ["text", "Tema", "icons.theme"],
        ["select", "Stil", "icons.style", ["3D clay", "Çizgi (outline)", "Dolu (filled)", "Gradient"]],
        ["slider", "İkon sayısı", "icons.count", 4, 16, 1, "9"],
      ]],
      ["writing", "UX Yazım Asistanı", "Buton, hata ve boş durum metinleri.", "UX Writing", "writing,notebook", null, [
        ["select", "Metin türü", "copy.type", ["Hata mesajı", "Boş durum", "Buton", "Onboarding", "Bildirim"]],
        ["select", "Ton", "copy.tone", ["Sakin", "Neşeli", "Resmi", "Kısa ve net"]],
        ["textarea", "Bağlam", "copy.context"],
      ]],
    ],
  },
  {
    u: "melis", name: "Melis Erdem", g: "women", a: 57,
    bio: "Yemek blogger'ı ve food stylist 🍋 Tarif görselleri ve menü tasarımları.",
    interests: ["Yemek", "Fotoğrafçılık"], site: null,
    prompts: [
      ["image", "Menemen, Sabah Işığı", "Klasik bir Türk kahvaltısı. Tavadaki buharı çok sevdim.", "rustic Turkish menemen in a copper pan on a wooden table, steam rising, fresh bread, tea in tulip glass, olives, morning window light, food photography, 45 degree angle, shallow depth of field --ar 4:5", "Midjourney", ["minimalist"], "breakfast,food"],
      ["image", "Limonlu Tart Flat Lay", "Pastel tonlarda tatlı çekimi.", "lemon meringue tart flat lay on a pastel blue linen, lemon slices, powdered sugar, vintage fork, soft diffused daylight, minimal food styling, editorial --ar 1:1", "Midjourney", ["minimalist"], "tart,lemon"],
      ["text", "Buzdolabındakilerle Tarif", "Elde ne varsa ona göre tarif öneriyor, israf azaldı.", "Buzdolabımda şunlar var: {malzemeler}. Bunlarla 30 dakikada hazırlanabilecek 3 farklı akşam yemeği tarifi öner. Her biri için: malzeme listesi (eksik olan varsa belirt), adım adım yapılışı, kalori tahmini. Mümkünse Türk mutfağından olsun.", "ChatGPT", ["yazarlik"], null],
      ["image", "Karanlık Tonlu Çikolatalı Kek", "Dark food photography denemesi.", "moody dark food photography of a rich chocolate cake slice with dripping ganache, raspberries, cocoa powder dusting, black slate background, dramatic side light, low key --ar 4:5", "Stable Diffusion", ["minimalist"], "chocolate,cake"],
      ["image", "Ege Mezeleri Sofrası", "Rakı sofrası için geniş kare.", "overhead shot of an Aegean meze table, fava, grilled octopus, stuffed grape leaves, sea bass, lemon, olive oil, white tablecloth, summer evening light by the sea, food editorial photography --ar 16:9", "Midjourney", ["minimalist"], "meze,seafood"],
    ],
    requests: [
      ["image", "Restoran menüsü için yemek görselleri", "Aynı ışık ve açıyla 10 yemeği tutarlı çekmek istiyorum.", "Beyaz tabak, gri zemin", "Midjourney", ["minimalist"], "open"],
      ["text", "Diyetisyen onaylı haftalık plan", "Vejetaryen ve yüksek proteinli haftalık menü promptu.", null, "ChatGPT", ["yazarlik"], "open"],
    ],
    generators: [
      ["image", "Yemek Fotoğrafı Stilisti", "Yemek, açı, ışık ve zemin seçerek food photography promptu.", "Yemek", "food,plate", "plastic food, oversaturated, messy, text", [
        ["text", "Yemek", "dish.name"],
        ["select", "Açı", "camera.angle", ["Tepeden (flat lay)", "45 derece", "Göz hizası", "Makro"]],
        ["select", "Işık", "lighting.mood", ["Aydınlık", "Karanlık (moody)", "Pencere ışığı", "Gün batımı"]],
        ["select", "Zemin", "scene.surface", ["Ahşap", "Mermer", "Keten", "Arduvaz", "Beton"]],
        ["toggle", "Buhar", "dish.steam"],
      ]],
      ["writing", "Tarif Oluşturucu", "Mutfak, süre ve diyet tercihiyle tarif promptu.", "Tarif", "cooking,kitchen", null, [
        ["select", "Mutfak", "recipe.cuisine", ["Türk", "İtalyan", "Japon", "Meksika", "Hint"]],
        ["slider", "Süre (dk)", "recipe.minutes", 10, 120, 5, "30"],
        ["multi_select", "Diyet", "recipe.diet", ["Vejetaryen", "Vegan", "Glutensiz", "Yüksek protein", "Düşük karbonhidrat"]],
        ["slider", "Kişi sayısı", "recipe.servings", 1, 10, 1, "2"],
      ]],
      ["design", "Menü Tasarımı", "Restoran menüsü görsel konsepti.", "Menü", "restaurant,menu", null, [
        ["select", "Restoran türü", "menu.venue", ["Kahvaltıcı", "Meyhane", "Kafe", "Fine dining", "Burgerci"]],
        ["select", "Stil", "menu.style", ["Vintage", "Minimal", "El çizimi", "Modern"]],
        ["color", "Ana renk", "menu.color", "#1f3a2e"],
      ]],
      ["image", "Kahve Çekimi", "Barista ve kahve dükkanı görselleri.", "Kahve", "coffee,cup", null, [
        ["select", "İçecek", "drink.type", ["Espresso", "Latte art", "Türk kahvesi", "Soğuk demleme", "Filtre"]],
        ["select", "Ortam", "scene.place", ["Kafe barı", "Ev masası", "Açık hava", "Stüdyo"]],
        ["toggle", "Eller kadrajda", "scene.hands"],
      ]],
    ],
  },
  {
    u: "onur", name: "Onur Kılıç", g: "men", a: 88,
    bio: "Veri bilimci. LLM'lerle veri temizleme, analiz ve otomasyon üzerine çalışıyorum.",
    interests: ["Veri Bilimi", "Yapay Zeka", "Python"], site: null,
    prompts: [
      ["code", "Pandas Veri Temizleme", "Dağınık CSV'leri temizletmek için adım adım plan.", "You are a senior data scientist. I will give you the first 20 rows and df.info() of a messy CSV. Write a pandas cleaning pipeline that: fixes dtypes, standardizes date formats, trims/normalizes text columns, handles missing values (explain the strategy per column), removes duplicates and flags outliers with IQR. Return one function clean(df) -> df with comments.\n\n{sample}", "ChatGPT", ["kodlama"], null],
      ["code", "Açıklayıcı Veri Analizi Raporu", "Yeni bir veri seti geldiğinde ilk yaptığım şey.", "Given this dataset description and columns, write a Python notebook outline for exploratory data analysis: univariate distributions, correlations, target leakage checks, class imbalance, and 5 hypotheses worth testing. Use seaborn for plots and explain what to look for in each chart.\n\n{schema}", "Claude", ["kodlama"], null],
      ["text", "Metin Sınıflandırma Etiketleyici", "Müşteri yorumlarını kategorilere ayırtan prompt. JSON dönüyor.", "Classify each customer review below into exactly one of these categories: [kargo, ürün kalitesi, fiyat, müşteri hizmetleri, diğer] and give a sentiment score from -1 to 1. Respond ONLY with a JSON array of objects: {\"id\", \"category\", \"sentiment\", \"reason\"}. Reason must be max 10 words in Turkish.\n\n{reviews}", "Claude", ["kodlama", "yazarlik"], null],
      ["image", "Veri Görselleştirme Sanatı", "Verinin kendisi sanat olabilir mi diye denedim.", "abstract data visualization art, thousands of glowing particles forming flowing network graphs, deep navy background, cyan and magenta nodes, generative art, high resolution, elegant --ar 16:9", "Midjourney", ["soyut", "neon"], "network,abstract"],
    ],
    requests: [
      ["code", "SQL'den doğal dile açıklama", "Karmaşık SQL sorgularını iş birimlerine anlatacak dilde açıklayan prompt.", "Teknik olmayan okuyucu", "ChatGPT", ["kodlama"], "open"],
      ["code", "Sentetik veri üretimi", "Gerçekçi ama kişisel veri içermeyen test verisi ürettirmek istiyorum.", null, "Claude", ["kodlama"], "open"],
    ],
    generators: [
      ["code", "Veri Analizi Promptu", "Veri türü ve hedefi seç; analiz planı promptu üret.", "Analiz", "data,chart", null, [
        ["select", "Veri türü", "data.kind", ["Satış", "Web trafiği", "Anket", "Sensör", "Finans"]],
        ["select", "Hedef", "analysis.goal", ["Trend bulma", "Tahmin", "Segmentasyon", "Anomali tespiti"]],
        ["select", "Araç", "analysis.tool", ["pandas", "SQL", "R", "Excel"]],
        ["toggle", "Görselleştirme kodu dahil", "analysis.plots"],
      ]],
      ["code", "Makine Öğrenmesi Model Seçici", "Problem tipine göre model ve metrik önerisi.", "ML", "robot,technology", null, [
        ["radio", "Problem", "ml.task", ["Sınıflandırma", "Regresyon", "Kümeleme", "Zaman serisi"]],
        ["slider", "Satır sayısı (bin)", "data.rows_k", 1, 10000, 10, "100"],
        ["toggle", "Açıklanabilirlik önemli", "ml.explainable"],
        ["select", "Kütüphane", "ml.library", ["scikit-learn", "XGBoost", "PyTorch", "statsmodels"]],
      ]],
      ["text", "JSON Çıkarıcı", "Serbest metinden yapılandırılmış JSON çıkartan prompt.", "Çıkarım", "document,paper", null, [
        ["textarea", "Alanlar (virgülle)", "schema.fields"],
        ["select", "Kaynak metin", "source.type", ["E-posta", "Fatura", "CV", "Müşteri yorumu", "Sözleşme"]],
        ["toggle", "Eksik alanları null yap", "schema.nullable"],
      ]],
    ],
  },
  {
    u: "ipek", name: "İpek Tunç", g: "women", a: 79,
    bio: "Çocuk kitabı illüstratörü 🎨 Suluboya dokuları ve sıcak hikayeler.",
    interests: ["İllüstrasyon", "Çocuk Kitapları"], site: null,
    prompts: [
      ["image", "Ormanda Kayıp Tilki", "Yeni kitabımın kahramanı. Suluboya dokusu olsun istedim.", "children's book illustration of a small red fox lost in a big friendly autumn forest, gentle watercolor textures, warm orange and ochre palette, soft pencil lines, whimsical, cozy, storybook page --ar 4:3", "Midjourney", ["fantastik", "manzara"], "fox,forest"],
      ["image", "Aya Merdiven Kuran Çocuk", "Hayal gücü temalı bir sayfa.", "a little boy building a wooden ladder to the moon on a hill at night, stars, sleeping village below, dreamy gouache illustration, deep blues and warm yellow moonlight, picture book style --ar 3:4", "Midjourney", ["fantastik", "uzay"], "moon,night"],
      ["text", "Uyku Öncesi Masal Promptu", "Oğluma her akşam yeni bir masal. Ahlaki mesaj zorla verilmiyor.", "5 yaşındaki bir çocuk için {kahraman} ile ilgili, 3 dakikada okunabilecek bir uyku öncesi masalı yaz. Masalda tekrar eden sevimli bir cümle olsun, korkutucu öğe olmasın, sonunda sakinleştirici bir kapanış olsun. Ders verme, göster.", "ChatGPT", ["yazarlik"], null],
      ["image", "Bahçedeki Dev Kurbağa", "Mizahi bir sayfa denemesi.", "a giant friendly frog sitting in a tiny garden next to a surprised grandmother holding a watering can, humorous children's book illustration, colored pencil and watercolor, pastel greens --ar 4:3", "Midjourney", ["fantastik"], "frog,garden"],
    ],
    requests: [
      ["image", "Aynı karakter kitap boyunca tutarlı", "Tilki karakterim her sayfada farklı çıkıyor. Tutarlılık için prompt tüyosu?", "Suluboya stilini kaybetmeden", "Midjourney", ["karakter-tasarimi", "fantastik"], "open"],
      ["text", "Çocuk kitabı için kafiyeli metin", "3-5 yaş için kısa, kafiyeli sayfa metinleri.", null, "Claude", ["siir", "yazarlik"], "open"],
    ],
    generators: [
      ["image", "Çocuk Kitabı Sayfası", "Karakter, sahne ve teknik seçerek masal kitabı illüstrasyonu.", "İllüstrasyon", "watercolor,painting", "scary, dark, realistic photo, text", [
        ["text", "Kahraman", "character.description"],
        ["select", "Sahne", "scene.place", ["Orman", "Deniz altı", "Uzay", "Kasaba", "Bahçe"]],
        ["select", "Teknik", "style.medium", ["Suluboya", "Guaj", "Renkli kalem", "Kolaj"]],
        ["select", "Duygu", "scene.mood", ["Neşeli", "Huzurlu", "Heyecanlı", "Uykulu"]],
      ]],
      ["writing", "Masal Yazarı", "Yaş grubu ve temaya göre masal promptu.", "Masal", "children,book", null, [
        ["select", "Yaş", "story.age", ["2-4", "5-7", "8-10"]],
        ["text", "Tema", "story.theme"],
        ["slider", "Okuma süresi (dk)", "story.minutes", 1, 15, 1, "5"],
        ["toggle", "Kafiyeli", "story.rhyme"],
      ]],
      ["image", "Boyama Sayfası", "Çocuklar için siyah beyaz boyama sayfası.", "Boyama", "coloring,drawing", "shading, gray tones, color", [
        ["text", "Konu", "page.subject"],
        ["radio", "Zorluk", "page.difficulty", ["Kolay", "Orta", "Detaylı"]],
      ]],
    ],
  },
  {
    u: "baran", name: "Baran Doğan", g: "men", a: 61,
    bio: "Astronomi meraklısı ve bilim kurgu okuru 🚀 Uzay sahneleri ve retro-futurizm.",
    interests: ["Uzay", "Bilim Kurgu", "Retro"], site: null,
    prompts: [
      ["image", "Satürn Halkalarında Madenci", "Uzay madencisi konsepti. Halkaların ışığı çok zordu.", "lone asteroid miner in a bulky spacesuit standing on an icy moonlet inside Saturn's rings, massive planet filling the sky, harsh sunlight, cinematic sci-fi, realistic, ultra wide --ar 16:9", "Midjourney", ["uzay", "3d-render"], "space,planet"],
      ["image", "Retro-Fütürist Ay Üssü", "60'ların bilim kurgu poster tarzı.", "retro-futuristic moon base, 1960s pulp sci-fi poster style, rocket on launch pad, domes, astronauts in fishbowl helmets, Earth in the sky, bold flat colors, grain texture --ar 3:4", "Midjourney", ["uzay", "retro"], "rocket,retro"],
      ["image", "Nebula İçinde Uzay Gemisi", "Devasa bir koloni gemisi.", "colossal generation ship drifting through a colorful nebula, tiny shuttles for scale, volumetric gas clouds in purple and orange, epic space opera, digital painting --ar 16:9", "Midjourney", ["uzay", "fantastik"], "nebula,galaxy"],
      ["text", "Bilim Kurgu Dünya Kurma", "Hard sci-fi hikayelerim için tutarlı bir evren kurduruyorum.", "Help me design a hard science fiction setting in the year 2400. Constraints: no faster-than-light travel, humans live in the asteroid belt and on Mars. Describe: 3 factions and their economic basis, communication delay problems, one technology that changed everything, and a brewing conflict. Stay physically plausible and cite the real science idea behind each element.", "Claude", ["yazarlik", "uzay"], null],
      ["image", "Mars'ta Sera", "Kızıl gezegende ilk domates.", "inside a greenhouse dome on Mars, rows of tomato plants under pink grow lights, red dusty landscape visible through the glass, an astronaut botanist smiling, realistic sci-fi, warm tones --ar 4:5", "Stable Diffusion", ["uzay"], "greenhouse,plants"],
    ],
    requests: [
      ["image", "Kara delik görselleştirmesi", "Interstellar'daki Gargantua gibi bilimsel olarak doğru bir kara delik.", "Akresyon diski belirgin", "Midjourney", ["uzay"], "open"],
      ["text", "Bilim kurgu kısa öykü fikirleri", "Tek cümlelik, sıra dışı 20 öykü fikri üreten prompt.", null, "ChatGPT", ["yazarlik", "uzay"], "open"],
    ],
    generators: [
      ["image", "Uzay Sahnesi Üretici", "Gök cismi, araç ve stil seçerek uzay sahneleri.", "Uzay", "space,stars", "blurry stars, low detail, text", [
        ["select", "Gök cismi", "scene.body", ["Satürn", "Mars", "Kara delik", "Nebula", "Ay", "Dış gezegen"]],
        ["select", "Araç", "scene.vehicle", ["Yok", "Koloni gemisi", "Mekik", "Uzay istasyonu", "Keşif robotu"]],
        ["select", "Stil", "style.art", ["Gerçekçi", "Retro poster", "Anime", "Dijital boyama"]],
        ["toggle", "Astronot", "scene.astronaut"],
      ]],
      ["writing", "Bilim Kurgu Öykü Tohumu", "Yıl, teknoloji ve çatışma seçerek öykü başlangıcı.", "Öykü", "planet,scifi", null, [
        ["slider", "Yıl", "world.year", 2050, 5000, 50, "2400"],
        ["select", "Teknoloji", "world.tech", ["Bilinç yükleme", "Terraforming", "Yapay zeka yönetimi", "Zaman bükülmesi"]],
        ["select", "Çatışma", "story.conflict", ["Kaynak savaşı", "İlk temas", "İsyan", "Salgın"]],
        ["radio", "Uzunluk", "story.length", ["Paragraf", "Sayfa", "Bölüm"]],
      ]],
      ["image", "Retro Bilim Kurgu Posteri", "50-60'lar pulp sci-fi posterleri.", "Poster", "retro,poster", null, [
        ["text", "Konu", "poster.subject"],
        ["select", "Dönem", "poster.era", ["1950'ler", "1960'lar", "1970'ler"]],
        ["multi_select", "Renkler", "poster.palette", ["Turuncu", "Turkuaz", "Krem", "Kırmızı", "Lacivert"]],
      ]],
      ["other", "Gökyüzü Gözlem Planı", "Konum ve tarihe göre gözlem listesi hazırlatan prompt.", "Astronomi", "telescope,night", null, [
        ["text", "Konum", "obs.location"],
        ["select", "Ekipman", "obs.gear", ["Çıplak göz", "Dürbün", "Küçük teleskop", "Büyük teleskop"]],
        ["select", "İlgi", "obs.target", ["Gezegenler", "Derin uzay", "Meteor yağmurları", "Ay"]],
      ]],
    ],
  },
  {
    u: "ece", name: "Ece Yavuz", g: "women", a: 36,
    bio: "Marka ve logo tasarımcısı. Az ama öz ◯",
    interests: ["Logo", "Marka", "Tipografi"], site: null,
    prompts: [
      ["image", "Minimal Kahve Logosu", "Bir mahalle kahvecisi için logo konsepti.", "minimalist logo for a neighborhood coffee roastery called 'Semt', single line art coffee bean merging with a house silhouette, flat vector, dark brown on cream background, simple and memorable --ar 1:1", "Midjourney", ["minimalist"], "coffee,logo"],
      ["image", "Geometrik Hayvan Amblemleri", "Geometrik formlarla hayvan logoları serisi.", "set of geometric animal emblems (fox, owl, bear, deer), built from circles and triangles, flat vector logo design, limited palette of navy and coral, grid-based, clean --ar 1:1", "Midjourney", ["minimalist", "soyut"], "geometric,pattern"],
      ["text", "Marka İsmi Fikir Üretici", "Yeni markalar için isim beyin fırtınası.", "Generate 20 brand name ideas for {sektör} targeting {hedef kitle}. Mix: 5 Turkish real words, 5 invented words that are easy to pronounce in both Turkish and English, 5 compound names, 5 abstract names. For each give a one-line rationale and check it is max 2 syllables where possible. Avoid names of existing big brands.", "ChatGPT", ["yazarlik"], null],
      ["image", "Ambalaj Tasarımı: Zeytinyağı", "Butik zeytinyağı markası için şişe ve etiket.", "premium olive oil bottle packaging design, minimalist label with an elegant olive branch line illustration, matte dark green glass, product shot on stone surface, soft natural light, luxury branding --ar 3:4", "Midjourney", ["minimalist", "3d-render"], "olive,bottle"],
      ["image", "Soyut Marka Dokusu", "Kurumsal kimlik için arka plan dokusu.", "abstract brand pattern with soft organic shapes in lavender, sage and cream, risograph print texture, modern corporate identity background, seamless --ar 16:9", "Stable Diffusion", ["soyut", "minimalist"], "abstract,shapes"],
    ],
    requests: [
      ["image", "Monogram logo", "E ve Y harflerinden zarif bir monogram istiyorum.", "Serif, siyah beyaz", "Midjourney", ["minimalist"], "open"],
      ["image", "Kurumsal kimlik mockup seti", "Kartvizit, antetli kağıt, zarf aynı karede.", "Doğal ışık, üstten çekim", "Midjourney", ["minimalist"], "open"],
    ],
    generators: [
      ["design", "Logo Konsept Üretici", "Sektör, stil ve renk seçerek logo promptu.", "Logo", "logo,design", "text, letters, gradients, photorealistic, mockup", [
        ["text", "Marka adı", "brand.name"],
        ["select", "Sektör", "brand.industry", ["Kahve", "Teknoloji", "Moda", "Sağlık", "Eğitim", "Gıda"]],
        ["select", "Stil", "logo.style", ["Tek çizgi", "Geometrik", "Monogram", "Maskot", "Amblem"]],
        ["color", "Ana renk", "logo.color", "#1e3a8a"],
        ["toggle", "Negatif alan kullanımı", "logo.negative_space"],
      ]],
      ["design", "Ambalaj Tasarımı", "Ürün ve malzemeye göre ambalaj görseli.", "Ambalaj", "packaging,box", null, [
        ["select", "Ürün", "package.product", ["Zeytinyağı", "Çay", "Kozmetik", "Çikolata", "Bal"]],
        ["select", "Malzeme", "package.material", ["Cam", "Kraft kağıt", "Teneke", "Seramik"]],
        ["select", "Stil", "package.style", ["Lüks minimal", "Rustik", "Renkli pop", "Vintage"]],
      ]],
      ["writing", "Marka Hikayesi Yazarı", "Kuruluş hikayesi ve slogan önerileri.", "Marka", "notebook,brand", null, [
        ["text", "Marka", "brand.name"],
        ["select", "Ton", "brand.voice", ["Samimi", "Lüks", "Cesur", "Güvenilir"]],
        ["slider", "Slogan sayısı", "output.slogans", 1, 10, 1, "5"],
      ]],
    ],
  },
];

// Diğer kullanıcıların isteklere verdiği yanıtlar:
// [istek sahibi, istek sırası (0'dan), yanıtlayan, başlık, açıklama, prompt metni, araç, görsel anahtar kelimeleri, seçildi mi]
export const RESPONSES = [
  ["ali", 0, "deniz", "Neon Kapadokya — Şafak", "Gün doğumu ışığıyla neonları dengelemek için 'twilight' kelimesi işe yaradı.", "Cappadocia fairy chimneys covered in glowing neon signs and holographic ads, drones instead of hot air balloons, twilight dawn sky, mist in the valleys, cyberpunk landscape, ultra wide --ar 16:9", "Midjourney", "cappadocia,balloons", true],
  ["ali", 0, "baran", "Kapadokya 2099", "Biraz daha bilim kurgu tarafına çektim.", "Cappadocia in the year 2099, carved rock houses with neon windows, flying drones with light trails, pastel dawn, cinematic sci-fi matte painting --ar 16:9", "Midjourney", "cappadocia,night", false],
  ["veli", 0, "onur", "Regex Açıklayıcı (Tablolu)", "Her parçayı tabloda açıklıyor, sonunda örnek eşleşmeler veriyor.", "Aşağıdaki regex'i parçalarına ayır ve Türkçe açıkla. Çıktıyı | Parça | Anlamı | Örnek | sütunlarıyla bir tablo olarak ver. Tablodan sonra eşleşen 3 ve eşleşmeyen 3 örnek string yaz, nedenlerini belirt.\n\nRegex: {regex}", "ChatGPT", null, true],
  ["veli", 1, "kaan", "Conventional Commit Üretici", "Scope'u dosya yollarından tahmin ediyor.", "Given the following git diff, write a commit message in Conventional Commits format. Infer the type (feat, fix, refactor, docs, test, chore) and a short scope from the changed file paths. Subject max 60 chars, imperative mood, then a blank line and a 2-3 bullet body explaining WHY.\n\n{diff}", "Claude", null, false],
  ["ayse", 0, "selin", "Stüdyo Portresi Dönüşümü", "Gri fon + softbox tarifini prompta ekledim.", "professional studio headshot, neutral grey seamless backdrop, large softbox key light at 45 degrees, subtle fill, catchlights in eyes, natural skin texture, sharp focus, 85mm f/2.8, corporate portrait --ar 4:5", "Stable Diffusion", "headshot,studio", true],
  ["mehmet", 0, "elif", "Kemençe Synthwave", "Kemençeyi lead synth gibi kullandım, sonuç şaşırtıcı!", "80s synthwave instrumental, 100 bpm, Black Sea kemençe playing the lead melody like a synth lead, gated reverb drums, warm analog bass arpeggios, neon nostalgic mood, no vocals", "Suno", null, false],
  ["zeynep", 0, "ceren", "Yazma Isınma Kartları", "Her soruyu bir kartta veriyor, öğrenciler çekiliş gibi seçiyor.", "Lise öğrencileri (15-17 yaş) için 5 dakikalık yaratıcı yazma ısınması olarak 10 soru üret. Sorular sıra dışı olsun (örn. 'Bir eşyanın gözünden dünü anlat'), tek cümlelik olsun ve her birinin yanına hangi yazma becerisini geliştirdiğini parantez içinde yaz.", "ChatGPT", null, true],
  ["can", 0, "emre", "Karakter Tutarlılığı Tarifi", "Önce tek bir referans karesi üretip onu image-to-video ile besliyorum.", "Step 1 prompt (reference still): full body shot of a young woman with short silver hair, yellow raincoat, red scarf, neutral pose, plain background. Step 2 for each scene: use the reference as image input and describe only the action and environment, repeating the exact outfit keywords: 'short silver hair, yellow raincoat, red scarf'.", "Runway Gen-3", null, false],
  ["elif", 1, "ipek", "90'lar Cel Anime Efekti", "VHS tracking çizgileri ve hafif renk kayması ekledim.", "90s anime screencap, cel animation, soft film grain, slight VHS color bleeding, 4:3 aspect ratio, muted pastel palette, hand-painted background, retro anime aesthetic --niji 6 --ar 4:3", "Niji Journey", "anime,retro", true],
  ["burak", 1, "melis", "Restore Edilmiş Konak", "Cumbaları ve ahşap kepenkleri öne çıkardım.", "restored Ottoman wooden mansion (konak) in Safranbolu, freshly painted white walls with dark wood beams, bay windows, red tiled roof, flower pots, sunny afternoon, realistic architectural photography --ar 3:4", "Midjourney", "house,wooden", false],
  ["selin", 0, "ece", "Siyah Akrilikte Parfüm", "Yansıma için 'glossy black acrylic, mirror reflection' ikilisi şart.", "luxury perfume bottle on glossy black acrylic surface, perfect mirror reflection, single rim light, dark gradient background, high-end product photography, crisp glass refractions --ar 4:5", "Midjourney", "perfume,bottle", true],
  ["emre", 1, "zeynep", "Türk Mitolojisinden Tanrılar", "Kök Tengri inancından ilham, ama özgün isimlerle.", "Türk-Moğol mitolojisinden (Tengri, Umay, Erlik vb.) ilham alan ama tamamen özgün 5 tanrı yarat. Her biri için: isim, alanı, sembolü, kutsal hayvanı, bir kısa efsane (80 kelime) ve oyuncuya verebileceği bir nimet. Gerçek mitolojiyi birebir kopyalama.", "Claude", null, false],
  ["deniz", 0, "can", "Top-Down Drone Sahil", "90 derece açıyı 'directly overhead' ile garantiliyorum.", "aerial drone photo directly overhead, turquoise waves washing onto a white sand beach, foam patterns, a few colorful umbrellas, crisp detail, summer, 90 degree top-down view --ar 4:5", "Midjourney", "beach,aerial", true],
  ["kaan", 0, "veli", "Wireframe → Hi-Fi", "ControlNet lineart ile yapıyı koruyorum.", "high fidelity mobile app UI, light theme, based on the provided wireframe layout (use ControlNet lineart), clean sans-serif typography, soft shadows, rounded cards, lavender accent color, Dribbble quality --ar 9:16", "Stable Diffusion", "smartphone,design", false],
  ["melis", 0, "ayse", "Menü İçin Tutarlı Çekim", "Aynı seed ve sabit ışık tarifini bütün yemeklerde tekrarlıyorum.", "{yemek} served on a plain white round plate, grey concrete background, 45 degree angle, soft window light from the left, same styling for every dish, clean restaurant menu photography --ar 1:1 --seed 4242", "Midjourney", "plate,restaurant", true],
  ["baran", 0, "ali", "Gargantua Tarzı Kara Delik", "Kütleçekimsel merceklenme için 'gravitational lensing' şart.", "scientifically accurate black hole with a glowing accretion disk bent by gravitational lensing, Interstellar Gargantua inspired, photon ring, stars distorted around the edges, cinematic, ultra detailed --ar 16:9", "Midjourney", "blackhole,space", true],
  ["ece", 0, "kaan", "EY Monogram", "Serif harfleri tek bir çizgide birleştirdim.", "elegant monogram logo combining letters E and Y, high contrast serif typography, interlocking letterforms, black on white, luxury fashion brand style, vector, centered --ar 1:1", "Midjourney", "monogram,letter", false],
  ["ipek", 0, "elif", "Tutarlı Tilki Karakteri", "Karakter sayfası + her promptta aynı tanım.", "character sheet of a small red fox with a white-tipped tail and a tiny green scarf, front, side and back views, watercolor children's book style, same proportions in every view, white background --ar 16:9", "Midjourney", "fox,animal", false],
];

// Yorum havuzu — hedef türüne göre.
export const COMMENTS = {
  image: [
    "Işık çok güzel olmuş, hangi seed'i kullandın?",
    "Bunu kaydettim, yarın deneyeceğim 🙌",
    "Renk paleti inanılmaz. --style raw eklemek mi fark yarattı?",
    "Kompozisyon çok temiz, eline sağlık.",
    "Aynı promptu v6.1'de denedim, biraz daha kontrastlı çıktı.",
    "Bu atmosferi nasıl yakaladın ya 😍",
    "Detaylar çok net, upscale mi yaptın?",
    "Ben de benzer bir şey arıyordum, teşekkürler!",
    "Arka plandaki derinlik hissi harika.",
    "Duvar kağıdı yaptım bunu 😄",
    "Negatif prompt kullandın mı? Bende eller bozuk çıkıyor.",
    "Şunu 16:9 yapınca da çok güzel duruyor.",
    "Film grenini ekleyince daha gerçekçi olmuş.",
    "Portfolyoma ilham oldu, teşekkürler.",
    "Bu seriyi devam ettirmelisin!",
  ],
  text: [
    "Promptun yapısı çok iyi, adım adım olması işe yarıyor.",
    "Claude'da denedim, çok iyi sonuç verdi.",
    "Kelime sınırı koyman çok mantıklı, yoksa çok uzatıyor.",
    "Bunu kendi işime uyarladım, süper oldu.",
    "Çıktının formatını belirtmen harika bir fikir.",
    "Tam aradığım şey, teşekkürler 🙏",
    "Türkçe çıktıda da gayet iyi çalışıyor.",
    "Örnek bir çıktı da paylaşır mısın?",
  ],
  code: [
    "Kod incelemesinde gerçekten bir bug yakaladı, teşekkürler!",
    "Bunu ekip içinde paylaştım.",
    "GPT-4o'da da çok iyi çalışıyor.",
    "Edge case vurgusu çok önemli, güzel düşünülmüş.",
    "Çıktıyı JSON istemek de mümkün mü?",
    "Bunu CI'a entegre ettim 🚀",
  ],
  music: [
    "Dinledim, bağlama kısmı tüylerimi diken diken etti.",
    "Suno v4'te denedim, harika çıktı!",
    "Tempo tam kıvamında.",
    "Bunun vokalli versiyonunu da deneyeceğim.",
    "Bu füzyonlar çok iyi, devamını bekliyorum 🎶",
  ],
  video: [
    "Kamera hareketi tarifi çok işime yaradı.",
    "Runway'de denedim, akıcı çıktı.",
    "Süreyi uzatınca bozulmaya başlıyor mu sende de?",
    "Sinematik his çok güzel.",
  ],
  request: [
    "Ben de bunu merak ediyorum, takipteyim.",
    "Bir deneme yaptım, akşam yanıt olarak paylaşacağım.",
    "Negatif prompt kısmı önemli bence.",
    "Güzel soru, ben de uğraşmıştım bununla.",
    "Stable Diffusion'da ControlNet ile daha kolay olabilir.",
    "Referans görsel eklersen daha iyi sonuç alırsın.",
  ],
  generator: [
    "Harika bir generator, çok pratik 👏",
    "Seçenekler çok iyi düşünülmüş.",
    "Birkaç seçenek daha ekler misin?",
    "Bunu her gün kullanıyorum artık.",
    "JSON çıktısı çok temiz.",
    "Tam ihtiyacım olan şeydi, teşekkürler!",
  ],
  reply: [
    "Teşekkürler! 😊",
    "Evet, --style raw ile yaptım.",
    "Aynen öyle, deneyince haber ver.",
    "Çok sevindim, beğenmene sevindim.",
    "Seed'i hatırlamıyorum ama birkaç denemede çıktı.",
    "Kesinlikle, sıradaki işte eklerim.",
    "Katılıyorum 👍",
  ],
};

// Her kullanıcının kendi oluşturduğu özel koleksiyon adı.
export const COLLECTION_NAMES = [
  "İlham Panosu", "Denenecekler", "Favori Promptlarım", "İş İçin", "Renk & Işık", "Sonra Bak",
];
