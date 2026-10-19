-- ============================================================================
-- Promptly hikâye demo tohumu (docs/history/198-*).
--
-- Demo hesapların (5eed… ) ve `aliq`'ın hikâyeleri: renkli metin hikâyeleri, gerçek herkese açık içeriklere bağlı kartlar, anket,
-- soru, topluluk hikâyeleri, bir "takipçilere özel" hikâye, süresi dolmuş + öne çıkanda bir hikâye; görüntüleme, tepki, oy ve
-- soru yanıtları. Fotoğraf/video hikâyesi YOK (private `story-media` dosyası gerekir; seed'de dosya yok).
--
-- ÖNKOŞUL: `20260920170000_stories.sql` uygulanmış olmalı (+ topluluk demo tohumu: topluluk hikâyeleri için).
-- Süper kullanıcı (SQL Editor) olarak çalışır; RPC'ler yerine doğrudan satır ekler, sayaçlar satırlardan hesaplanır.
-- TEKRAR ÇALIŞTIRMAK GÜVENLİ: hikâyeler sabit `client_token` ile (yazar, jeton) tekil; ikinci çalıştırma hiçbir şey eklemez.
-- Zamanlar çalıştırma anına göredir (24 saatlik pencere): izlemek için çalıştırdıktan sonraki 24 saat içinde bak; yenilemek için
-- önce `delete from public.stories where client_token::text like '5eed5707-%';` çalıştırıp dosyayı yeniden çalıştır.
-- `aliq` demo yazarları takip etsin diye `follows` satırları da (yoksa) eklenir — şeritte görünmeleri için gerekli.
-- ============================================================================

do $seed$
declare
  aliq constant uuid := '9751db46-2715-48ac-a0fc-c61c5876f3c7';
  demo constant text := '5eed0000-0000-4000-8000-0000000000';
  -- a: yazar kodu ('o' = aliq) · m: kaç dakika önce · aud: public|followers|community
  -- l: [metin, y, boyut, renk, okunabilirlik zemini] · link: içerik kartı · poll/ask: çıkartma · exp: süresi dolmuş
  spec constant jsonb := $json$[
    {"k":"01","a":"03","m":35,"aud":"public","bg":"cobalt","l":[["Bu hafta ışıkla oynuyorum ✨",0.32,"m","white",false],["Altın saat + sis = bambaşka bir sahne",0.52,"m","yellow",false]]},
    {"k":"02","a":"03","m":20,"aud":"public","bg":"ink","link":true,"l":[["Yeni prompt yayında",0.2,"m","white",false]]},
    {"k":"03","a":"04","m":95,"aud":"public","bg":"sunset","l":[["Günün sorusu",0.25,"m","white",false],["Hangi model, hangi iş?",0.42,"l","white",false]],"poll":{"q":"Metin üretimi için favorin?","o":["Claude","GPT","Gemini","Yerel model"]}},
    {"k":"04","a":"05","m":140,"aud":"public","bg":"paper","l":[["Prompt yazarken tek kural",0.3,"m","black",false],["Önce hedefi yaz, sonra stili.",0.5,"m","cobalt",false]]},
    {"k":"05","a":"05","m":50,"aud":"public","bg":"forest","l":[["Soru kutusu açık 📬",0.3,"l","white",false]],"ask":"Bir sonraki hazır ayarım ne olsun?"},
    {"k":"06","a":"06","m":300,"aud":"public","bg":"berry","l":[["Moodboard sabahı",0.3,"l","white",true],["Pembe, kırmızı, biraz da mürekkep",0.55,"s","yellow",false]]},
    {"k":"07","a":"07","m":75,"aud":"public","bg":"ink","link":true,"l":[["Bunu denediniz mi?",0.18,"m","mint",false]]},
    {"k":"08","a":"08","m":600,"aud":"public","bg":"cobalt","l":[["Workflow haftası",0.3,"l","white",false],["3 adım, 1 sonuç.",0.5,"m","orange",false]]},
    {"k":"09","a":"09","m":25,"aud":"followers","bg":"berry","l":[["Sadece takipçilere:",0.3,"m","white",false],["Taslak prompt kütüphanemi paylaşıyorum.",0.5,"m","yellow",false]]},
    {"k":"10","a":"0a","m":180,"aud":"public","bg":"sunset","l":[["Sinematik video denemesi",0.3,"l","white",false]],"poll":{"q":"Hangi kamera hareketi?","o":["Dolly in","Orbit","Sabit çekim"]}},
    {"k":"11","a":"0b","m":420,"aud":"public","bg":"paper","l":[["Copywriting ipucu",0.28,"m","cobalt",false],["Başlığı yazmadan önce itirazı yaz.",0.5,"m","black",false]]},
    {"k":"12","a":"0c","m":65,"aud":"public","bg":"forest","l":[["Ses promptları geliyor 🎧",0.3,"l","mint",false]],"ask":"Hangi tür ses efektini görmek istersin?"},
    {"k":"13","a":"0d","m":15,"aud":"community","bg":"cobalt","l":[["Topluluk içi duyuru",0.28,"m","white",false],["Cuma günü canlı prompt atölyesi var!",0.5,"m","yellow",false]]},
    {"k":"14","a":"0e","m":110,"aud":"community","bg":"ink","l":[["Topluluğa özel ipucu",0.3,"m","orange",false],["Sadece üyeler görüyor 🤫",0.5,"m","white",false]]},
    {"k":"15","a":"0f","m":45,"aud":"public","bg":"sunset","link":true,"l":[["Bugünün favori promptu",0.18,"m","white",true]]},
    {"k":"16","a":"10","m":240,"aud":"public","bg":"berry","l":[["Dün gece 40 görsel ürettim",0.3,"m","white",false],["Birini seçmek zor oldu…",0.5,"l","yellow",false]]},
    {"k":"17","a":"o","m":30,"aud":"public","bg":"cobalt","l":[["Promptly'ye hikâyeler geldi 🎉",0.3,"m","white",false],["Fotoğraf, video, anket, soru…",0.52,"m","yellow",false]]},
    {"k":"18","a":"o","m":10,"aud":"public","bg":"ink","l":[["Sizce hangisi?",0.3,"l","white",false]],"poll":{"q":"En çok hangi içerik türü?","o":["Prompt","Workflow","Hazır ayar","İstek"]}},
    {"k":"19","a":"03","m":1800,"aud":"public","bg":"ink","exp":true,"l":[["Geçen haftanın favorisi",0.3,"l","white",false],["Sis içinde ormanlık yol.",0.5,"m","mint",false]]},
    {"k":"20","a":"03","m":2000,"aud":"public","bg":"sunset","exp":true,"l":[["Altın saat serisi",0.3,"l","white",false]]}
  ]$json$;
  emojis constant text[] := array['❤️','🔥','😂','😮','😢','👏','💡','🙌'];
  s jsonb; l jsonb; layers jsonb; layout jsonb; author uuid; code text;
  sid uuid; tok uuid; gid uuid; lp uuid; created timestamptz; expires timestamptz;
  sk text; sq text; so text[]; audience text; viewers uuid[]; v uuid; made int := 0; n int;
  ids20 uuid[] := array[]::uuid[]; hl uuid;
begin
  if to_regclass('public.stories') is null then
    raise exception 'Önce 20260920170000_stories.sql migration''ı uygulanmalı.';
  end if;

  -- aliq demo yazarları takip etsin (şerit takip ettiklerinin hikâyelerini gösterir)
  insert into public.follows (follower_id, following_id)
  select aliq, p.id from public.profiles p
   where p.id::text like '5eed0000-0000-4000-8000-0000000000%' and p.id <> aliq
  on conflict do nothing;

  for s in select value from jsonb_array_elements(spec) loop
    code := s->>'a';
    author := case when code = 'o' then aliq else (demo || code)::uuid end;
    if not exists (select 1 from public.profiles where id = author) then
      raise notice 'atlandı (hesap yok): %', code; continue;
    end if;
    tok := ('5eed5707-0000-4000-8000-0000000000' || (s->>'k'))::uuid;
    if exists (select 1 from public.stories where author_id = author and client_token = tok) then continue; end if;

    audience := s->>'aud';
    gid := null;
    if audience = 'community' then
      -- yazarın üyesi olduğu, aliq'ın kurduğu kapatılmamış ilk topluluk
      select g.id into gid
        from public.chat_groups g
        join public.conversation_members m on m.conversation_id = g.id and m.user_id = author
       where g.created_by = aliq and g.closed_at is null
       order by g.created_at limit 1;
      if gid is null then audience := 'public'; end if;
    end if;

    layers := coalesce((
      select jsonb_agg(jsonb_build_object('id', 'l' || ord, 'text', x->>0, 'x', 0.5, 'y', (x->>1)::numeric,
                                          'align', 'center', 'size', x->>2, 'color', x->>3, 'bg', (x->>4)::boolean) order by ord)
        from jsonb_array_elements(s->'l') with ordinality as t(x, ord)), '[]'::jsonb);
    layout := jsonb_build_object('v', 1, 'bg', s->>'bg', 'layers', layers);

    -- bağlantı kartı: yazarın (yoksa herhangi bir demo yazarın) yayında + herkese açık, topluluğa ait olmayan prompt'u
    lp := null;
    if (s->>'link')::boolean is true then
      select p.id into lp from public.prompts p
       where p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null
       order by (p.author_id = author) desc, p.like_count desc, p.id limit 1;
      if lp is not null then layout := layout || jsonb_build_object('link', jsonb_build_object('x', 0.5, 'y', 0.58)); end if;
    end if;

    sk := null; sq := null; so := null;
    if s ? 'poll' then
      sk := 'poll'; sq := s->'poll'->>'q';
      select array_agg(value) into so from jsonb_array_elements_text(s->'poll'->'o');
      layout := layout || jsonb_build_object('sticker', jsonb_build_object('x', 0.5, 'y', 0.72));
    elsif s ? 'ask' then
      sk := 'question'; sq := s->>'ask';
      layout := layout || jsonb_build_object('sticker', jsonb_build_object('x', 0.5, 'y', 0.7));
    end if;

    created := now() - make_interval(mins => (s->>'m')::int);
    expires := case when (s->>'exp')::boolean is true then now() - interval '2 hours' else created + interval '24 hours' end;
    if expires <= created then expires := created + interval '1 minute'; end if;
    -- süresi dolmuşlar için created_at, expires_at'ten önce kalmalı
    sid := gen_random_uuid();
    insert into public.stories (id, author_id, kind, layout, linked_type, linked_id, sticker_kind, sticker_question, sticker_options,
                                audience, community_id, client_token, created_at, expires_at)
    values (sid, author, 'text', layout, case when lp is not null then 'prompt' end, lp, sk, sq, so,
            audience, gid, tok, created, expires);
    made := made + 1;
    if (s->>'exp')::boolean is true then ids20 := ids20 || sid; end if;

    -- görüntüleyenler: topluluk hikâyesinde üyeler, takipçi hikâyesinde takipçiler, aksi hâlde rastgele demo hesaplar
    if audience = 'community' then
      select coalesce(array_agg(u), '{}') into viewers from (
        select m.user_id u from public.conversation_members m where m.conversation_id = gid and m.user_id <> author order by random() limit 7) q;
    elsif audience = 'followers' then
      select coalesce(array_agg(u), '{}') into viewers from (
        select f.follower_id u from public.follows f where f.following_id = author order by random() limit 7) q;
    else
      select coalesce(array_agg(u), '{}') into viewers from (
        select p.id u from public.profiles p where p.id <> author and p.id::text like '5eed0000-0000-4000-8000-0000000000%'
         order by random() limit 4 + floor(random() * 8)::int) q;
    end if;
    foreach v in array viewers loop
      insert into public.story_views (story_id, viewer_id, first_viewed_at, last_viewed_at, view_count)
      values (sid, v, created + interval '3 minutes' + random() * interval '20 minutes', created + interval '25 minutes', 1 + floor(random() * 2)::int)
      on conflict do nothing;
      if random() < 0.45 then
        insert into public.story_reactions (story_id, user_id, emoji, created_at)
        values (sid, v, emojis[1 + floor(random() * 8)::int], created + interval '10 minutes') on conflict do nothing;
      end if;
      if sk = 'poll' and random() < 0.8 then
        insert into public.story_poll_votes (story_id, voter_id, option_index, created_at)
        values (sid, v, floor(random() * cardinality(so))::int, created + interval '12 minutes') on conflict do nothing;
      end if;
      if sk = 'question' and random() < 0.5 then
        insert into public.story_question_answers (story_id, responder_id, body, created_at)
        values (sid, v, (array['Bence renk paleti odaklı bir set güzel olur.','Sinematik ışık varyasyonları!','Kısa ve net bir şablon, değişken alanlı.','Portre serisi için bir hazır ayar çok işe yarar.','Ürün fotoğrafı için olsun 🙏'])[1 + floor(random() * 5)::int],
                created + interval '15 minutes');
      end if;
    end loop;
    -- sayaçlar satırlardan (istemci/RPC yazmaz; süper kullanıcı olarak doğrudan hesaplanır)
    update public.stories x
       set viewer_count = (select count(*) from public.story_views where story_id = x.id),
           view_count = coalesce((select sum(view_count) from public.story_views where story_id = x.id), 0),
           reaction_count = (select count(*) from public.story_reactions where story_id = x.id)
     where x.id = sid;
  end loop;

  -- Öne çıkan: 03'ün süresi dolmuş iki hikâyesi + (varsa) etkin hikâyeleri; yalnız yoksa eklenir
  if array_length(ids20, 1) is not null then
    author := (demo || '03')::uuid;
    if not exists (select 1 from public.story_highlights where owner_id = author and title = 'Işık denemeleri') then
      hl := gen_random_uuid();
      insert into public.story_highlights (id, owner_id, title, cover_story_id, position) values (hl, author, 'Işık denemeleri', ids20[1], 0);
      insert into public.story_highlight_items (highlight_id, story_id, position)
      select hl, id, (row_number() over (order by created_at))::int
        from public.stories where author_id = author and client_token::text like '5eed5707-%';
    end if;
  end if;

  raise notice 'Hikâye demo tohumu: % yeni hikâye eklendi.', made;
end
$seed$;
