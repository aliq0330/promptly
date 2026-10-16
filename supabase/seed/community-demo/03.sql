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
