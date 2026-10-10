-- ============================================================================
-- Promptly: demo kullanıcılar arasında konuya uygun yorumlar (CLAUDE.md Bölüm 9.140).
-- EKLEMELİ: hiçbir şeyi silmez; zaten yorumu olan içeriğe dokunmaz (tekrar
-- çalıştırmak güvenli). Her içerik türü / kategori ailesi için ayrı yorum
-- havuzu vardır; her yoruma yazar bazen kısa bir yanıt verir, yorumlar ve
-- yanıtlar birbirinden beğeni alır. Sayaçlar ve bildirimler mevcut trigger'larla
-- gerçekten üretilir.
--
-- Not: Supabase SQL Editor tek seferde çalıştırabilir; ağ zaman aşımına karşı
-- aşağıdaki `fams` listesini iki parçaya bölüp ayrı ayrı da çalıştırabilirsin.
-- ============================================================================

do $seed$
declare
  fams text[] := array['img_art','img_product','img_design','img_photo','text_code','text_mkt','text_write','video','audio','req_image','req_text','req_code','req_media','generator','workflow','preset'];
  pools jsonb := $j${
  "img_art": [
   {"c":"Renk geçişleri çok yumuşak olmuş, '{t}' için seçtiğin stil net okunuyor. Prompt'taki ışık tarifi gerçekten işe yaramış.","r":["Teşekkürler! Işık kısmını birkaç denemeyle oturttum.","Sağ ol 🙏 ışığı en son ekledim, farkı hemen gördüm."]},
   {"c":"Negatif alanı bırakman kompozisyonu rahatlatmış. Aynı promptu Midjourney'de denedim, benzer bir hava yakaladım.","r":["Güzel haber! --stylize değerini düşük tutmak bu işi çözüyor."]},
   {"c":"Karakterin yüz ifadesi tutarlı çıkıyor mu? Birkaç üretimde aynı kişiyi yakalamak istiyorum.","r":["Sabit bir saç ve kıyafet tarifi ekleyince oldukça tutarlı geliyor.","Seed'i sabitlersen çok daha tutarlı oluyor, bende öyle çalıştı."]},
   {"c":"Dokular çok iyi. Kâğıt ve boya hissi için özellikle hangi kelimeler etkili oldu?","r":["'grainy texture' ve 'hand-painted' en etkili olanlar, biri kaldırılınca düzleşiyor."]},
   {"c":"Çocuk kitabı illüstrasyonu için denemeye değer, renk paleti çok sıcak.","r":["Çocuk kitapları için de test ettim, sayfa boyutuna göre 3:2 oranı iyi duruyor."]},
   {"c":"Detay seviyesi dengeli, ne fazla kalabalık ne boş. Bu prompt'u hazır ayar olarak kaydedeceğim.","r":["Harika, hazır ayar yapınca yeni fikirlere hızlı adapte oluyor."]},
   {"c":"Bunu 4K'ya büyütmeyi deneyen oldu mu? Baskı için düşünüyorum.","r":["Upscale sonrası çizgiler hâlâ temiz, A3'e kadar sorunsuz bastırdım."]},
   {"c":"Palet çok uyumlu. Aynı promptu farklı bir ana renkle denersem ne olur?","r":["Ana rengi değiştirince ışık da değişiyor, deneyip sonucu paylaş bence."]}
  ],
  "img_product": [
   {"c":"Ürün kenarları çok temiz, yansımalar abartılmamış. E-ticaret kataloğu için birebir.","r":["Teşekkürler, yansımayı yumuşatmak için 'soft diffused light' ekledim."]},
   {"c":"'{t}' için arka planı değiştirmek istesem prompt'un neresini oynatmalıyım?","r":["Arka plan cümlesini değiştirmen yeter, ışık tarifini olduğu gibi bırak."]},
   {"c":"Gölge yönü gerçekçi, ürünün zeminle ilişkisi inandırıcı.","r":["Sağ ol! Zemin için 'subtle contact shadow' ifadesi çok işe yarıyor."]},
   {"c":"Müşterime gösterdim, reklam çekimi sanmış 😄","r":["😄 Harika, o zaman amacına ulaşmış."]},
   {"c":"Marka renklerine uydurmak için hex kodu yazınca tutuyor mu?","r":["Tam tutmuyor ama renk adı + ton tarifi ('warm gold') daha iyi sonuç veriyor."]},
   {"c":"Kare formatta çok iyi duruyor, mağaza paneline kırpmadan koydum.","r":["1:1 tam bu yüzden seçtim, iyi ki işe yaramış."]},
   {"c":"Cam ve metal yüzeylerde de aynı kalitede çıkıyor mu?","r":["Metalde iyi, camda iç yansımaları artırmak için 'clear glass, soft reflections' ekle."]}
  ],
  "img_design": [
   {"c":"Tipografi okunaklı çıkmış, hiyerarşi net. Metin yerleşimi için ne yazdın?","r":["Başlığı tırnak içinde yazıp konumunu belirttim, böylece harf hatası azaldı."]},
   {"c":"Renk dengesi çok başarılı, kontrastı sosyal medya için ideal.","r":["Teşekkürler, küçük ekranda test edip kontrastı bilerek yüksek tuttum."]},
   {"c":"Bunu şablon olarak kaydetmek istiyorum, farklı metinlerle denemek için.","r":["Tabii, yalnızca başlık ve alt metni değiştirmen yeterli."]},
   {"c":"Izgara düzeni dengeli, boşluklar nefes alıyor. UI kartları için de uyarlanabilir.","r":["UI kartında da denedim, köşe yarıçapını belirtmek sonucu stabil yapıyor."]},
   {"c":"'{t}' marka kimliği çalışmasında moodboard olarak çok iş görür.","r":["Aynı amaçla kullanıyorum, 4-6 varyasyon üretip birlikte değerlendiriyorum."]},
   {"c":"Retro tonları sevdim; renk paletini sınırlamak tutarlılık sağlamış.","r":["Palet sayısını 3-4 ile sınırlamak gerçekten fark yaratıyor."]}
  ],
  "img_photo": [
   {"c":"Işık yönü çok doğal, yüzdeki gölgeler gerçekçi. Hangi lens tarifini kullandın?","r":["85mm yazdım, sığ alan derinliği ışığı daha da güzel gösteriyor."]},
   {"c":"Bu atmosferi yakalamak zor, '{t}' gerçekten fotoğraf gibi duruyor.","r":["Teşekkürler! 'film grain' ve 'natural light' kelimeleri gerçekçiliği artırıyor."]},
   {"c":"Kompozisyon üçler kuralına çok güzel oturmuş.","r":["Evet, prompt'a 'rule of thirds' yazınca özne hep köşelere kayıyor."]},
   {"c":"Aynı sahneyi gün batımında denedim, tonlar daha sıcak ve çok güzel oldu.","r":["Harika fikir, altın saat ışığı her sahnede iş görüyor."]},
   {"c":"Arka plan bulanıklığı çok doğal; yapay 'bokeh' gibi durmuyor.","r":["f/1.8 benzeri tarif yazınca geçiş çok yumuşak oluyor."]},
   {"c":"Mekân hissi çok güçlü, bir kitap kapağı için kullanabilirim.","r":["Kullanırsan görsel kaynağı olarak profilimi anarsan sevinirim 🙂"]},
   {"c":"Renk tonları yumuşak, filtreye gerek bırakmamış.","r":["Film emülsiyonu adı (Portra gibi) yazmak tonları güzelce oturtuyor."]}
  ],
  "text_code": [
   {"c":"Çıktı çok düzenli, hata yönetimi de dahil. Bunu projemde deneyeceğim.","r":["Güzel, 'production-ready, with error handling' ifadesini mutlaka bırak."]},
   {"c":"Kodun yanındaki açıklama sayesinde nasıl çalıştığını hemen anladım.","r":["Adım adım açıklama istemek öğrenme için çok değerli."]},
   {"c":"TypeScript ile denedim, tip tanımları temiz geldi. Test örneği de ister misin diye soruyor, güzel.","r":["Testleri baştan istersen 'include unit tests' yeterli."]},
   {"c":"'{t}' için SQL sürümünü de çıkarmak mümkün mü?","r":["Prompt'un sonuna 'PostgreSQL syntax' eklersen aynı yapıda üretiyor."]},
   {"c":"Edge case'leri yakalaması çok iyi, ilk denemede iş gördü.","r":["Edge case listesi istemek kaliteyi gerçekten yükseltiyor."]},
   {"c":"Claude ile ChatGPT arasındaki farkı karşılaştırdım, açıklama tarafında bu prompt daha iyi çalışıyor.","r":["Paylaşman çok iyi oldu, modele göre biraz farklı davrandığını da not edeyim."]},
   {"c":"Bu prompt'u ekip içinde standart hale getirmeyi düşünüyoruz.","r":["Süper, değişken alanlarıyla ekip şablonuna çevirmek çok kolay."]}
  ],
  "text_mkt": [
   {"c":"Başlık çok vurucu, ilk cümle dikkat çekiyor. Landing page için denedim.","r":["Süper! Hedef kitleyi prompt'a yazarsan ton daha da netleşiyor."]},
   {"c":"Çağrı cümlesi doğal geliyor, baskıcı durmuyor.","r":["Teşekkürler, 'friendly but persuasive' kombinasyonu bunun sırrı."]},
   {"c":"'{t}' için A/B testi yaptım, bu versiyon daha çok tıklandı.","r":["Harika bir geri bildirim, sonuçları paylaşırsan birlikte iyileştirelim."]},
   {"c":"Uzunluk dengeli; Instagram'da kırpılmadan okunuyor.","r":["Evet, 120 kelime civarı idealdi."]},
   {"c":"Marka sesine uydurmak için örnek metin eklemek işe yarar mı?","r":["Çok işe yarar, 2-3 örnek cümle verince ton neredeyse birebir tutuyor."]},
   {"c":"SEO tarafında anahtar kelime yoğunluğu doğal, zorlama durmuyor.","r":["Anahtar kelimeyi tek cümlede belirtmen yeterli, kalanını doğal serpiştiriyor."]}
  ],
  "text_write": [
   {"c":"Anlatım akıcı, karakterin sesi tutarlı. Devamını merak ettim.","r":["Teşekkürler! Devamı için aynı konuşmada 'bir sonraki sahneyi yaz' demen yeterli."]},
   {"c":"'{t}' ile kısa bir öykü yazdım, ton gerçekten istediğim gibi çıktı.","r":["Çok sevindim, öyküyü paylaşırsan okumak isterim."]},
   {"c":"Yapı net, başlıklar mantıklı sıralanmış. Ders notları için kullanışlı.","r":["Madde sayısını sınırlamak okunabilirliği artırıyor."]},
   {"c":"Dil sade ve anlaşılır, öğrencilere vermek için ideal.","r":["Seviye bilgisini (lise/üniversite) eklersen daha da isabetli oluyor."]},
   {"c":"Resmî tonu iyi yakalamış, e-posta olarak doğrudan gönderilebilir.","r":["Kurum adını ve talebi eklemen yeterli, geri kalanı hazır."]},
   {"c":"Bu prompt'u biraz değiştirip şiir için denedim, ritim güzel çıktı.","r":["Güzel fikir! Ölçü ve kafiye isteyince daha da iyi oluyor."]},
   {"c":"Kaynaksız bilgi uydurma riski var mı? Araştırma özeti için soruyorum.","r":["'Yalnızca verilen metne dayan' demek bu riski belirgin biçimde azaltıyor."]}
  ],
  "video": [
   {"c":"Kamera hareketi çok akıcı, özne net kalıyor. Veo'da denedim, benzer sonuç aldım.","r":["Harika, kamera hareketini tek cümlede tarif etmek en önemli nokta."]},
   {"c":"Işık ve renk sinematik duruyor. 'color grading' için bir ifade ekledin mi?","r":["'teal and orange grading' gibi kısa bir ifade yeterli oluyor."]},
   {"c":"'{t}' için dikey formatta da deneyebilir miyim?","r":["Tabii, oranı 9:16 yapınca kadrajı da dikeye göre düzenle."]},
   {"c":"Süre kısa ama etkili, reklam girişi için ideal.","r":["Evet, 5-8 saniye çoğu platformda yeterli."]},
   {"c":"Karakter yüzü kareler arasında tutarlı mı? Genelde orada zorlanıyorum.","r":["Yakın plandan kaçınmak ve tek bir hareket tarif etmek tutarlılığı artırıyor."]},
   {"c":"Yavaş çekim hissi çok iyi verilmiş, detaylar öne çıkıyor.","r":["Teşekkürler, 'slow motion, 120fps' ifadesi işe yarıyor."]},
   {"c":"Müzikle birleştirince çok güzel olur, Suno parçalarından biriyle denedim.","r":["Süper kombinasyon! Tempoyu video süresine göre ayarlamak önemli."]}
  ],
  "audio": [
   {"c":"Melodi akılda kalıcı, miks de dengeli. Videomda arka plan olarak kullandım.","r":["Sevindim! Kullandığında etiketlersen görmek isterim."]},
   {"c":"Tempo ve atmosfer tam istediğim gibi, '{t}' çalışırken çok iyi eşlik ediyor.","r":["Çalışma sırasında dinlemek için özellikle düşük BPM seçtim."]},
   {"c":"Vokal olmadan da bu kadar dolu çıkması etkileyici.","r":["'instrumental' eklemek enstrümanları öne çıkarıyor."]},
   {"c":"Suno'da denedim, ilk üretimde yakın bir sonuç aldım.","r":["Birkaç üretim daha dene, her seferinde küçük varyasyonlar çıkıyor."]},
   {"c":"Enstrüman tarifi çok iyi; yaylılar gerçekten sahnelenmiş gibi.","r":["Enstrümanı ve duyguyu birlikte yazmak sonuca doğrudan yansıyor."]},
   {"c":"Fragman için yükselen bir bölüm istesem hangi kelimeyi eklemeliyim?","r":["'building crescendo' ifadesi sonda güzel bir yükseliş veriyor."]}
  ],
  "req_image": [
   {"c":"Bu isteğe bir yanıt hazırlıyorum, referans görselin çözünürlüğü yeterli mi?","r":["Evet yeterli, ek bir örnek görsel de paylaşabilirim."]},
   {"c":"Stil olarak tam olarak hangi yönü istediğini örnekle netleştirir misin?","r":["Tabii, açıklamaya iki örnek bağlantı ekledim."]},
   {"c":"Çok net bir istek, hangi araç tercih ediliyor?","r":["Midjourney veya GPT Image, hangisi olursa olur."]},
   {"c":"Renk paleti için bir kısıt var mı? Kurumsal renk gerekiyorsa baştan bilmek isterim.","r":["Pastel tonlar tercihim, kurumsal bir renk zorunlu değil."]},
   {"c":"Bu konuda daha önce paylaşılmış bir prompt var, belki başlangıç için işine yarar.","r":["Teşekkürler, bakıp ona göre uyarlayacağım."]}
  ],
  "req_text": [
   {"c":"Ton ve hedef kitleyi biraz daha açabilir misin? Ona göre yanıt hazırlayayım.","r":["Genç profesyoneller ve samimi ama saygılı bir ton."]},
   {"c":"Örnek bir çıktı verebilir misin, uzunluk için bir beklentin var mı?","r":["120-150 kelime civarı yeterli olur."]},
   {"c":"Bu isteğe yanıtım hazır, birkaç varyasyon sundum, beğenirsen seçebilirsin.","r":["Harika, hemen bakıyorum, teşekkürler!"]},
   {"c":"Bu tür bir istek için değişkenli bir şablon iyi olur, böylece tekrar kullanabilirsin.","r":["Mükemmel fikir, değişkenli sürümü bekliyorum."]}
  ],
  "req_code": [
   {"c":"Hangi dil ve framework sürümünü hedefliyorsun? Yanıtı ona göre yazayım.","r":["TypeScript ve Next.js, güncel sürüm."]},
   {"c":"Test beklentisi var mı? Birim test örneği de ekleyebilirim.","r":["Evet, birim test örneği çok işime yarar."]},
   {"c":"Prompt'u üretim kalitesinde istersen 'hata yönetimi' ve 'edge case' ifadelerini ekle.","r":["Anladım, isteği buna göre güncelliyorum."]}
  ],
  "req_media": [
   {"c":"Süre ve format için bir tercihin var mı? (dikey/yatay)","r":["Dikey, 15 saniye civarı olsun."]},
   {"c":"Referans bir parça ya da video örneği verirsen havayı daha iyi yakalarım.","r":["Haklısın, ekledim."]},
   {"c":"Bu istek için bir yanıt yayınladım, tempo ve atmosfer için birkaç alternatif denedim.","r":["Süper, dinleyip dönüş yapacağım."]}
  ],
  "generator": [
   {"c":"Alanlar çok mantıklı sıralanmış, ilk kullanımda bile ne seçeceğim belli.","r":["Teşekkürler! Alan sırasını sık kullanılan seçimlere göre kurguladım."]},
   {"c":"'{t}' ile birkaç prompt üretip denedim, çıktı tutarlı geliyor.","r":["Sevindim, geri bildirimin için sağ ol."]},
   {"c":"Bu generator'a bir 'ton' alanı eklenirse harika olur.","r":["Güzel öneri, bir sonraki sürümde ekliyorum."]},
   {"c":"Seçenekler yeterli ama 'çıktı oranı' alanı da olsa çok iyi olurdu.","r":["Haklısın, eklemeyi planlıyorum."]},
   {"c":"Prompt metni düzgün birleşiyor, hiç bozuk cümle çıkmadı.","r":["Alan etiketlerini cümle akışına göre adlandırmak bunu sağlıyor."]},
   {"c":"Derli toplu bir araç olmuş, ekip içinde paylaşacağım.","r":["Paylaşırsan çok sevinirim, geri bildirimleri bekliyorum."]}
  ],
  "workflow": [
   {"c":"Adımların birbirine bağlanması çok mantıklı, çıktı bir sonrakine temiz akıyor.","r":["Teşekkürler, her adımda çıktıyı net etiketlemek akışı sadeleştirdi."]},
   {"c":"'{t}' akışını kendi işimde denedim, ikinci adımı kısaltınca süre yarıya indi.","r":["Güzel bulgu, ikinci adım gerçekten en uzun olanıydı."]},
   {"c":"Bu akışa bir kontrol adımı eklemek faydalı olabilir (örn. kalite kontrol promptu).","r":["İyi fikir, kontrol adımını ekleyip güncelleyeceğim."]},
   {"c":"Hangi araçları sırayla kullandığını net yazman çok yardımcı oldu.","r":["Tekrar üretilebilir olması için bilerek ayrıntılı yazdım."]}
  ],
  "preset": [
   {"c":"Ayarlar çok dengeli, '{t}' ilk denemede istediğim havayı verdi.","r":["Sevindim! Prompt metnine sadece konuyu yazman yeterli."]},
   {"c":"Işık ve lens seçimi tam yerinde, kendi promptuma da uyguladım.","r":["Harika, kaydedip başka projelerde de kullanabilirsin."]},
   {"c":"Kaydettim, haftalık içerik üretimimde standart ayar olacak.","r":["Çok sevindim, kullanırken eklemek istediğin alan olursa söyle."]},
   {"c":"Detay seviyesini biraz daha düşürünce daha doğal oldu, öneririm.","r":["Güzel gözlem, bunu not alıyorum."]},
   {"c":"Hazır ayar fikri çok pratik; her seferinde aynı parametreleri yazmak zorunda kalmıyorum.","r":["Tam da bu yüzden hazırladım, faydalı olmasına sevindim."]},
   {"c":"Araç önerisi de yerinde, aynı ayarı farklı bir araçta da denedim, tutarlı sonuç verdi.","r":["Teşekkürler, farklı araçlardaki sonucunu duymak çok değerli."]}
  ]
  }$j$::jsonb;
  tg record;
  pool jsonb;
  pick record;
  n int;
  au uuid;
  cid uuid;
  liker uuid;
  used uuid[];
  ts timestamptz;
  rts timestamptz;
  rep text;
  total int := 0;
begin
  perform setseed(0.61);
  create temp table seed_targets on commit drop as
    select 'prompt'::text kind, p.id, p.title, p.author_id aid, p.created_at, p.like_count lc,
      (case when p.content_type = 'video' then 'video' when p.content_type = 'audio' then 'audio'
        when p.content_type = 'image' then (case when p.category in ('art_illustration', 'style') then 'img_art' when p.category = 'product_commercial' then 'img_product' when p.category = 'design' then 'img_design' else 'img_photo' end)
        else (case when p.category = 'coding' then 'text_code' when p.category in ('marketing', 'social_media', 'seo') then 'text_mkt' else 'text_write' end) end)::text fam
      from public.prompts p where p.deleted_at is null and p.status = 'published' and not exists (select 1 from public.prompt_comments c where c.prompt_id = p.id)
    union all
    select 'request', r.id, r.title, r.author_id, r.created_at, r.like_count,
      case when r.content_type = 'text' then (case when r.category = 'coding' then 'req_code' else 'req_text' end) when r.content_type = 'image' then 'req_image' else 'req_media' end
      from public.prompt_requests r where r.deleted_at is null and not r.is_draft and not exists (select 1 from public.prompt_comments c where c.request_id = r.id)
    union all
    select 'generator', g.id, g.title, g.creator_id, g.created_at, g.like_count, 'generator'
      from public.generators g where g.status = 'published' and not exists (select 1 from public.prompt_comments c where c.generator_id = g.id)
    union all
    select 'workflow', w.id, w.title, w.creator_id, w.created_at, w.like_count, 'workflow'
      from public.workflows w where w.status = 'published' and not exists (select 1 from public.prompt_comments c where c.workflow_id = w.id)
    union all
    select 'preset', s.id, s.title, s.creator_id, s.created_at, s.like_count, 'preset'
      from public.presets s where s.status = 'published' and not exists (select 1 from public.prompt_comments c where c.preset_id = s.id);

  for tg in select * from seed_targets where fam = any (fams) loop
    pool := pools -> tg.fam;
    if pool is null then continue; end if;
    n := least(jsonb_array_length(pool), 1 + floor(random() * 3)::int + (case when tg.lc >= 10 then 1 else 0 end));
    used := '{}';
    for pick in select e.value as v from jsonb_array_elements(pool) with ordinality as e (value, ord) order by random() limit n loop
      select p.id into au from public.profiles p where p.id <> tg.aid and p.username <> 'aliq' and not (p.id = any (used)) order by random() limit 1;
      if au is null then exit; end if;
      used := used || au;
      ts := tg.created_at + interval '30 minutes' + random() * greatest(now() - tg.created_at - interval '1 hour', interval '1 minute');
      insert into public.prompt_comments (prompt_id, request_id, generator_id, workflow_id, preset_id, author_id, body, parent_id, created_at)
      values (case when tg.kind = 'prompt' then tg.id end, case when tg.kind = 'request' then tg.id end, case when tg.kind = 'generator' then tg.id end,
              case when tg.kind = 'workflow' then tg.id end, case when tg.kind = 'preset' then tg.id end,
              au, replace(pick.v ->> 'c', '{t}', tg.title), null, ts)
      returning id into cid;
      total := total + 1;
      for liker in select p.id from public.profiles p where p.id <> au and p.username <> 'aliq' order by random() limit floor(random() * 5)::int loop
        insert into public.comment_likes (comment_id, user_id, created_at) values (cid, liker, least(ts + interval '5 minutes' + random() * interval '3 days', now()));
      end loop;
      if random() < 0.6 then
        rep := pick.v -> 'r' ->> floor(random() * jsonb_array_length(pick.v -> 'r'))::int;
        rts := least(ts + interval '15 minutes' + random() * interval '2 days', now() - interval '1 minute');
        insert into public.prompt_comments (prompt_id, request_id, generator_id, workflow_id, preset_id, author_id, body, parent_id, created_at)
        values (case when tg.kind = 'prompt' then tg.id end, case when tg.kind = 'request' then tg.id end, case when tg.kind = 'generator' then tg.id end,
                case when tg.kind = 'workflow' then tg.id end, case when tg.kind = 'preset' then tg.id end,
                tg.aid, rep, cid, rts)
        returning id into cid;
        total := total + 1;
        for liker in select p.id from public.profiles p where p.id <> tg.aid and p.username <> 'aliq' order by random() limit floor(random() * 4)::int loop
          insert into public.comment_likes (comment_id, user_id, created_at) values (cid, liker, least(rts + interval '5 minutes' + random() * interval '2 days', now()));
        end loop;
      end if;
    end loop;
  end loop;
  raise notice 'eklenen yorum/yanıt: %', total;
end
$seed$;
