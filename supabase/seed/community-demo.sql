-- ============================================================================
-- Promptly topluluk demo tohumu — OTOMATİK ÜRETİLDİ, elle düzenleme.
-- Kaynak: supabase/seed/community-demo-content.mjs  →  node supabase/seed/build-community-seed.mjs
--
-- 14 topluluk (sahip: aliq; üyeler 5eed… demo hesapları), her birinde yerel prompt/istek/workflow/hazır ayar,
-- mevcut herkese açık içeriklerden başvuru gönderileri, duyuru, etkinlik, beğeni ve yorum.
-- Her adım ilgili kullanıcıya bürünülerek GERÇEK RPC/tetikleyicilerle yapılır. Tekrar çalıştırmak güvenli
-- (aynı adlı topluluk varsa atlanır). Tüm migration'ların (20260920110000 dahil) uygulanmış olması gerekir.
-- ============================================================================

-- --- Bölüm 01: Midjourney Atölyesi · Sinematik Video Lab · Copywriting Kulübü ---
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

-- --- Bölüm 02: Ses ve Müzik Üretimi · Workflow Mimarları · Prompt Okulu ---
do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  data constant jsonb := $json$[{"name":"Ses ve Müzik Üretimi","cat":"audio","vis":"public","members":["06","0a","0b","0f","11","04","08","12"],"desc":"Müzik, ses efekti ve seslendirme promptları: tür, tempo, enstrüman ve atmosfer tarifleri.","rules":"1) Telifli şarkıları referans gösterme, tür ve duygu tarif et.\n2) Süre ve tempo bilgisini ekle.","prompts":[{"a":"o","t":"Lo-fi çalışma müziği","d":"Odaklanma için yumuşak lo-fi parça.","x":"Lo-fi hip hop, 72 BPM, warm vinyl crackle, soft Rhodes chords, mellow drum loop, no vocals, 2 minutes, seamless loop","ct":"audio","tags":["lofi","müzik"],"vars":[]},{"a":"06","t":"Oyun menüsü müziği","d":"Hafif, döngüsel fantastik menü teması.","x":"Fantasy game menu theme, harp and soft strings, gentle choir pads, 90 BPM, calm and inviting, loopable, {süre} seconds","ct":"audio","tags":["oyun","müzik"],"vars":["süre"]},{"a":"0b","t":"Yağmurlu kafe atmosferi","d":"Arka plan ses manzarası.","x":"Ambience of a small cafe on a rainy day: distant chatter, cups clinking, soft rain on window, no music, 60 seconds stereo","ct":"audio","tags":["ambiyans","ses"],"vars":[]}],"request":{"a":"0f","t":"Podcast jeneriği için 15 saniyelik giriş müziği","d":"Teknoloji podcastim için enerjik ama rahatsız etmeyen kısa bir giriş istiyorum.","dir":"Elektronik tınılar, yükselen tempo, net bir bitiş."},"wf":{"a":"0a","t":"Tek fikirden jingle","d":"Marka jingle'ını üç adımda üret.","steps":[["Marka duygusu","Markayı üç sıfatla tarif et.",0],["Melodi tarifi","Tempo, enstrüman ve tür belirle.",1],["Final prompt","Parçayı üretmek için son promptu yaz.",2]]},"preset":{"a":"11","t":"Ambiyans ses ayarı","d":"Arka plan ses manzarası için dengeli parametreler.","pt":"audio"},"ann":[{"t":"Ses kalitesi ipuçları","b":"Üretilen sesleri paylaşırken ses düzeyini normalize et ve süreyi yaz. Böylece dinleyenler karşılaştırabilir.","pin":true}],"ev":[{"t":"Dinleme partisi","d":"Üyelerin ürettiği parçaları birlikte dinliyoruz.","days":10,"url":"https://meet.example.com/ses"}],"apps":[{"k":"prompt","ct":"audio","n":4}],"idx":4,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Workflow Mimarları","cat":"workflow","vis":"public","members":["05","08","0c","10","12","03","0e","0d"],"desc":"Birden fazla promptu sıraya dizen akışlar: adım tasarımı, girdi-çıktı bağlama ve tekrar kullanılabilir hatlar.","rules":"1) Her adımın girdisini ve çıktısını açıkça yaz.\n2) Akışın hangi araçlarla çalıştığını belirt.","prompts":[{"a":"o","t":"Adım çıktısını özetleyici","d":"Önceki adımın çıktısını sonraki adıma hazırlar.","x":"Aşağıdaki çıktıyı bir sonraki adımda kullanılacak şekilde 5 madde halinde özetle. Sadece gerekli bilgiyi bırak.\n\n{çıktı}","ct":"text","tags":["workflow","özet"],"vars":["çıktı"]},{"a":"05","t":"Görsel brief hazırlayıcı","d":"Fikri görsel üretim brief'ine çevirir.","x":"{fikir} fikrini görsel üretim için brief'e çevir: konu, stil, ışık, kompozisyon, kaçınılacaklar.","ct":"text","tags":["workflow","brief"],"vars":["fikir"]},{"a":"0c","t":"Kalite kontrol listesi","d":"Çıktıyı yayın öncesi denetler.","x":"Şu çıktıyı yayın öncesi kontrol et: tutarlılık, dil bilgisi, marka tonu, olgusal hatalar. Sorunları listele ve düzeltilmiş halini ver.\n\n{çıktı}","ct":"text","tags":["workflow","kalite"],"vars":["çıktı"]}],"request":{"a":"10","t":"Haftalık içerik takvimi hattı","d":"Tek konudan 7 günlük sosyal medya takvimi üreten bir akış tasarlamak istiyorum, öneri var mı?","dir":"Konu → fikirler → metinler → görsel brief sırası."},"wf":{"a":"o","t":"Fikirden yayına içerik hattı","d":"Bir fikri üç adımda yayına hazır içeriğe çevirir.","steps":[["Brief çıkar","Fikri brief'e çevir.",1],["Metni yaz","Brief'e göre metni oluştur.",0],["Kontrol et","Yayın öncesi kalite kontrolü yap.",2]]},"preset":{"a":"08","t":"Tutarlı ton ayarı","d":"Akışın tüm adımlarında aynı tonu korumak için.","pt":"text"},"ann":[{"t":"Akış şablonu","b":"Yeni akış paylaşırken şu şablonu kullanalım: amaç, girdiler, adımlar, çıktı. Okuyanlar için çok kolaylaştırıyor.","pin":true}],"ev":[{"t":"Akış tasarım atölyesi","d":"Üyelerin akışlarını birlikte iyileştiriyoruz.","days":5,"url":"https://meet.example.com/workflow"}],"apps":[{"k":"workflow","n":3},{"k":"prompt","ct":"text","n":1}],"idx":5,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Prompt Okulu","cat":"learning","vis":"public","members":["07","09","0b","0f","11","03","04","06"],"desc":"Sıfırdan başlayanlar için adım adım prompt yazma dersleri, alıştırmalar ve geri bildirim.","rules":"1) Soru sormaktan çekinme.\n2) Yanıtlarken nazik ve açıklayıcı ol.","prompts":[{"a":"o","t":"Rol – görev – biçim şablonu","d":"Her prompta uygulanabilen üç parçalı yapı.","x":"Sen {rol} olarak davran. Görevin: {görev}. Yanıtını {biçim} biçiminde ver. Bilmediğin yerde tahmin yürütme, belirt.","ct":"text","tags":["öğrenme","şablon"],"vars":["rol","görev","biçim"]},{"a":"07","t":"Kötü promptu iyileştir","d":"Belirsiz bir promptu adım adım netleştirir.","x":"Şu promptu daha net hale getir ve neyi neden değiştirdiğini açıkla: \"{prompt}\". Önce eksikleri listele, sonra yeni halini yaz.","ct":"text","tags":["öğrenme","geliştirme"],"vars":["prompt"]},{"a":"0f","t":"Örnek vererek öğretme (few-shot)","d":"Birkaç örnekle modelin tarzını yönlendir.","x":"Aşağıdaki örnekleri incele ve aynı tarzda {sayı} yeni örnek üret.\n\nÖrnek 1: {örnek1}\nÖrnek 2: {örnek2}","ct":"text","tags":["öğrenme","few-shot"],"vars":["sayı","örnek1","örnek2"]}],"request":{"a":"11","t":"Görsel promptlarda negatif ifade nasıl yazılır?","d":"Istenmeyen öğeleri görsel promptlarda nasıl dışarıda bırakırım? Araçlara göre farklı örnekler görmek isterim.","dir":"Midjourney ve diğer araçlar için kısa karşılaştırmalı örnekler."},"wf":{"a":"09","t":"Prompt yazma rutini","d":"Her yeni prompt için izlenecek 3 adımlık rutin.","steps":[["Amacı yaz","Ne elde etmek istediğini tek cümleyle yaz.",0],["İlk taslak","Şablonla ilk promptu yaz.",1],["İyileştir","Sonucu görüp promptu netleştir.",2]]},"preset":{"a":"03","t":"Öğretici yanıt tonu","d":"Sabırlı, örnek veren bir anlatım ayarı.","pt":"text"},"ann":[{"t":"Okula hoş geldiniz","b":"Haftada bir ders ve bir alıştırma paylaşıyoruz. Alıştırmalara yorum olarak cevap verebilirsin.","pin":true},{"t":"Bu haftanın alıştırması","b":"Verilen kötü promptu iyileştir ve değişikliklerini açıkla. Cevapları cumartesi birlikte inceleyeceğiz."}],"ev":[{"t":"Canlı soru-cevap","d":"Prompt yazarken takıldığın her şeyi sor.","days":3,"url":"https://meet.example.com/okul"},{"t":"Mezuniyet buluşması","d":"Dönem sonu paylaşım ve teşekkür oturumu.","days":25,"loc":"Çevrimiçi"}],"apps":[{"k":"prompt","ct":"text","n":3},{"k":"request","n":1}],"idx":6,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]}]$json$::jsonb;
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

-- --- Bölüm 03: Portre ve Karakter Tasarımı · Ürün Fotoğrafı ve E-ticaret · Kod Asistanı Promptları ---
do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  data constant jsonb := $json$[{"name":"Portre ve Karakter Tasarımı","cat":"image","vis":"public","members":["0c","0e","03","09","0a","10","12","07"],"desc":"Gerçekçi portreler, ilüstrasyon karakterleri ve karakter tutarlılığı üzerine ipuçları.","rules":"1) Gerçek kişilerin yüzlerini kullanma.\n2) Karakter tutarlılığı ipuçlarını paylaş.","prompts":[{"a":"o","t":"Stüdyo portre ışığı","d":"Rembrandt ışıklı klasik portre.","x":"Studio portrait of {kişi}, Rembrandt lighting, 85mm f/1.8, shallow depth of field, natural skin texture, neutral gray backdrop","ct":"image","tags":["portre","ışık"],"vars":["kişi"]},{"a":"0c","t":"Karakter sayfası (turnaround)","d":"Ön, yan, arka görünüm tek sayfada.","x":"Character turnaround sheet of {karakter}, front side and back views, neutral pose, flat color, clean line art, white background","ct":"image","tags":["karakter","tasarım"],"vars":["karakter"]},{"a":"10","t":"Fantastik elf savaşçı","d":"Detaylı zırh ve doğal ışık.","x":"Elf warrior with intricate leaf-pattern armor, forest clearing, dappled sunlight, painterly style, highly detailed","ct":"image","tags":["fantastik","karakter"],"vars":[]}],"request":{"a":"0e","t":"Aynı karakteri farklı sahnelerde tutarlı üretmek","d":"Bir çocuk kitabı için aynı karakteri farklı sahnelerde çizmem gerekiyor. Tutarlılığı nasıl korurum?","dir":"Referans görsel kullanımı ve sabit prompt blokları için öneriler."},"wf":{"a":"03","t":"Karakterden poster'a","d":"Karakter tasarımından afişe giden hat.","steps":[["Karakter sayfası","Turnaround sayfasını üret.",1],["Portre","Ana karakter portresini üret.",0],["Poster","Portreyi afiş kompozisyonuna yerleştir.",2]]},"preset":{"a":"09","t":"Doğal ten dokusu","d":"Gerçekçi portreler için ten ve ışık ayarı.","pt":"image"},"ann":[{"t":"Etik hatırlatma","b":"Gerçek kişileri taklit eden portreler paylaşmıyoruz; kurgusal karakterlere odaklanalım.","pin":true}],"ev":[{"t":"Karakter tasarımı sohbeti","d":"Tutarlılık yöntemlerini konuşuyoruz.","days":7,"url":"https://meet.example.com/karakter"}],"apps":[{"k":"prompt","ct":"image","n":4}],"idx":7,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Ürün Fotoğrafı ve E-ticaret","cat":"image","vis":"public","members":["04","08","0d","11","05","0b","12","0f"],"desc":"Katalog, reklam ve sosyal medya için ürün görselleri: fon, ışık ve kompozisyon kalıpları.","rules":"1) Marka logolarını izinsiz kullanma.\n2) Önce/sonra karşılaştırması paylaşman çok değerli.","prompts":[{"a":"o","t":"Beyaz fonda katalog çekimi","d":"Temiz, gölgeli e-ticaret ürün görseli.","x":"Product photo of {ürün} on pure white background, soft shadow underneath, even softbox lighting, centered, 1:1, high detail","ct":"image","tags":["ürün","katalog"],"vars":["ürün"]},{"a":"04","t":"Yaşam tarzı sahnesi","d":"Ürünü gerçek hayat sahnesinde göster.","x":"Lifestyle photo of {ürün} on a wooden table by a sunny window, morning light, shallow depth of field, cozy home atmosphere","ct":"image","tags":["ürün","yaşam tarzı"],"vars":["ürün"]},{"a":"0d","t":"Pastel 3D ürün sahnesi","d":"Sosyal medya için pastel 3D render.","x":"3D render of {ürün} floating above a pastel podium, soft gradient background, clean studio lighting, minimal composition","ct":"image","tags":["3d","pastel","ürün"],"vars":["ürün"]}],"request":{"a":"08","t":"Takı ürünleri için makro çekim","d":"Küçük gümüş takılar için parıltıyı bozmayan makro ürün görseli arıyorum.","dir":"Koyu zemin, yumuşak yansıma, net odak."},"wf":{"a":"11","t":"Ürün görselinden reklam metnine","d":"Görseli ve metni birlikte üret.","steps":[["Ürün görseli","Katalog çekimini üret.",0],["Sahne","Yaşam tarzı sahnesini üret.",1],["Başlık","Görsele uygun reklam başlığı yazdır.",2]]},"preset":{"a":"05","t":"Yumuşak stüdyo ürün ışığı","d":"Sertliği azaltan ürün ışık ayarı.","pt":"image"},"ann":[{"t":"Aylık ürün yarışması","b":"Bu ay temamız ev dekorasyonu ürünleri. En iyi işler topluluk akışında öne çıkarılacak.","pin":true}],"ev":[{"t":"Ürün çekimi ipuçları","d":"Işık ve fon seçimini konuşuyoruz.","days":9,"url":"https://meet.example.com/urun"}],"apps":[{"k":"prompt","ct":"image","n":4}],"idx":8,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Kod Asistanı Promptları","cat":"text","vis":"public","members":["06","0a","0c","0e","03","08","10","11"],"desc":"Kod yazma, hata ayıklama, refactor ve code review için işe yarayan promptlar.","rules":"1) Gizli anahtar, token ve müşteri verisi paylaşma.\n2) Dil ve sürüm bilgisini belirt.","prompts":[{"a":"o","t":"Hata ayıklama asistanı","d":"Hata mesajından kök nedeni bulur.","x":"Aşağıdaki hata mesajı ve kodu incele. Önce olası kök nedenleri sırala, sonra en olası olanı gerekçesiyle düzelt.\n\nHata: {hata}\nKod:\n{kod}","ct":"text","tags":["kod","hata-ayıklama"],"vars":["hata","kod"]},{"a":"06","t":"Kod inceleme (code review)","d":"Pull request için yapıcı geri bildirim.","x":"Bu değişikliği code review yapar gibi incele: doğruluk, okunabilirlik, test kapsamı, performans. Her bulguyu önem derecesiyle yaz.\n\n{diff}","ct":"text","tags":["kod","review"],"vars":["diff"]},{"a":"0e","t":"Fonksiyon için birim testi","d":"Uç durumları da kapsayan test iskeleti.","x":"{dil} dilinde aşağıdaki fonksiyon için birim testleri yaz. Normal, sınır ve hata durumlarını kapsa.\n\n{fonksiyon}","ct":"text","tags":["kod","test"],"vars":["dil","fonksiyon"]}],"request":{"a":"0c","t":"Eski kodu refactor etmek için güvenli adımlar","d":"Test kapsamı zayıf eski bir modülü kırmadan nasıl refactor ederim? Prompt tabanlı bir yaklaşım arıyorum.","dir":"Önce karakterizasyon testi, sonra küçük adımlarla değişiklik."},"wf":{"a":"0a","t":"Özellikten pull request'e","d":"Küçük bir özelliği tasarım, kod ve test adımlarıyla geliştir.","steps":[["Tasarım notu","Değişikliği kısaca tasarla.",0],["Kodu yaz","Tasarıma uygun kodu üret.",1],["Testleri yaz","Fonksiyon için testleri oluştur.",2]]},"preset":{"a":"11","t":"Kısa ve net kod yanıtı","d":"Gereksiz açıklamayı azaltan yanıt ayarı.","pt":"text"},"ann":[{"t":"Kod paylaşım kuralı","b":"Paylaştığın promptlarda gizli anahtar veya şirket kodu bulunmasın. Örnekleri anonimleştirin.","pin":true}],"ev":[{"t":"Code review kulübü","d":"Birlikte bir PR inceliyoruz.","days":11,"url":"https://meet.example.com/kod"}],"apps":[{"k":"prompt","ct":"text","n":3},{"k":"workflow","n":1}],"idx":9,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]}]$json$::jsonb;
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

-- --- Bölüm 04: Mimari ve İç Mekân · Oyun Sanatı ve Konsept · Öğretmen Prompt Kütüphanesi ---
do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  data constant jsonb := $json$[{"name":"Mimari ve İç Mekân","cat":"image","vis":"restricted","members":["09","0b","0d","0f","04","07","12","03"],"desc":"Mimari görselleştirme ve iç mekân tasarımı için seçilmiş bir topluluk. Katılım başvuruyla.","rules":"1) Projelerde müşteri gizliliğine dikkat et.\n2) Ölçek ve malzeme bilgisini yaz.","prompts":[{"a":"o","t":"Skandinav oturma odası","d":"Açık renkli, doğal ışıklı iç mekân.","x":"Scandinavian living room, large windows, light oak floor, linen sofa, wool rug, morning daylight, architectural photography, 24mm","ct":"image","tags":["iç-mekân","skandinav"],"vars":[]},{"a":"09","t":"Brütalist müze cephesi","d":"Beton dokulu kamusal yapı.","x":"Brutalist museum facade, raw concrete, geometric voids, overcast sky, long shadows, wide angle architectural photo","ct":"image","tags":["mimari","brütalist"],"vars":[]},{"a":"0d","t":"Minimalist mutfak tasarımı","d":"Sade hatlı, ada tezgâhlı mutfak.","x":"Minimalist {renk} kitchen with island, hidden handles, stone countertop, indirect lighting, interior design magazine style","ct":"image","tags":["iç-mekân","mutfak"],"vars":["renk"]}],"request":{"a":"0f","t":"Gece ışıklandırmalı villa dış cephe","d":"Gece çekilmiş, havuz yansımalı modern villa görseli arıyorum.","dir":"Sıcak iç ışık, soğuk gece gökyüzü, uzun pozlama hissi."},"wf":{"a":"04","t":"Konseptten sunum görseline","d":"Mekân fikrini sunuma hazır görsele çevir.","steps":[["Mekân konsepti","Konsepti kısa bir metinle tanımla.",0],["Görselleştirme","Konsepti görsele dönüştür.",1],["Sunum notu","Görsele eşlik eden kısa not yaz.",2]]},"preset":{"a":"07","t":"Mimari fotoğraf ayarı","d":"Geniş açı, dengeli perspektif ve doğal ışık.","pt":"image"},"ann":[{"t":"Kapalı topluluk bilgilendirmesi","b":"Bu topluluk kapalıdır: içerikleri yalnızca üyeler görür. Başvuruları haftalık değerlendiriyoruz.","pin":true}],"ev":[{"t":"Proje sunumları","d":"Üyeler son projelerini gösteriyor.","days":12,"url":"https://meet.example.com/mimari"}],"apps":[{"k":"prompt","ct":"image","n":3}],"idx":10,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Oyun Sanatı ve Konsept","cat":"showcase","vis":"public","members":["05","0a","0e","10","06","0c","11","0d"],"desc":"Oyun konsept sanatı, karakter ve çevre tasarımı; üretilen işlerin vitrini.","rules":"1) Kendi işini paylaş, kaynağını belirt.\n2) Telifli oyun karakterlerini birebir kopyalama.","prompts":[{"a":"o","t":"Izometrik oyun haritası","d":"Küçük bir kasaba için izometrik harita.","x":"Isometric game map of a small {tema} village, hand-painted style, vibrant colors, clear paths, modular building tiles","ct":"image","tags":["oyun","izometrik"],"vars":["tema"]},{"a":"05","t":"Boss tasarımı","d":"Dev yaratık için dramatik konsept.","x":"Concept art of a giant {yaratık} boss, dramatic low angle, glowing weak points, dark fantasy environment, detailed scales","ct":"image","tags":["oyun","boss"],"vars":["yaratık"]},{"a":"0e","t":"Piksel sanat karakter seti","d":"Yürüyüş animasyonu için karakter.","x":"Pixel art character sprite sheet of {karakter}, 4-frame walk cycle, 32x32, limited 16-color palette, transparent background","ct":"image","tags":["piksel","oyun"],"vars":["karakter"]}],"request":{"a":"0a","t":"Cyberpunk şehir için UI ikon seti","d":"Mobil oyun için neon temalı 12'li ikon seti arıyorum.","dir":"Tutarlı çizgi kalınlığı, neon vurgu rengi, koyu zemin."},"wf":{"a":"10","t":"Karakterden oyun içi varlığa","d":"Konseptten oyunda kullanılabilir varlığa.","steps":[["Konsept","Karakter konseptini üret.",1],["Sprite","Piksel karakter setini üret.",2],["Dokümantasyon","Karakter için kısa tasarım notu yaz.",0]]},"preset":{"a":"06","t":"Fantastik konsept sanat stili","d":"Boyalı, dramatik ışıklı oyun konsepti.","pt":"image"},"ann":[{"t":"Vitrin kuralı","b":"Paylaşımlarına kısa bir 'nasıl yaptım' notu ekle. En öğretici işler aylık seçkide yer alıyor.","pin":true},{"t":"Aylık seçki yayında","b":"Geçen ayın en beğenilen oyun sanatı işlerini topluluk akışında sabitledik."}],"ev":[{"t":"Game jam hazırlığı","d":"Hafta sonu jam için tema ve ekip eşleştirme.","days":5,"url":"https://meet.example.com/jam"}],"apps":[{"k":"prompt","ct":"image","n":4}],"idx":11,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Öğretmen Prompt Kütüphanesi","cat":"learning","vis":"public","members":["07","0b","0f","03","09","0c","10","04"],"desc":"Öğretmenler için ders planı, ölçme-değerlendirme ve materyal hazırlama promptları.","rules":"1) Öğrenci verisi paylaşma.\n2) Kazanımlara uygunluğu belirt.","prompts":[{"a":"o","t":"40 dakikalık ders planı","d":"Kazanıma uygun, etkinlikli ders planı.","x":"{sınıf}. sınıf {ders} dersi için '{kazanım}' kazanımına yönelik 40 dakikalık ders planı hazırla: giriş, etkinlik, değerlendirme ve ev ödevi.","ct":"text","tags":["eğitim","ders-planı"],"vars":["sınıf","ders","kazanım"]},{"a":"07","t":"Seviyeli soru üretici","d":"Bloom taksonomisine göre sorular.","x":"{konu} konusunda Bloom taksonomisinin altı basamağına uygun birer soru yaz ve cevap anahtarını ekle.","ct":"text","tags":["eğitim","ölçme"],"vars":["konu"]},{"a":"0f","t":"Veli bilgilendirme mektubu","d":"Nazik ve net veli yazısı.","x":"{konu} hakkında velilere kısa, nazik ve net bir bilgilendirme mektubu yaz. Tarihleri ve yapılması gerekenleri madde halinde ekle.","ct":"text","tags":["eğitim","iletişim"],"vars":["konu"]}],"request":{"a":"0b","t":"Özel gereksinimli öğrenciler için materyal uyarlaması","d":"Aynı etkinliği farklı öğrenme ihtiyaçlarına göre uyarlayan bir prompt arıyorum.","dir":"Basitleştirilmiş, görsel destekli ve zenginleştirilmiş üç sürüm."},"wf":{"a":"03","t":"Haftalık ders hazırlığı","d":"Plan, etkinlik ve değerlendirmeyi tek akışta hazırla.","steps":[["Ders planı","Haftalık planı oluştur.",0],["Sorular","Konuya uygun soruları üret.",1],["Veli mektubu","Haftalık bilgilendirmeyi yazdır.",2]]},"preset":{"a":"09","t":"Sade öğretmen anlatımı","d":"Yaşa uygun, sade dilde açıklama ayarı.","pt":"text"},"ann":[{"t":"Kütüphaneye katkı rehberi","b":"Paylaşırken sınıf düzeyini ve kazanımı yazarsan diğer öğretmenler çok daha kolay bulur.","pin":true}],"ev":[{"t":"Öğretmenler odası","d":"Hafta sonu sohbet: yapay zekâyı derslerde nasıl kullanıyoruz?","days":6,"url":"https://meet.example.com/ogretmen"}],"apps":[{"k":"prompt","ct":"text","n":4}],"idx":12,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]}]$json$::jsonb;
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

-- --- Bölüm 05: Hikâye Anlatıcıları · Haftanın Meydan Okuması ---
do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  data constant jsonb := $json$[{"name":"Hikâye Anlatıcıları","cat":"text","vis":"restricted","members":["0e","10","12","05","09","0b","03","07"],"desc":"Kurgu, karakter ve dünya kurma üzerine yazarlar topluluğu. Katılım başvuruyla.","rules":"1) Başkasının kurgusunu izinsiz kullanma.\n2) Eleştiride metne odaklan, kişiye değil.","prompts":[{"a":"o","t":"Karakter biyografisi çıkarıcı","d":"Derinliği olan karakter geçmişi.","x":"{karakter} için kısa bir biyografi yaz: çocukluk yarası, en büyük korku, gizli arzu ve hikâyedeki çelişkisi.","ct":"text","tags":["kurgu","karakter"],"vars":["karakter"]},{"a":"0e","t":"Dünya kurma soruları","d":"Fantastik bir dünyayı derinleştirir.","x":"{dünya} adlı dünya için 10 soru sor: iktisat, din, teknoloji, günlük yaşam. Sonra her soruya ilham verici bir cevap öner.","ct":"text","tags":["kurgu","dünya"],"vars":["dünya"]},{"a":"10","t":"Plot twist üreticisi","d":"Hikâyeye beklenmedik ama tutarlı dönüş.","x":"Şu hikâye özetine tutarlı ama beklenmedik 3 olay örgüsü dönüşü öner: {özet}. Her birinin nasıl hazırlanabileceğini açıkla.","ct":"text","tags":["kurgu","olay-örgüsü"],"vars":["özet"]}],"request":{"a":"12","t":"Korku hikâyesi için gerilim kurma kalıbı","d":"Kısa bir korku hikâyesinde gerilimi adım adım artıran bir prompt arıyorum.","dir":"Açık şiddet olmadan atmosfer ve belirsizlik odaklı."},"wf":{"a":"05","t":"Kısa hikâye yazım hattı","d":"Fikirden ilk taslağa üç adım.","steps":[["Karakter","Ana karakterin biyografisini çıkar.",0],["Dünya","Dünyayı soru-cevapla derinleştir.",1],["Dönüş","Olay örgüsü dönüşlerini belirle.",2]]},"preset":{"a":"09","t":"Edebi anlatım tonu","d":"Betimleme ağırlıklı, akıcı anlatım ayarı.","pt":"text"},"ann":[{"t":"Atölye düzeni","b":"Ayda bir ortak hikâye zinciri yazıyoruz; sıra sende olduğunda duyuru yapılacak.","pin":true}],"ev":[{"t":"Ortak okuma gecesi","d":"Üyeler yazdıkları bölümleri sesli okuyor.","days":13,"url":"https://meet.example.com/hikaye"}],"apps":[{"k":"prompt","ct":"text","n":3}],"idx":13,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]},{"name":"Haftanın Meydan Okuması","cat":"showcase","vis":"public","members":["03","04","05","06","07","08","09","0a"],"desc":"Her hafta yeni bir tema, herkese açık yarışma havası: üret, paylaş, oyla.","rules":"1) Tema dışına çıkma.\n2) Her hafta tek başvuru.\n3) Kazanan topluluk akışında öne çıkarılır.","prompts":[{"a":"o","t":"Meydan okuma: retro-fütüristik şehir","d":"Bu haftanın görsel teması.","x":"Retro-futuristic city skyline, 1960s sci-fi poster style, pastel sky, floating transit pods, bold shapes, {renk} accent color","ct":"image","tags":["meydan-okuma","retro"],"vars":["renk"]},{"a":"03","t":"Meydan okuma: tek cümlelik korku","d":"Metin teması.","x":"Sadece tek cümlede, hiç şiddet kullanmadan {mekan} mekânında ürkütücü bir an anlat.","ct":"text","tags":["meydan-okuma","kısa"],"vars":["mekan"]},{"a":"09","t":"Meydan okuma: 20 saniyelik ses manzarası","d":"Ses teması.","x":"20-second soundscape of an abandoned space station, distant metallic creaks, faint radio static, low drone, no melody","ct":"audio","tags":["meydan-okuma","ses"],"vars":[]}],"request":{"a":"06","t":"Gelecek haftanın teması için öneriler","d":"Gelecek haftanın meydan okuması için tema fikirleri toplayalım. Hangi temayı görmek isterdiniz?","dir":"Görsel, metin ve ses için uygun olabilecek geniş temalar."},"wf":{"a":"o","t":"Meydan okumaya hazırlık hattı","d":"Temayı anla, fikir üret, promptu cilala.","steps":[["Temayı çöz","Temanın ana imgelerini listele.",0],["Fikirler","Üç farklı yaklaşım önerisi al.",1],["Cilala","Seçtiğin fikri tam promptuna çevir.",2]]},"preset":{"a":"07","t":"Retro poster estetiği","d":"Düz renk, kalın şekil ve vintage doku.","pt":"image"},"ann":[{"t":"Bu haftanın teması açıklandı","b":"Retro-fütüristik şehir! Pazar gecesine kadar başvurunu paylaş. Oylama pazartesi başlıyor.","pin":true},{"t":"Geçen haftanın kazananları","b":"Kazananları tebrik ederiz. İşleri topluluk akışında pinledik; ilham almak için bakın."}],"ev":[{"t":"Oylama ve sonuç oturumu","d":"Haftanın işlerini birlikte oylayıp sonuçları açıklıyoruz.","days":2,"url":"https://meet.example.com/meydan"},{"t":"Tema belirleme oturumu","d":"Gelecek ayın temalarını birlikte seçiyoruz.","days":16,"loc":"Çevrimiçi"}],"apps":[{"k":"prompt","ct":"image","n":3},{"k":"prompt","ct":"video","n":1}],"idx":14,"notes":["Bu topluluğun temasına çok uyuyor, bakmanızı öneririm.","Geçen hafta denedim, sonuçtan çok memnun kaldım.","Kendi işlerimde sık kullandığım bir kalıp.","Yeni başlayanlar için güzel bir örnek.","Konuyla ilgili bir tartışma açmak istedim."]}]$json$::jsonb;
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
