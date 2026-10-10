-- ============================================================================
-- Promptly: demo kullanıcılardan 34 anlamlı hazır ayar (CLAUDE.md Bölüm 9.140).
-- EKLEMELİ: hiçbir şeyi silmez. İki kez çalıştırılırsa ikinci seferde (aynı
-- başlık + yazar zaten varsa) o hazır ayarı atlar. Beğeni / kaydetme / etiket
-- de eklenir; sayaçlar mevcut trigger'larla gerçekten üretilir.
-- Parametre anahtarları `src/lib/prompt-extra-settings.ts` kataloğundaki alan
-- kimlikleri ve seçenek değerleridir (ör. lens=85mm, lighting=studio).
-- ============================================================================

do $seed$
declare
  items jsonb := $j$[
  {"u":"ece","t":"Portre Fotoğrafı — Stüdyo Klasiği","ty":"image","c":"human_character","s":"portrait","tools":["midjourney","gpt-image"],"tags":["portre","studio-lighting","photography"],
   "d":"Temiz arka planlı, yüz hatlarını öne çıkaran klasik stüdyo portresi için başlangıç ayarı. 85mm lens ve sığ alan derinliği yüzü arka plandan ayırır, yumuşak stüdyo ışığı cildi doğal gösterir. Kompozisyonu üçler kuralına oturtup 4:5 oranında bırakmak sosyal medya ve profil fotoğrafı için ideal. Prompt'una sadece kim/ne giydiğini yazman yeterli.",
   "sel":{"camera":"mirrorless","lens":"85mm","dof":"shallow","lighting":"studio","framing":"close_up","background":"studio_backdrop","skin":"natural","composition":"thirds","style":"photorealistic","aspect_ratio":"4_5","detail_level":75}},
  {"u":"ipek","t":"Portre — Altın Saat Dış Mekân","ty":"image","c":"human_character","s":"portrait","tools":["midjourney","flux"],"tags":["portre","golden-hour","lighting"],
   "d":"Gün batımına yakın sıcak ışıkla çekilmiş dış mekân portreleri için. Hafif rüzgârda uçuşan saçlar ve bulanık arka plan sahneye hareket ve samimiyet katar. Kodak Portra film görünümü tonları yumuşatır; özellikle gülümseyen, doğal pozlar ve çift/arkadaş fotoğrafları için iyi çalışıyor.",
   "sel":{"lens":"85mm","lighting":"golden_hour","time_of_day":"sunset","background":"blurred","dof":"shallow","hair":"windswept","style":"photorealistic","film_style":"kodak_portra","color":"warm","hdr":false}},
  {"u":"can","t":"Sinematik Portre — Yağmurlu Neon Gece","ty":"image","c":"human_character","s":"portrait","tools":["midjourney","gpt-image"],"tags":["portre","neon","siberpunk"],
   "d":"Islak sokak, neon tabelalar ve CineStill 800T tonlarıyla film karesi hissi veren gece portresi. Yağmur yansımaları cildin üzerinde mavi-magenta ışık oyunu yaratır. Karakter odaklı hikâye kareleri, kitap kapağı ve oyun konsepti için sağlam bir temel.",
   "sel":{"style":"cinematic","lighting":"neon","film_style":"cinestill_800t","lens":"50mm","weather":"rainy","time_of_day":"night","color":"vibrant","visual_atmosphere":"moody","background":"city_street","detail_level":85}},
  {"u":"selin","t":"Moda Editoryal Çekim","ty":"image","c":"human_character","s":"fashion","tools":["midjourney","flux"],"tags":["editorial-photography","portre","photography"],
   "d":"Dergi kapağı ve lookbook çalışmaları için editoryal poz seti. Alçak açı ve negatif alan modeli güçlü gösterir, cesur makyaj ve sert stüdyo ışığı kontrastı artırır. Kıyafet ve aksesuarı prompt'ta kendin tarif et; bu ayar kompozisyonu ve ışığı hazır verir.",
   "sel":{"style":"editorial","outfit":"evening_gown","makeup":"editorial","lighting":"hard","angle":"low_angle","pose":"leaning","background":"studio_backdrop","lens":"85mm","composition":"negative_space","aspect_ratio":"4_5"}},
  {"u":"kaan","t":"Ürün Fotoğrafı — Beyaz Fon E-ticaret","ty":"image","c":"product_commercial","s":"e_commerce","tools":["gpt-image","midjourney"],"tags":["clean-background","photography","minimalist"],
   "d":"Pazaryeri ve e-ticaret katalogları için temiz, gölgesi kontrollü ürün çekimi. Ürün merkezde 'hero' konumda, yumuşak ışıkla her yüzeyi okunur; parlak malzemelerde yansımalar abartılmaz. 1:1 oran çoğu mağaza panelinde kırpma gerektirmez.",
   "sel":{"commercial_style":"ecommerce","background":"white","lighting":"soft","product_placement":"hero","material":"glossy","lens":"macro","angle":"eye_level","aspect_ratio":"1_1","dof":"deep","detail_level":90}},
  {"u":"zeynep","t":"Lüks Ürün Reklamı — Altın Vurgulu","ty":"image","c":"product_commercial","s":"advertising","tools":["midjourney","flux"],"tags":["studio-lighting","minimalist","composition"],
   "d":"Parfüm, saat ve mücevher gibi premium ürünlerin reklam görselleri için karanlık, kontrastlı ve altın vurgulu bir set. Düşük anahtar ışık ürünün kenarlarını keskin çizer, gradyan zemin derinlik katar. Ürünü havada süzülür konumda göstermek reklam hissini güçlendirir.",
   "sel":{"commercial_style":"luxury","lighting":"low_key","background":"gradient","material":"metallic","product_placement":"floating","visual_atmosphere":"luxury","accent_color":"#C9A24B","detail_level":90,"hdr":true,"aspect_ratio":"4_5"}},
  {"u":"burak","t":"Minimal İç Mekân Görselleştirme","ty":"image","c":"spaces","s":"interior","tools":["midjourney","gpt-image"],"tags":["mimari","minimalist","architecture"],
   "d":"Mimari sunumlar ve ev dekorasyon fikirleri için sade, ferah bir iç mekân ayarı. Geniş açı lens odayı olduğundan büyük gösterir; doğal öğle ışığı ve ahşap dokular sıcaklık verir. Nötr renk paleti müşterinin kendi mobilyasını hayal etmesini kolaylaştırır.",
   "sel":{"arch_style":"minimalist","lighting":"natural","time_of_day":"midday","perspective":"wide_interior","color":"neutral","texture":"soft","material":"wood","aspect_ratio":"3_2","lens":"wide_angle"}},
  {"u":"onur","t":"Fütüristik Şehir — Sisli Gece Manzarası","ty":"image","c":"spaces","s":"futuristic_city","tools":["midjourney","flux"],"tags":["siberpunk","neon","architecture"],
   "d":"Kuş bakışı, sisli ve neon ışıklı bir gelecek şehri. Sis katmanları derinlik hissi yaratır, neon tabelalar ölçek bilgisi verir. Oyun konsepti, bilimkurgu kapağı ve masaüstü duvar kâğıdı için 16:9 oranı hazır.",
   "sel":{"arch_style":"futuristic","style":"cyberpunk","time_of_day":"night","weather":"foggy","perspective":"aerial","lighting":"neon","visual_atmosphere":"futuristic","aspect_ratio":"16_9","detail_level":85}},
  {"u":"elif","t":"Anime Karakter Portresi — Pastel Tonlar","ty":"image","c":"art_illustration","s":"anime_art","tools":["midjourney","flux"],"tags":["anime","karakter-tasarimi","ai-sanat"],
   "d":"Yumuşak pastel renkler ve temiz çizgilerle anime/ manga tarzı karakter portreleri. Omuz üzerinden bakış ve uzun akıcı saçlar sahneye hikâye katıyor. Özgün karakter tasarımı, avatar ve sticker çalışmaları için güvenli bir başlangıç.",
   "sel":{"style":"anime","lighting":"soft","color":"pastel","framing":"medium","pose":"looking_back","hair":"long_flowing","composition":"centered","aspect_ratio":"4_5","detail_level":70}},
  {"u":"ayse","t":"Suluboya Doğa Çizimi","ty":"image","c":"art_illustration","s":"watercolor","tools":["midjourney","gpt-image"],"tags":["manzara","ai-sanat","minimalist"],
   "d":"Kâğıt dokusu hissi veren, taşan pigmentli suluboya manzaraları için. Gün doğumu ışığı ve bol negatif alan çizimi nefes aldırır; detay seviyesi bilerek düşük tutulmuş ki fırça darbeleri öne çıksın. Kart, davetiye ve duvar baskısı için uygun.",
   "sel":{"style":"watercolor","color":"pastel","lighting":"soft","time_of_day":"sunrise","composition":"negative_space","texture":"soft","detail_level":40,"aspect_ratio":"3_2"}},
  {"u":"ipek","t":"3D Pixar Tarzı Karakter","ty":"image","c":"style","s":"pixar_style","tools":["midjourney","gpt-image"],"tags":["3d-render","karakter-tasarimi","animation"],
   "d":"Yuvarlak hatlar, canlı renkler ve yumuşak ışıkla animasyon filmi estetiğinde karakter üretimi. Düz gradyan zemin karakteri öne çıkarır, tam boy kadraj kıyafet ve duruşu gösterir. Oyuncak tasarımı, çocuk kitabı ve marka maskotları için kullanışlı.",
   "sel":{"style":"render_3d","lighting":"soft","color":"vibrant","framing":"full_body","background":"gradient","texture":"smooth","high_detail":true,"aspect_ratio":"1_1"}},
  {"u":"deniz","t":"Retro Vintage Poster","ty":"image","c":"design","s":"poster","tools":["midjourney","ideogram"],"tags":["retro","typography","composition"],
   "d":"70'ler konser ve seyahat afişlerini hatırlatan, soluk renkli ve taneli retro poster ayarı. Simetrik kompozisyon başlık yerleşimini kolaylaştırır; Polaroid film görünümü sıcak bir nostalji katar. Tipografiyi prompt'ta açıkça yazmak (ör. 'büyük kalın başlık') sonucu iyileştirir.",
   "sel":{"style":"vintage","color":"muted","texture":"grainy","composition":"symmetry","film_style":"polaroid","aspect_ratio":"4_5","visual_atmosphere":"minimal"}},
  {"u":"mehmet","t":"Sisli Orman Manzarası","ty":"image","c":"nature_environment","s":"forest","tools":["midjourney","flux"],"tags":["manzara","photography","composition"],
   "d":"Sabah sisinin ağaç gövdelerinin arasında süzüldüğü, sakin ve fotogerçekçi orman sahneleri. Geniş açı ve derin alan derinliği tüm katmanları net tutar; yönlendirici çizgiler gözü sahnenin içine çeker. Duvar kâğıdı ve meditasyon uygulaması görselleri için uygun.",
   "sel":{"weather":"foggy","time_of_day":"sunrise","lighting":"natural","lens":"wide_angle","dof":"deep","color":"muted","style":"photorealistic","composition":"leading_lines","aspect_ratio":"16_9"}},
  {"u":"veli","t":"Sokak Fotoğrafı — Siyah Beyaz","ty":"image","c":"photography","s":"street_photography","tools":["midjourney","flux"],"tags":["photography","composition","lighting"],
   "d":"Klasik belgesel sokak fotoğrafçılığı hissi: 35mm lens, göz hizası kadraj, sert gün ışığı ve film greni. Planlanmamış gibi görünen 'candid' pozlar sahneyi canlı tutar. Siyah beyaz film görünümü karmaşık arka planları sadeleştirir.",
   "sel":{"film_style":"bw_film","color":"black_white","lens":"35mm","angle":"eye_level","pose":"candid","framing":"medium","composition":"thirds","lighting":"hard","texture":"grainy"}},
  {"u":"melis","t":"Makro Çiçek — Sabah Çiği","ty":"image","c":"photography","s":"macro","tools":["midjourney","gpt-image"],"tags":["photography","manzara","lighting"],
   "d":"Çiy damlalı yaprak ve çiçek makro çekimleri için. Makro lens ve çok sığ alan derinliği tek bir detayı keskin bırakıp gerisini kremsi bulanıklığa çevirir. Yumuşak sabah ışığı ve canlı renkler botanik illüstrasyon ve kapak görselleri için iyi sonuç verir.",
   "sel":{"lens":"macro","dof":"shallow","lighting":"soft","color":"vibrant","time_of_day":"sunrise","texture":"wet","background":"blurred","detail_level":90}},
  {"u":"baran","t":"Yemek Fotoğrafı — Üstten Çekim","ty":"image","c":"photography","s":"food_photography","tools":["midjourney","gpt-image"],"tags":["photography","composition","lighting"],
   "d":"Menü, blog ve sosyal medya yemek görselleri için kuş bakışı düzen. Doğal pencere ışığı ve sıcak tonlar yemeği iştah açıcı gösterir; kafe masası ortamı gerçekçilik katar. Tabağı merkeze, malzemeleri çevresine dağıtmak kompozisyonu dengeler.",
   "sel":{"angle":"birds_eye","lighting":"natural","setting":"cafe","color":"warm","dof":"shallow","composition":"centered","texture":"rough","aspect_ratio":"4_5"}},
  {"u":"ceren","t":"Instagram Satış Metni","ty":"text","c":"marketing","s":"ad_copy","tools":["chatgpt","claude"],"tags":["yazarlik"],
   "d":"Genç kitleye yönelik, kısa ve ikna edici Instagram reklam/ürün metni. Dönüşüm hedefli yazılır; net bir 'Hemen al' çağrısıyla biter. Ürün adı, fiyat ve tek bir fayda cümlesini prompt'a eklemen yeterli — gerisini ton ve uzunluk ayarı yönetir.",
   "sel":{"tone":"persuasive","platform":"instagram","audience":"young_adults","length":"short","cta":"buy_now","sales_goal":"conversion","language":"turkish"}},
  {"u":"deniz","t":"LinkedIn Profesyonel Paylaşım","ty":"text","c":"social_media","s":"linkedin","tools":["chatgpt","claude"],"tags":["yazarlik"],
   "d":"Kariyer deneyimini hikâye anlatımıyla paylaşan, abartısız ve samimi LinkedIn gönderileri için. Profesyonel ton ve orta uzunluk okunabilirliği korur; sonda yumuşak bir 'daha fazlasını öğren' çağrısı etkileşim getirir. Başarı hikâyesi, proje duyurusu ve ilham verici paylaşımlarda iyi çalışır.",
   "sel":{"tone":"professional","platform":"linkedin","audience":"professionals","structure":"storytelling","length":"medium","cta":"learn_more","language":"turkish","purpose":"inspire"}},
  {"u":"veli","t":"SEO Uyumlu Blog Yazısı","ty":"text","c":"seo","s":"blog","tools":["chatgpt","claude"],"tags":["yazarlik"],
   "d":"Başlıklara bölünmüş, anahtar kelimeyi doğal kullanan uzun blog yazıları için. Samimi bir dil genel okuyucuya ulaşır; bilgilendirme amacı içeriği satış kokusundan uzak tutar. Anahtar kelimeyi ve hedef soruyu prompt'ta belirtmeyi unutma.",
   "sel":{"tone":"friendly","structure":"headings","length":"long","audience":"general","text_format":"blog_post","purpose":"inform","language":"turkish"}},
  {"u":"can","t":"Üretim Seviyesi Kod İsteği","ty":"text","c":"coding","s":"code","tools":["claude","chatgpt","claude-code"],"tags":["kodlama","javascript"],
   "d":"Prototip değil, canlıya çıkabilecek kod isteyen geliştiriciler için. Tip güvenliği, hata yönetimi ve test beklentisi baştan söylenir; çıktı adım adım açıklanır, böylece kodu gözden geçirmek kolaylaşır. İngilizce çıktı kütüphane belgeleriyle uyumludur.",
   "sel":{"code_detail":"production","structure":"steps","tone":"formal","language":"english","length":"medium"}},
  {"u":"mehmet","t":"Birinci Tekil Hikâye Anlatımı","ty":"text","c":"writing","s":"story","tools":["claude","chatgpt"],"tags":["yazarlik","siir"],
   "d":"Okuru olayın içine çeken, birinci tekil kişiyle yazılmış kurmaca için. Anlatı üslubu betimleme ve iç sesi öne çıkarır; uzun metin kısa öykülerde ve karakter denemelerinde tempoyu korur. Ton samimi tutulduğu için diyalog yazımında da doğal sonuç verir.",
   "sel":{"writing_style":"narrative","pov":"first_person","tone":"friendly","structure":"storytelling","length":"long","language":"turkish"}},
  {"u":"zeynep","t":"Resmî E-posta — Kurumsal Yazışma","ty":"text","c":"business_professional","s":"email","tools":["chatgpt","claude"],"tags":["yazarlik"],
   "d":"Yöneticilere ve dış paydaşlara gidecek kısa, resmî ve ikna odaklı e-postalar. Kısa uzunluk okunma ihtimalini artırır, resmî ton güven verir. Konu satırı, talep ve son tarihi prompt'ta belirtmen yeterli.",
   "sel":{"tone":"formal","text_format":"email","length":"short","audience":"executives","purpose":"persuade","language":"turkish"}},
  {"u":"selin","t":"Ders Özeti — Öğrenci Dostu","ty":"text","c":"education","s":"summary","tools":["chatgpt","claude"],"tags":["yazarlik"],
   "d":"Ders notlarını ve makaleleri sınava hazırlanan öğrenciler için maddeli, kısa özetlere çeviren ayar. Sade bir dil ve madde işaretleri tekrar yapmayı kolaylaştırır; amaç öğretmek olduğundan kavramlar kısa tanımlarla verilir.",
   "sel":{"tone":"friendly","audience":"students","structure":"bullets","length":"short","purpose":"educate","language":"plain"}},
  {"u":"onur","t":"Akademik Araştırma Özeti","ty":"text","c":"research","s":"summarization","tools":["claude","chatgpt"],"tags":["yazarlik"],
   "d":"Makale ve rapor özetleri için akademik üslup: başlıklara ayrılmış, resmî ve bilgilendirici. Okuyucu profesyonel varsayıldığından terimler açıklanmadan kullanılabilir. Kaynak metni prompt'a yapıştırıp 'yalnızca metindeki bilgilerle özetle' demek uydurmayı azaltır.",
   "sel":{"writing_style":"academic","structure":"headings","tone":"formal","audience":"professionals","purpose":"inform","length":"medium"}},
  {"u":"baran","t":"Lo-fi Çalışma Müziği","ty":"audio","c":"music","s":"lo_fi","tools":["suno","udio"],"tags":["muzik-uretim"],
   "d":"Ders çalışırken ve kod yazarken arka planda dönen, düşük tempolu lo-fi parçalar. Piyano ana melodiyi taşır, bant efekti sıcak, hafif bozuk bir karakter katar. Sözsüz ve 2 dakika civarı döngü olarak kullanmak için ideal.",
   "sel":{"genre":"lofi","mood":"calm","tempo":"slow","instrument":"piano","atmosphere":"warm","bpm":80,"duration_audio":"2m","sound_character":"tape","vocal":"instrumental"}},
  {"u":"emre","t":"Epik Orkestral Fragman Müziği","ty":"audio","c":"music","s":"film_score","tools":["suno","udio"],"tags":["muzik-uretim"],
   "d":"Oyun ve film fragmanları için yükselen yaylılar ve geniş bir alan hissi taşıyan epik orkestral parçalar. Tempolu ama koşturmayan 120 BPM tempo, 1 dakikalık tipik fragman süresine uyar. Sözsüz üretildiği için ses efektleriyle karıştırmak kolay.",
   "sel":{"genre":"orchestral","mood":"epic","tempo":"upbeat","instrument":"strings","atmosphere":"spacious","bpm":120,"duration_audio":"1m","vocal":"instrumental"}},
  {"u":"can","t":"Synthwave Gece Sürüşü","ty":"audio","c":"music","s":"synthwave","tools":["suno","udio"],"tags":["muzik-uretim","neon"],
   "d":"80'ler nostaljisi taşıyan, analog sentezleyici ağırlıklı gece sürüşü müziği. Orta tempo ve fütüristik atmosfer neon şehir görselleriyle birlikte kullanılınca çok iyi oturur. Video arka planı ve oyun menüsü müziği olarak da deneyebilirsin.",
   "sel":{"genre":"electronic","mood":"nostalgic","tempo":"mid","instrument":"synth","atmosphere":"futuristic","sound_character":"analog","bpm":105,"vocal":"instrumental"}},
  {"u":"melis","t":"Akustik Pop Şarkı — Kadın Vokal","ty":"audio","c":"music","s":"pop","tools":["suno"],"tags":["muzik-uretim"],
   "d":"Neşeli, akustik gitar eşlikli ve kadın vokalli üç dakikalık pop şarkılar için. Orta tempo ve 100 BPM, ezgiyi akılda kalıcı tutar. Şarkı sözünü ve teması prompt'a yazman yeterli; ayar tür, ruh hali ve enstrümanı hazır verir.",
   "sel":{"genre":"pop","vocal":"female","mood":"happy","instrument":"acoustic_guitar","tempo":"mid","duration_audio":"3m","bpm":100}},
  {"u":"ali","t":"Podcast Giriş Müziği","ty":"audio","c":"podcast","s":"podcast_intro","tools":["suno","udio"],"tags":["muzik-uretim"],
   "d":"15 saniyelik, enerjik ve tanınabilir podcast jingle'ı. Saksafon ve tempolu bir ritim bölüme hızlı bir giriş yaptırır; kısa süre dinleyiciyi sıkmaz. Her bölümde aynı melodiyi kullanarak kanalına ses kimliği kazandır.",
   "sel":{"audio_type":"jingle","genre":"jazz","mood":"happy","tempo":"upbeat","instrument":"sax","duration_audio":"15s"}},
  {"u":"kaan","t":"Sinematik Ürün Tanıtım Videosu","ty":"video","c":"advertising","s":"product_ad","tools":["veo","runway"],"tags":["video-uretim","studio-lighting"],
   "d":"Ürünün çevresinde yavaşça dönen kamerayla 15 saniyelik reklam planı. Yakın plan ve yavaş çekim malzemeyi ve detayı vurgular, stüdyo ışığı yansımaları kontrol altında tutar. Planlar arası yumuşak geçiş (dissolve) premium bir his verir.",
   "sel":{"style_video":"commercial","camera_move":"orbit","shot":"close_up","duration_video":"15s","aspect_video":"16_9","fps":"24","motion":"slow_motion","lighting":"studio","transition":"dissolve"}},
  {"u":"ceren","t":"TikTok / Reels Dikey Video","ty":"video","c":"social_media","s":"reels","tools":["veo","runway","kling"],"tags":["video-uretim","youtube-video"],
   "d":"Dikey 9:16 formatında, hızlı kesmelerle izleyiciyi ilk saniyelerde yakalayan kısa videolar. Elde kamera hissi samimiyet katar, whip-pan geçişler tempoyu yükseltir. 15 saniyelik süre çoğu platformda tamamlanma oranını yüksek tutar.",
   "sel":{"aspect_video":"9_16","duration_video":"15s","camera_move":"handheld","shot":"medium","motion":"fast_cuts","transition":"whip_pan","fps":"30","style_video":"documentary"}},
  {"u":"mehmet","t":"Doğa Belgeseli Açılış Planı","ty":"video","c":"documentary","s":"nature","tools":["veo","runway"],"tags":["video-uretim","manzara"],
   "d":"Drone çekimi hissiyle, sisli bir sabahta açılan belgesel kuruluş planı. Gün doğumu ışığı ve geniş sinematik oran, 30 saniyelik atmosferik giriş için yeterli alanı verir. Anlatıcı sesi eklemeyi düşünüyorsan sahneyi sakin tutmak için kamera hareketini yavaş bırak.",
   "sel":{"style_video":"documentary","camera_move":"drone","shot":"establishing","duration_video":"30s","aspect_video":"16_9","fps":"24","time_of_day":"sunrise","weather":"foggy"}},
  {"u":"elif","t":"Anime Aksiyon Sahnesi","ty":"video","c":"animation","s":"anime","tools":["kling","veo"],"tags":["anime","animation","video-uretim"],
   "d":"Takip kamerası ve dramatik ışıkla anime aksiyon kareleri için. 24 FPS anime akıcılığına uygun, pürüzsüz hareket ve 10 saniyelik süre tek bir vuruşluk sahne için ideal. Karakter tarifini ve hareketi prompt'ta net yazmak sonucu keskinleştirir.",
   "sel":{"style_video":"anime","camera_move":"tracking","shot":"medium","motion":"smooth","duration_video":"10s","aspect_video":"16_9","fps":"24","lighting":"dramatic"}},
  {"u":"onur","t":"Zaman Atlamalı Şehir Gecesi","ty":"video","c":"visual_effects","s":"time_lapse","tools":["veo","runway"],"tags":["video-uretim","neon"],
   "d":"Sabit kameradan, gün batımından geceye geçen şehir time-lapse'i. Neon ışıkların yanması ve trafik akışı hareketin tek kaynağıdır, bu yüzden kamera sabit bırakılır. Haber, belgesel ve sunum arka planı olarak kullanılabilir.",
   "sel":{"motion":"time_lapse","camera_move":"static","shot":"establishing","duration_video":"10s","time_of_day":"night","lighting":"neon","aspect_video":"16_9","fps":"30"}}
  ]$j$::jsonb;
  it jsonb;
  pid uuid;
  author uuid;
  t0 timestamptz;
  liker uuid;
  nlikes int;
  nsaves int;
  cover text;
  n int := 0;
begin
  perform setseed(0.37);
  for it in select * from jsonb_array_elements(items) loop
    select id into author from public.profiles where username = it->>'u';
    if author is null then continue; end if;
    if exists (select 1 from public.presets where creator_id = author and title = it->>'t') then continue; end if;

    cover := null;
    if it->>'ty' = 'image' then
      select pm.url into cover
        from public.prompt_media pm join public.prompts p on p.id = pm.prompt_id
        where p.content_type = 'image' and p.deleted_at is null and p.category = it->>'c'
        order by md5(p.id::text || (it->>'t')) limit 1;
      if cover is null then
        select pm.url into cover from public.prompt_media pm join public.prompts p on p.id = pm.prompt_id
          where p.content_type = 'image' and p.deleted_at is null order by md5(p.id::text || (it->>'t')) limit 1;
      end if;
    end if;

    t0 := now() - (interval '1 day' * (1 + random() * 24));
    insert into public.presets (creator_id, title, description, cover_url, content_type, category, subcategory, tools, selection, status, visibility, created_at, updated_at)
    values (author, it->>'t', it->>'d', cover, it->>'ty', it->>'c', it->>'s',
            array(select jsonb_array_elements_text(it->'tools')), it->'sel', 'published', 'public', t0, t0)
    returning id into pid;

    insert into public.preset_tags (preset_id, tag_slug)
      select pid, tg from jsonb_array_elements_text(it->'tags') tg where exists (select 1 from public.tags where slug = tg)
      on conflict do nothing;

    nlikes := 4 + floor(random() * 9)::int;
    for liker in select p.id from public.profiles p where p.id <> author and p.username <> 'aliq' order by random() limit nlikes loop
      insert into public.prompt_likes (preset_id, user_id, created_at) values (pid, liker, t0 + interval '1 hour' + random() * (now() - t0 - interval '1 hour'));
    end loop;

    nsaves := 1 + floor(random() * 5)::int;
    for liker in select p.id from public.profiles p where p.id <> author and p.username <> 'aliq' order by random() limit nsaves loop
      insert into public.collection_items (collection_id, preset_id, created_at)
        select c.id, pid, t0 + interval '2 hour' + random() * (now() - t0 - interval '2 hour')
        from public.collections c where c.owner_id = liker and c.is_default;
    end loop;
    n := n + 1;
  end loop;
  raise notice 'eklenen hazır ayar: %', n;
end
$seed$;
