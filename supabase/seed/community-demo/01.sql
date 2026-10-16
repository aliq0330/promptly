do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  data constant jsonb := $json$[{"name":"Midjourney Atölyesi","cat":"image","vis":"public","members":["03","05","07","09","0b","0d","0f","11"],"desc":"Midjourney ile üretilen görseller için prompt kalıpları, parametre denemeleri ve haftalık eleştiri oturumları.","rules":"1) Paylaştığın promptun nasıl çalıştığını kısaca yaz.\n2) Başkasının işini eleştirirken yapıcı ol.\n3) Telifli karakterleri birebir kopyalama.","prompts":[{"a":"o","t":"Sisli sabah sokak fotoğrafı","d":"Yağmur sonrası sisli bir sokakta sinematik atmosfer.","x":"{konum} sokağı, yağmur sonrası sabah sisi, ıslak kaldırım yansımaları, 35mm film grenli, yumuşak tungsten ışık --ar 3:2 --style raw","ct":"image","tags":["midjourney","sokak","sinematik"],"vars":["konum"]},{"a":"05","t":"Kil animasyon karakteri","d":"Stop-motion kil hissi veren sevimli karakter.","x":"claymation tarzı {karakter}, parmak izi dokusu, yumuşak stüdyo ışığı, sığ alan derinliği, pastel arka plan --stylize 250","ct":"image","tags":["midjourney","karakter","kil"],"vars":["karakter"]},{"a":"09","t":"Vintage seyahat posteri","d":"1950'ler tarzı litografi seyahat afişi.","x":"vintage travel poster of {şehir}, 1950s lithograph, flat colors, bold typography, limited palette of teal and orange","ct":"image","tags":["poster","vintage","midjourney"],"vars":["şehir"]}],"request":{"a":"07","t":"Cam ve su damlası makro dokusu","d":"Yağmurlu pencere camında odak dışı şehir ışıkları olan bir makro çekim arıyorum.","dir":"Bokeh ışıklar sıcak, damlalar net, soğuk mavi ton."},"wf":{"a":"o","t":"Konsept görselden varyasyona","d":"Tek bir fikirden tutarlı bir görsel seri üret.","steps":[["Ana kareyi üret","İlk promptla ana kareyi oluştur ve en iyisini seç.",0],["Varyasyon al","Seçtiğin kareden stilini koruyarak 4 varyasyon üret.",1],["Seri notları","Beğendiğin 3 kareyi birleştirip kısa bir tema notu yaz.",2]]},"preset":{"a":"0d","t":"Editoryal portre ışığı","d":"Dergi kapağı tadında yumuşak stüdyo ışığı kombinasyonu.","pt":"image"},"ann":[{"t":"Hoş geldiniz!","b":"Atölyeye hoş geldin. Her hafta bir tema belirliyoruz; promptunu paylaşırken kullandığın parametreleri yaz.","pin":true},{"t":"Bu haftanın teması: sisli şehir","b":"Cuma gününe kadar sisli şehir temalı işlerini paylaş, en çok beğenilenler pinlenecek."}],"ev":[{"t":"Canlı eleştiri oturumu","d":"Üyelerin işlerini birlikte inceliyoruz.","days":6,"url":"https://meet.example.com/mj-atolye"}],"apps":[{"k":"prompt","ct":"image","n":4}],"idx":1,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Sinematik Video Lab","cat":"video","vis":"public","members":["04","06","08","0a","0c","0e","10","12"],"desc":"Kamera hareketi, çekim dili ve tutarlı sahneler: video üretim promptlarının laboratuvarı.","rules":"1) Süre ve oran bilgisini ekle.\n2) Prompta kamera hareketini mutlaka yaz.\n3) Reklam içeriği paylaşma.","prompts":[{"a":"o","t":"Dolly-in ile gün batımı sahnesi","d":"Yavaş yaklaşan kamera, altın saat ışığı.","x":"Slow dolly-in on {özne} standing on a cliff at golden hour, volumetric light, anamorphic lens flare, 24fps, cinematic color grade","ct":"video","tags":["video","sinematik","dolly"],"vars":["özne"]},{"a":"04","t":"Drone açılış çekimi","d":"Şehre alçalan geniş açılış planı.","x":"Aerial drone shot descending over {şehir} at dawn, mist between buildings, smooth gimbal motion, 4K, 16:9","ct":"video","tags":["drone","video"],"vars":["şehir"]},{"a":"0a","t":"Yağmurda neon yürüyüş","d":"Takip çekimiyle cyberpunk sokak.","x":"Tracking shot following a person in a transparent raincoat through neon-lit alley, reflections on wet asphalt, handheld feel, shallow depth of field","ct":"video","tags":["cyberpunk","neon","video"],"vars":[]}],"request":{"a":"10","t":"Ürün tanıtımı için 360° dönüş çekimi","d":"Parlak yüzeyli bir ürünün stüdyoda yavaşça dönen temiz bir videosunu arıyorum.","dir":"Beyaz sonsuzluk fon, yumuşak yansımalar, 8 saniye döngü."},"wf":{"a":"06","t":"Senaryodan sahneye","d":"Kısa bir senaryoyu üç adımda videoya dönüştür.","steps":[["Senaryo taslağı","Sahneyi bir paragrafta anlat.",0],["Kamera planı","Her çekim için kamera hareketini belirle.",1],["Video promptu","Plana göre video promptunu üret.",2]]},"preset":{"a":"o","t":"Sinematik renk paleti","d":"Turuncu-camgöbeği kontrastıyla filmsel bir görünüm.","pt":"video"},"ann":[{"t":"Laboratuvar kuralları","b":"Her promptta süre, oran ve kamera hareketi belirtilmeli. Böylece sonuçlar karşılaştırılabilir.","pin":true}],"ev":[{"t":"Kamera hareketleri atölyesi","d":"Dolly, pan, tilt ve crane hareketlerini promptlarda nasıl tarif edeceğimizi konuşuyoruz.","days":4,"url":"https://meet.example.com/video-lab"},{"t":"Aylık gösterim","d":"Üyelerin ürettiği kısa videoların gösterimi.","days":20,"loc":"Çevrimiçi"}],"apps":[{"k":"prompt","ct":"video","n":4}],"idx":2,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Copywriting Kulübü","cat":"text","vis":"public","members":["03","07","09","0c","0e","10","12","05"],"desc":"Reklam metni, e-posta, ürün açıklaması ve slogan promptları. Deneyimlerini ve kalıplarını paylaş.","rules":"1) Kalıpları kendi markana göre uyarla.\n2) Gerçek müşteri verisi paylaşma.","prompts":[{"a":"o","t":"Ürün açıklaması: fayda odaklı","d":"Özellik değil fayda anlatan kısa ürün metni.","x":"{ürün} için 80 kelimelik bir ürün açıklaması yaz. Önce müşterinin sorununu, sonra çözümü anlat; en fazla bir teknik terim kullan. Ton: {ton}.","ct":"text","tags":["copywriting","e-ticaret"],"vars":["ürün","ton"]},{"a":"07","t":"Soğuk e-posta açılışı","d":"İlk cümlede ilgi çeken kısa e-posta.","x":"{sektör} sektöründeki bir karar vericiye 4 cümlelik soğuk e-posta yaz. İlk cümle onların güncel bir hedefine değinsin. Satış yapma, sohbet başlat.","ct":"text","tags":["e-posta","satış"],"vars":["sektör"]},{"a":"0e","t":"Slogan fabrikası","d":"Bir markadan 10 slogan alternatifi.","x":"{marka} için 10 slogan öner: 3 kısa (3 kelime), 4 orta, 3 duygusal. Her birinin altına tek cümle gerekçe yaz.","ct":"text","tags":["slogan","marka"],"vars":["marka"]}],"request":{"a":"09","t":"Bülten başlığı için A/B varyantları","d":"Haftalık bir tasarım bülteni için açılma oranını artıracak başlık kalıpları arıyorum.","dir":"Merak uyandıran ama tık tuzağı olmayan, 50 karakteri geçmeyen başlıklar."},"wf":{"a":"03","t":"Kampanya metni hattı","d":"Fikirden yayına kadar tek akış.","steps":[["Hedef kitle özeti","Kitleyi ve temel sorunu tanımla.",0],["Ana mesaj","Tek cümlelik ana mesajı yazdır.",1],["Kanal uyarlamaları","Mesajı e-posta ve sosyal medya için uyarla.",2]]},"preset":{"a":"10","t":"Samimi marka sesi","d":"Sıcak ama profesyonel metin tonu ayarı.","pt":"text"},"ann":[{"t":"Kulübe hoş geldin","b":"Her ay bir kalıp seçip hep birlikte geliştiriyoruz. Ekibin için işe yarayan kalıpları paylaşmaktan çekinme.","pin":true},{"t":"Bu ayın kalıbı: AIDA","b":"Dikkat, İlgi, Arzu, Eylem yapısını promptlarda nasıl kurarız? Haftaya örneklerle gelelim."}],"ev":[{"t":"Canlı metin atölyesi","d":"Getirdiğiniz metinleri birlikte iyileştiriyoruz.","days":8,"url":"https://meet.example.com/copy"}],"apps":[{"k":"prompt","ct":"text","n":4}],"idx":3,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]}]$json$::jsonb;
  comments constant text[] := array['Çok güzel olmuş, denedim ve sonuç harika çıktı!', 'Bu kalıbı kendi işimde kullanacağım, teşekkürler.', 'Değişkenleri biraz değiştirince çok farklı sonuçlar veriyor, süper.', 'Açıklaması çok net, tam aradığım şeydi.', 'Ben şunu da ekledim, sonuç daha tutarlı geldi.', 'Paylaşım için sağ ol, kaydettim.', 'Biraz daha detay verirsen yeni başlayanlara çok yardımcı olur.', 'Sonuçları görmek isterdim, çıktıyı da paylaşır mısın?', 'Harika fikir, topluluğa çok yakışmış.', 'Bunu bir workflow''a bağlamak çok mantıklı olur.', 'İlk denemede olmadı ama ikincisinde tam istediğim gibi oldu.', 'Tarz olarak çok başarılı, ellerine sağlık.']::text[];
  com jsonb; cid uuid; codes text[]; code text; mid uuid; author uuid; member uuid;
  p jsonb; step jsonb; ev jsonb; app jsonb; r record; tpl public.presets;
  i int; k int; n int; cnt int; off int;
  pid uuid; rid uuid; wid uuid; sid uuid; prev_sid uuid; evid uuid; content_id uuid; post_id uuid;
  prompt_ids uuid[]; first_prompt uuid; h int;
begin
  for com in select value from jsonb_array_elements(data) loop
    if exists (select 1 from public.chat_groups g where g.name = com->>'name' and g.created_by = aliq) then
      raise notice 'atlandı (zaten var): %', com->>'name';
      continue;
    end if;
    select array_agg(value) into codes from jsonb_array_elements_text(com->'members');

    -- etiketler (sistem yazar)
    execute 'reset role';
    insert into public.tags (slug, label)
      select distinct t, t from jsonb_array_elements(com->'prompts') pr, jsonb_array_elements_text(pr->'tags') t
    on conflict (slug) do nothing;

    -- 1) sahip topluluğu kurar ve üyeleri davet eder
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (aliq)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (aliq), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    cid := (public.create_community(com->>'name', com->>'desc', com->>'vis', null, 256,
      (select array_agg((demo || c)::uuid) from unnest(codes) c), com->>'cat', 'members', 'members', com->>'rules', false) ->> 'group_id')::uuid;

    -- 2) üyeler daveti kabul eder
    foreach code in array codes loop
      mid := (demo || code)::uuid;
      execute 'reset role'; perform set_config('request.jwt.claim.sub', (mid)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (mid), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
      perform public.respond_community_invitation(
        (select iv.id from public.chat_group_invitations iv where iv.group_id = cid and iv.invitee_id = mid and iv.status = 'pending'), true, false);
    end loop;

    -- 3) roller: ilk üye yönetici, ikinci üye moderatör
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (aliq)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (aliq), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    perform public.set_chat_group_member_role(cid, (demo || codes[1])::uuid, 'admin');
    perform public.set_chat_group_member_role(cid, (demo || codes[2])::uuid, 'moderator');

    -- 4) topluluğa özgü prompt'lar (normal oluşturma yolu: community_id dolu → sunucu private'a zorlar, akış gönderisini ekler)
    prompt_ids := '{}';
    for i in 0 .. jsonb_array_length(com->'prompts') - 1 loop
      p := com->'prompts'->i;
      pid := md5(cid::text || 'p' || i)::uuid;
      author := case when p->>'a' = 'o' then aliq else (demo || (p->>'a'))::uuid end;
      execute 'reset role'; perform set_config('request.jwt.claim.sub', (author)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (author), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
      insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id)
        values (pid, author, p->>'t', p->>'d', p->>'x', p->>'ct', 'published', 'private', cid);
      insert into public.prompt_variables (prompt_id, name, sort_order)
        select pid, v.name, (v.ord - 1)::int from jsonb_array_elements_text(p->'vars') with ordinality as v(name, ord);
      insert into public.prompt_tags (prompt_id, tag_slug) select pid, t from jsonb_array_elements_text(p->'tags') t;
      prompt_ids := prompt_ids || pid;
    end loop;
    first_prompt := prompt_ids[1];

    -- 5) topluluğa özgü istek
    p := com->'request';
    rid := md5(cid::text || 'r')::uuid;
    author := case when p->>'a' = 'o' then aliq else (demo || (p->>'a'))::uuid end;
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (author)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (author), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    insert into public.prompt_requests (id, author_id, title, description, creative_direction, is_draft, visibility, community_id)
      values (rid, author, p->>'t', p->>'d', p->>'dir', false, 'private', cid);

    -- 6) topluluğa özgü workflow (adımlar topluluğun kendi promptlarına bağlanır)
    p := com->'wf';
    wid := md5(cid::text || 'w')::uuid;
    author := case when p->>'a' = 'o' then aliq else (demo || (p->>'a'))::uuid end;
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (author)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (author), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    insert into public.workflows (id, creator_id, title, description, status, visibility, community_id)
      values (wid, author, p->>'t', p->>'d', 'published', 'private', cid);
    prev_sid := null;
    for i in 0 .. jsonb_array_length(p->'steps') - 1 loop
      step := p->'steps'->i;
      sid := md5(cid::text || 'w-step' || i)::uuid;
      insert into public.workflow_steps (id, workflow_id, position, title, description, instructions, step_type, prompt_id, inputs, outputs)
        values (sid, wid, i, step->>0, step->>1, step->>1, 'prompt', prompt_ids[(step->>2)::int + 1],
          case when prev_sid is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
            'id', 'in_' || (i + 1), 'label', p->'steps'->(i - 1)->>0, 'source', jsonb_build_object('stepId', prev_sid, 'outputId', 'out_' || i))) end,
          jsonb_build_array(jsonb_build_object('id', 'out_' || (i + 1), 'label', step->>0)));
      if prev_sid is not null then
        insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key)
          values (wid, prev_sid, sid, 'out_' || i, 'in_' || (i + 1));
      end if;
      prev_sid := sid;
    end loop;

    -- 7) topluluğa özgü hazır ayar (kategori/seçimler var olan bir herkese açık hazır ayardan türetilir; yoksa boş)
    p := com->'preset';
    author := case when p->>'a' = 'o' then aliq else (demo || (p->>'a'))::uuid end;
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (author)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (author), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    select * into tpl from public.presets s
      where s.community_id is null and s.status = 'published' and s.visibility = 'public' and s.content_type = p->>'pt'
      order by s.like_count desc, s.id offset ((com->>'idx')::int % 5) limit 1;
    insert into public.presets (id, creator_id, title, description, content_type, category, subcategory, tools, selection, status, visibility, community_id)
      values (md5(cid::text || 's')::uuid, author, p->>'t', p->>'d', p->>'pt', tpl.category, tpl.subcategory,
        coalesce(tpl.tools, '{}'), coalesce(tpl.selection, '{}'::jsonb), 'published', 'private', cid);

    -- 8) başvuru gönderileri: mevcut herkese açık içerikler (üyeler dönüşümlü paylaşır, ilkini sahip)
    k := 0;
    for app in select value from jsonb_array_elements(com->'apps') loop
      for i in 0 .. (app->>'n')::int - 1 loop
        execute 'reset role';
        off := ((com->>'idx')::int * 4 + i);
        if app->>'k' = 'prompt' then
          select count(*) into cnt from public.prompts x where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.content_type = app->>'ct';
          select x.id into content_id from public.prompts x where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.content_type = app->>'ct'
            order by x.like_count desc, x.id offset (off % greatest(cnt, 1)) limit 1;
        elsif app->>'k' = 'request' then
          select count(*) into cnt from public.prompt_requests x where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null;
          select x.id into content_id from public.prompt_requests x where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
            order by x.like_count desc, x.id offset (off % greatest(cnt, 1)) limit 1;
        elsif app->>'k' = 'workflow' then
          select count(*) into cnt from public.workflows x where x.status = 'published' and x.visibility = 'public' and x.community_id is null;
          select x.id into content_id from public.workflows x where x.status = 'published' and x.visibility = 'public' and x.community_id is null
            order by x.like_count desc, x.id offset (off % greatest(cnt, 1)) limit 1;
        else
          select count(*) into cnt from public.presets x where x.status = 'published' and x.visibility = 'public' and x.community_id is null;
          select x.id into content_id from public.presets x where x.status = 'published' and x.visibility = 'public' and x.community_id is null
            order by x.like_count desc, x.id offset (off % greatest(cnt, 1)) limit 1;
        end if;
        continue when content_id is null;
        author := case when k = 0 then aliq else (demo || codes[1 + (k % array_length(codes, 1))])::uuid end;
        execute 'reset role'; perform set_config('request.jwt.claim.sub', (author)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (author), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
        perform public.share_to_community(cid, app->>'k', content_id, case when k % 2 = 0 then null else (select value from jsonb_array_elements_text(com->'notes') with ordinality as t(value, ord) where ord = 1 + (k % jsonb_array_length(com->'notes'))) end);
        k := k + 1;
      end loop;
    end loop;

    -- 9) sahip ilk promptun gönderisini sabitler; duyurular ve etkinlikler
    execute 'reset role'; perform set_config('request.jwt.claim.sub', (aliq)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (aliq), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    perform public.set_community_post_pinned((select cp.id from public.community_posts cp where cp.community_id = cid and cp.prompt_id = first_prompt), true);
    for p in select value from jsonb_array_elements(com->'ann') loop
      perform public.publish_community_announcement(cid, p->>'t', p->>'b', coalesce((p->>'pin')::boolean, false), false, false);
    end loop;
    for ev in select value from jsonb_array_elements(com->'ev') loop
      evid := public.create_community_event(cid, ev->>'t', ev->>'d', now() + ((ev->>'days')::int * interval '1 day'), now() + ((ev->>'days')::int * interval '1 day') + interval '2 hours',
        'Europe/Istanbul', ev->>'loc', ev->>'url', false);
      for i in 1 .. least(array_length(codes, 1), 5) loop
        mid := (demo || codes[i])::uuid;
        execute 'reset role'; perform set_config('request.jwt.claim.sub', (mid)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (mid), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
        perform public.set_community_event_rsvp(evid, case when i % 4 = 0 then 'maybe' else 'going' end);
      end loop;
      execute 'reset role'; perform set_config('request.jwt.claim.sub', (aliq)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (aliq), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
      perform public.set_community_event_rsvp(evid, 'going');
    end loop;

    -- 10) beğeniler ve yorumlar (kimlik+gönderi özetinden belirleyici dağılım)
    execute 'reset role';
    for r in select cp.id, cp.kind, cp.author_id, cp.prompt_id, cp.request_id, cp.workflow_id, cp.preset_id from public.community_posts cp where cp.community_id = cid order by cp.created_at, cp.id loop
      foreach code in array array_append(codes, 'aliq') loop
        member := case when code = 'aliq' then aliq else (demo || code)::uuid end;
        continue when member = r.author_id;
        h := get_byte(decode(md5(member::text || r.id::text), 'hex'), 0);
        if h % 100 < 58 then
          execute 'reset role'; perform set_config('request.jwt.claim.sub', (member)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (member), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
          if r.kind = 'native' then
            insert into public.prompt_likes (user_id, prompt_id, request_id, workflow_id, preset_id) values (member, r.prompt_id, r.request_id, r.workflow_id, r.preset_id);
          else
            insert into public.prompt_likes (user_id, community_post_id) values (member, r.id);
          end if;
        end if;
        if h % 100 >= 74 then
          execute 'reset role'; perform set_config('request.jwt.claim.sub', (member)::text, true); perform set_config('request.jwt.claims', json_build_object('sub', (member), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
          if r.kind = 'native' then
            insert into public.prompt_comments (author_id, body, prompt_id, request_id, workflow_id, preset_id)
              values (member, comments[1 + (h % array_length(comments, 1))], r.prompt_id, r.request_id, r.workflow_id, r.preset_id);
          else
            insert into public.prompt_comments (author_id, body, community_post_id) values (member, comments[1 + (h % array_length(comments, 1))], r.id);
          end if;
        end if;
      end loop;
      execute 'reset role';
    end loop;

    raise notice 'oluşturuldu: % (%)', com->>'name', cid;
  end loop;
  execute 'reset role';
end
$seed$;
