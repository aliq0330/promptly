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
