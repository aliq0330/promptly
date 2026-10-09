// Viral prompt seed'i için içerik tablosu.
// Kaynak: jamez-bondos/awesome-gpt4o-images (https://github.com/jamez-bondos/awesome-gpt4o-images)
//   - Görseller: © 2025 jamez-bondos, CC BY 4.0 (Sora / GPT-4o ile yeniden üretilmiş).
//   - Promptlar: orijinal X/Twitter paylaşımlarından alıntılanmıştır; yazar ve
//     kaynak bağlantısı her paylaşımın açıklamasında yer alır.
// Ham metin/prompt/yazar verisi viral-cases.json içindedir; burada yalnızca
// Promptly'ye özgü kısım (persona, Türkçe başlık/açıklama, kategori, etiket) var.
//
// Satır biçimi: [vakaNo, kullanıcı, başlık, açıklama, kategori, altKategori, etiketler]
// Kategori/alt kategori/etiket değerleri canlı veritabanındaki slug'lardır.

export const IMAGE_BASE = "https://aliq0330.github.io/promptly/viral-seed";
export const IMAGE_CREDIT = "Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0.";

export const ROWS = [
  // ali — siberpunk / bilim kurgu / konsept sanat
  [71, "ali", "Minyatür siberpunk şehri (tilt-shift)", "Yukarıdan, tilt-shift etkisiyle çekilmiş, oyuncak gibi minyatür bir siberpunk manzarası. [Cyberpunk] yerine istediğin temayı yazabilirsin.", "style", "cyberpunk", ["siberpunk", "3d-render", "neon"]],
  [67, "ali", "Ultra gerçekçi 3D oyun karakteri", "Eski bir strateji oyunundaki karakterin tasarımını ultra gerçekçi bir 3D render olarak yeniden yorumlatan prompt.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "retro"]],
  [68, "ali", "Fütüristik logo koleksiyon kartı", "Koyu, neon vurgulu, yarı saydam köşeleri yuvarlatılmış fütüristik bir koleksiyon kartı. JSON biçiminde yazılmış, markaya göre uyarlanabilir.", "design", "branding", ["neon", "typography", "ai-sanat"]],
  [9, "ali", "Minimalist fütürist sergi posteri", "Açık gri zeminde 3:4, 4K çözünürlükte minimalist bir fütürist sergi posteri üretir.", "design", "poster", ["minimalist", "typography", "composition"]],
  // veli — yazılım / otomasyon
  [80, "veli", "JSON dosyası görünümlü kartvizit", "VS Code'da açılmış bir JSON dosyası gibi tasarlanmış kartvizit; elde tutulurken çekilmiş yakın plan.", "design", "branding", ["kodlama", "typography", "clean-background"]],
  [74, "veli", "Logo şeklinde yaratıcı kitaplık", "Bir logonun formundan esinlenen, akışkan eğrili modern bir kitaplık fotoğrafı. [LOGO] yerine istediğin markayı yaz.", "product_commercial", "product", ["photography", "composition", "texture"]],
  [83, "veli", "Parlayan çizgilerle anatomi diyagramı", "Bir canlının anatomisini parlak mavi çizgilerden oluşan bir ağla gösteren dijital illüstrasyon. [SUBJECT] yerine istediğin canlıyı yaz.", "art_illustration", "digital_art", ["neon", "soyut", "ai-sanat"]],
  [27, "veli", "Q-versiyon emoji çıkartma seti", "Kendi fotoğrafından altı farklı pozda chibi tarzı çıkartma seti üretir.", "art_illustration", "character_illustration", ["karakter-tasarimi", "anime", "ai-sanat"]],
  // ayse — fotoğrafçılık / portre
  [99, "ayse", "Siyah-beyaz portre sanatı", "Yumuşak gri geçişli arka planda, yüzünün yalnızca bir kısmı gölgeden beliren editoryal siyah-beyaz portre.", "photography", "black_white", ["portre", "photography", "studio-lighting"]],
  [98, "ayse", "Buzlu cam ardında bulanık siluet", "Buzlu bir yüzeyin arkasında bulanık bir siluet; yalnızca seçilen kısmı net görünen siyah-beyaz fotoğraf. [SUBJECT] ve [PART] alanlarını doldur.", "photography", "black_white", ["portre", "shadow", "photography"]],
  [33, "ayse", "Aile düğün fotoğrafı (Q-versiyon)", "Fotoğraftaki kişileri düğün kıyafetli 3D chibi karakterlere dönüştürür.", "human_character", "group", ["karakter-tasarimi", "3d-render", "portre"]],
  [86, "ayse", "Çift pozlama (double exposure)", "İki görüntüyü üst üste bindiren çift pozlama efekti.", "photography", "portrait_photography", ["portre", "surreal", "photography"]],
  // mehmet — müzik / prodüksiyon (albüm kapağı ve poster fikirleri)
  [76, "mehmet", "Nostaljik anime film posteri", "Bilinen bir hikâyeyi katlanma izleriyle eskitilmiş, nostaljik bir anime film afişine dönüştürür.", "art_illustration", "poster", ["anime", "retro", "fantastik"]],
  [59, "mehmet", "Renkli vektör sanat şehir posteri", "Büyük şehir başlıklı, canlı renkli yaz teması vektör sanat posteri. Şehir adını değiştirerek kullan.", "design", "poster", ["retro", "typography", "manzara"]],
  [3, "mehmet", "Retro tarzı tanıtım posteri", "Kırmızı-sarı ışınsal desenli, iddialı yazılı retro bir tanıtım posteri.", "design", "poster", ["retro", "typography", "composition"]],
  [66, "mehmet", "Yaratıcı ipek evren", "Bir emojiyi veya nesneyi ipek kumaşla sarılmış yumuşak bir 3D objeye dönüştürür.", "art_illustration", "3d_art", ["3d-render", "texture", "soyut"]],
  // zeynep — şiir / yazarlık / eğitim
  [38, "zeynep", "El çizimi infografik kart", "Bej kâğıt dokulu, el çizimi tarzında 9:16 dikey infografik kart. Konuyu kendin belirleyebilirsin.", "design", "infographic", ["typography", "composition", "clean-background"]],
  [34, "zeynep", "El çizimi infografik kart (bilişsel konu)", "Aynı el çizimi infografik düzeni; bilişsel gelişim ve çevre konusuna uyarlanmış örnek.", "design", "infographic", ["typography", "composition", "clean-background"]],
  [87, "zeynep", "Kelimenin anlamını harflere işleme", "Bir kelimenin anlamını harflerin içine yerleştirip kısa bir açıklamayla sunan tipografi çalışması.", "design", "typography", ["typography", "soyut", "minimalist"]],
  [88, "zeynep", "Çocuklar için boyama sayfası", "Doğrudan yazdırılabilir, siyah-beyaz çizgili boyama sayfası; renk referansıyla birlikte çalışır.", "art_illustration", "drawing", ["clean-background", "fantastik", "animation"]],
  // can — film / video / sinematografi
  [30, "can", "35mm film stilinde uçan ada", "Gökyüzünde süzülen bir şehir adasını 35mm film estetiğiyle üretir. Şehri değiştirebilirsin.", "photography", "cinematic_photography", ["surreal", "manzara", "photography"]],
  [6, "can", "Portaldan geçen karakter", "Fotoğraftaki kişinin 3D chibi versiyonu, parlayan bir portaldan geçerken izleyicinin elini tutuyor.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "fantastik"]],
  [50, "can", "Koleksiyon kartını parçalayan Lara Croft", "Bir macera koleksiyon kartının çerçevesini kırarak dışarı fırlayan sinematik, ultra fotogerçekçi illüstrasyon.", "art_illustration", "digital_art", ["composition", "ai-sanat", "fantastik"]],
  [77, "can", "Kristal küre içinde hikâye sahnesi", "Pencere kenarındaki sıcak ışıkta duran kristal küre; içinde küçük bir hikâye sahnesi anlatır.", "art_illustration", "fantasy_art", ["fantastik", "lighting", "surreal"]],
  // elif — anime / illüstrasyon
  [96, "elif", "Özel anime figürü", "Masa üstüne konmuş, telefonla çekilmiş gibi görünen anime tarzı bir figür fotoğrafı üretir.", "style", "anime", ["anime", "karakter-tasarimi", "3d-render"]],
  [40, "elif", "Japon tarzı iki panelli manga", "\"Kız başkanın günlük iş hayatı\" temalı, sevimli anime çizgisinde iki panelli dikey manga.", "art_illustration", "manga_art", ["anime", "karakter-tasarimi", "animation"]],
  [16, "elif", "Anime tarzı rozet", "Fotoğraftaki kişiden saçaklı, yuvarlak bir anime rozeti üretir.", "art_illustration", "anime_art", ["anime", "karakter-tasarimi", "texture"]],
  [28, "elif", "Düz tasarımlı çıkartma", "Fotoğrafı minimalist düz tasarımda chibi çıkartma illüstrasyonuna çevirir.", "art_illustration", "illustration", ["karakter-tasarimi", "minimalist", "clean-background"]],
  // burak — mimari / 3D / iç mekân
  [56, "burak", "Minyatür 3D bina", "Dev bir kahve bardağı şeklindeki tuhaf bir kafenin 3D chibi tarzı minyatür tasarımı.", "spaces", "architecture", ["mimari", "3d-render", "architecture"]],
  [7, "burak", "Kişiye özel oda tasarımı", "Izometrik görünümde, C4D kalitesinde sevimli bir 3D yatak odası tasarımı.", "spaces", "room_design", ["mimari", "3d-render", "architecture"]],
  [41, "burak", "Minyatür üç boyutlu sahne (tilt-shift)", "Tilt-shift tekniğiyle, bir sahnenin chibi tarzı minyatür üç boyutlu sunumu.", "art_illustration", "3d_art", ["3d-render", "fantastik", "composition"]],
  [79, "burak", "Lego şehir manzarası (Şanghay Bund)", "Şanghay Bund'u Lego stilinde, canlı renklerle ve yüksek detayla üretir. Şehri değiştirebilirsin.", "spaces", "city", ["3d-render", "manzara", "mimari"]],
  // selin — moda / ürün fotoğrafı
  [49, "selin", "Moda dergisi kapağı stili", "Pembe qipao giyen bir kadın, kelebekler ve dergi kapağı düzeniyle yüksek detaylı moda kapağı.", "photography", "fashion_photography", ["editorial-photography", "portre", "photography"]],
  [29, "selin", "Ünlü tablo karakteri OOTD", "Ünlü bir tablodaki karakteri, günün kombini düzeninde Q-stil 3D C4D karakter olarak giydirir.", "human_character", "fashion", ["karakter-tasarimi", "3d-render", "editorial-photography"]],
  [72, "selin", "Altın kolye", "Kabartma emoji/figür işlemeli altın kolyenin elde tutulurken çekilmiş fotogerçekçi yakın planı.", "product_commercial", "product", ["photography", "texture", "composition"]],
  [12, "selin", "3D çift mücevher kutusu figürü", "Fotoğraftaki kişilerden, pastel tonlarda bir mücevher kutusunda duran koleksiyonluk 3D figür.", "product_commercial", "product", ["3d-render", "karakter-tasarimi", "texture"]],
  // emre — oyun / fantastik / dünya kurma
  [44, "emre", "RPG tarzı karakter kartı", "Bir mesleği (örn. programcı) RPG koleksiyon kartı biçiminde yetenek istatistikleriyle gösterir.", "art_illustration", "concept_art", ["karakter-tasarimi", "fantastik", "composition"]],
  [70, "emre", "Özgün canavar yaratımı", "Bir nesneden esinlenen, canavar yakalama oyunlarına yakışacak özgün bir yaratık tasarlatır.", "art_illustration", "fantasy_art", ["fantastik", "karakter-tasarimi", "ai-sanat"]],
  [39, "emre", "Fantastik karikatür illüstrasyon", "Kafası sevimli bir bilgisayar monitörü olan çizgi karakter, parlayan mavi bir devre ormanında zıplıyor.", "art_illustration", "cartoon", ["fantastik", "animation", "neon"]],
  [64, "emre", "Steampunk mekanik balık", "Pirinç gövdeli, dişlileri görünen steampunk tarzı mekanik bir balık.", "style", "steampunk", ["fantastik", "texture", "ai-sanat"]],
  // deniz — doğa / manzara / seyahat
  [58, "deniz", "Bulutlarla şekillenen gökyüzü sanatı", "Gökyüzündeki dağınık bulutların bir nesne/figür oluşturduğu gündüz fotoğrafı. [SUBJECT] ve [LOCATION] alanlarını doldur.", "nature_environment", "sky", ["manzara", "surreal", "photography"]],
  [91, "deniz", "Harita görüntüsünden antik hazine haritası", "Bir harita görüntüsünü eskimiş parşömen üzerinde, gemiler ve pusulalarla antik hazine haritasına dönüştürür.", "art_illustration", "illustration", ["manzara", "retro", "texture"]],
  [94, "deniz", "Simge yapının önünde üç hayvanlı selfie", "Gün batımında, ikonik bir yapının önünde üç hayvanın farklı ifadelerle selfie çektiği sinematik görsel.", "nature_environment", "animal", ["golden-hour", "photography", "surreal"]],
  [82, "deniz", "Şehre özel hava durumu minyatürü", "45 derece kuşbakışı, izometrik minyatür şehir sahnesi ve hava durumu bilgisi. Şehri değiştirerek kullan.", "nature_environment", "weather", ["3d-render", "manzara", "mimari"]],
  // ceren — pazarlama / metin yazarlığı
  [100, "ceren", "Gerçek nesne ve elle çizilmiş karalama reklamı", "Beyaz zeminde gerçek bir nesneyi elle çizilmiş mürekkep karalamayla birleştiren minimalist, akılda kalan reklam.", "product_commercial", "advertising", ["minimalist", "typography", "clean-background"]],
  [37, "ceren", "Pastel güç 3D reklam", "Bir ürünü kil dokulu, pastel renkli yumuşak 3D çizgi film heykeline çeviren reklam görseli.", "product_commercial", "advertising", ["3d-render", "texture", "clean-background"]],
  [26, "ceren", "Ünlü tablo karakterli kahvaltılık gevrek reklamı", "Fotoğraftaki kişinin kişiliğine uygun, kişiye özel bir yulaf karışımı ambalajı ve reklamı üretir.", "product_commercial", "packaging", ["typography", "clean-background", "editorial-photography"]],
  [22, "ceren", "Sosyal medya kapak görseli", "Tıklama çekmeye odaklı, dikkat çekici bir sosyal medya (Xiaohongshu) gönderi kapağı üretir.", "design", "social_media", ["typography", "composition", "clean-background"]],
  // kaan — UI/UX / tasarım / minimalizm
  [25, "kaan", "Minimalist 3D illüstrasyon (JSON)", "Sanat stili profilini JSON olarak tanımlayan, minimalist 3D illüstrasyon üretir.", "design", "graphic_design", ["minimalist", "3d-render", "clean-background"]],
  [36, "kaan", "Minimalist 3D illüstrasyon (Markdown)", "Aynı minimalist 3D stilin Markdown biçiminde yazılmış sürümü; biçim farkının sonucu nasıl etkilediğini karşılaştır.", "design", "graphic_design", ["minimalist", "3d-render", "clean-background"]],
  [57, "kaan", "8-bit piksel ikon", "Beyaz zeminde ortalanmış, sınırlı retro palete sahip minimalist 8-bit piksel logo.", "art_illustration", "pixel_art", ["retro", "minimalist", "clean-background"]],
  [52, "kaan", "Kâğıt işi emoji ikonu", "Renkli kesilmiş kâğıttan elle yapılmış gibi görünen, saf beyaz arka planda süzülen emoji ikonu.", "design", "graphic_design", ["texture", "minimalist", "clean-background"]],
  // melis — yemek / fotoğrafçılık
  [63, "melis", "Emojiden kremalı dondurma", "Bir emojiyi kremanın kıvrımlı aktığı iştah açıcı bir dondurma çubuğuna dönüştürür.", "product_commercial", "food_beverage", ["photography", "texture", "3d-render"]],
  [65, "melis", "İçinde su altı sahnesi olan buzlu şeker", "Mavi saydam yüzeyi içinde minik bir dalgıcın olduğu su altı sahnesini gösteren gerçeküstü dondurma.", "product_commercial", "food_beverage", ["surreal", "photography", "texture"]],
  [35, "melis", "Tüylü cadılar bayramı balkabağı", "Düz bir balkabağı ikonunu hiper gerçekçi tüy dokulu yumuşak bir 3D nesneye çevirir.", "art_illustration", "3d_art", ["3d-render", "texture", "ai-sanat"]],
  [55, "melis", "Sevimli seramik saksı", "Parlak seramik, hayvan veya nesne şeklinde saksıda renkli sukulentler; yüksek kaliteli ürün fotoğrafı.", "product_commercial", "product", ["photography", "texture", "composition"]],
  // onur — veri bilimi / yapay zekâ
  [81, "onur", "3D yarı saydam cam dönüşümü", "Bir nesneyi 3D yarı saydam cam malzemeye dönüştürür.", "art_illustration", "3d_art", ["3d-render", "texture", "ai-sanat"]],
  [2, "onur", "3D Polaroid'den fırlama efekti", "Sahnedeki karakteri bir Polaroid fotoğrafın içinden fırlayan 3D chibi figüre dönüştürür.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "composition"]],
  [13, "onur", "Fotoğraftan 3D Q-versiyon stile", "Sahnedeki kişileri yerleşimi ve kıyafetleri koruyarak 3D chibi figürlere çevirir.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "ai-sanat"]],
  [45, "onur", "3D chibi üniversite maskotu", "Bir üniversiteyi temsil eden, onun değerlerini yansıtan kişileştirilmiş 3D chibi anime karakter.", "human_character", "character_design", ["karakter-tasarimi", "anime", "3d-render"]],
  // ipek — illüstrasyon / çocuk kitapları
  [97, "ipek", "Tatlı örgü yumuşak oyuncak bebek", "İki elin tuttuğu, el örgüsü iplikten yapılmış sevimli bir bebeğin profesyonel yakın plan fotoğrafı.", "art_illustration", "children_s_illustration", ["karakter-tasarimi", "texture", "photography"]],
  [32, "ipek", "3D kâğıt heykel pop-up kitap", "Katmanlı, katlanabilir kâğıt heykellerden oluşan bir pop-up kitap; masa üstünde temiz arka planla.", "art_illustration", "children_s_illustration", ["fantastik", "texture", "3d-render"]],
  [73, "ipek", "Sevimli chibi anahtarlık", "Elde tutulan, ekteki görselin chibi versiyonunu taşıyan renkli bir anahtarlık fotoğrafı.", "art_illustration", "character_illustration", ["karakter-tasarimi", "anime", "texture"]],
  [43, "ipek", "Chibi matruşka bebekler", "Görseldeki kişiyi büyükten küçüğe beş sevimli chibi matruşka bebeğe dönüştürür.", "art_illustration", "character_illustration", ["karakter-tasarimi", "retro", "texture"]],
  // baran — uzay / bilim kurgu / retro
  [85, "baran", "Gerçeküstü etkileşim sahnesi", "Karakalem bir figürün gerçek, renkli bir nesneyle etkileşime girdiği gerçeküstü sahne. [Subject 1] ve [Subject 2] alanlarını doldur.", "style", "surreal", ["surreal", "soyut", "composition"]],
  [19, "baran", "Oyuncak kutusunda ülke dioraması", "Kartondan bir kutunun içinde, iki elin kapağını tuttuğu 3D baskı bir ülke dioraması.", "art_illustration", "3d_art", ["3d-render", "manzara", "composition"]],
  [8, "baran", "Lego koleksiyon figürü", "Yüklediğin fotoğraftan, minyatür bir sahnede klasik Lego minifigür stilinde koleksiyon figürü üretir.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "retro"]],
  [47, "baran", "ESC tuş kapağı içinde minyatür diorama", "Yarı saydam mekanik klavye tuş kapağının içinde minyatür bir bilgisayar kurulumu gösteren izometrik 3D render.", "art_illustration", "3d_art", ["3d-render", "retro", "texture"]],
  // ece — logo / marka / tipografi
  [90, "ece", "Markalı mekanik klavye tuşları", "2x2 dizilmiş dört mekanik klavye tuşunda marka sloganı ve logoyu gösteren ultra gerçekçi 3D render.", "product_commercial", "brand", ["3d-render", "typography", "texture"]],
  [89, "ece", "Krom emoji rozet", "Ürün kartına iliştirilmiş, ultra parlak krom bitişli tek bir emoji rozetinin detaylı 3D renderı.", "product_commercial", "product", ["3d-render", "texture", "clean-background"]],
  [62, "ece", "Kawaii emaye rozet", "Ekteki görseldeki konuyu parlak metal çizgili, canlı emaye dolgulu kawaii rozete çevirir.", "product_commercial", "product", ["karakter-tasarimi", "texture", "clean-background"]],
  [42, "ece", "3D Q-versiyon çift kar küresi", "Görseldeki kişileri pencere kenarındaki masada duran bir kar küresi sahnesine dönüştürür.", "art_illustration", "3d_art", ["3d-render", "karakter-tasarimi", "lighting"]],
];
