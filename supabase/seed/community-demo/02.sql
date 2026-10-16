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
