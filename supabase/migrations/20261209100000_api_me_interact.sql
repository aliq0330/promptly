-- ci:allow-destructive
-- Kişisel API: "interact" (etkileşim) kapsamı + Sana özel / Takip akışı, koleksiyonlar ve beğeni · kaydet · koleksiyon · takip okuma/yazma RPC'leri
-- (docs/history/432-*). Chrome uzantısı ve diğer istemciler için.
--
-- KAPSAM: `read` (okuma) · `write` (YALNIZ özel taslak, 321-*) · `interact` (YENİ: başkasının herkese açık promptuna tepki/kaydet/koleksiyona ekle/
-- "Çalıştı mı?" oyu ve kişi takibi — kullanıcının sitede zaten yapabildiği, geri alınabilir işler; yayınlama/silme/yorum YOK). OAuth'ta kullanıcı onay
-- ekranında ayrıca işaretler (varsayılan KAPALI); anahtarda oluştururken seçilir.
--
-- Bu dosya iki şey yapar: (1) kapsam kısıtlarını GENİŞLETİR (eski kayıtlar geçerli kalır) ve `oauth_decide`'ı `p_interact` ile yeniden tanımlar — eski 3 argümanlı
-- imza yenisiyle çağrılabildiği (varsayılanlı) için düşürülür; çağıran istemci değişmeden çalışır (bu yüzden `-- ci:allow-destructive`);
-- (2) yeni `api_me_*` RPC'leri ekler (hepsi SECURITY INVOKER: çağıranın RLS'i, askısı, hız sınırı ve tetikleyicileri geçerlidir; kendi kuralımızı yazmayız).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Kapsam kısıtları
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.api_tokens drop constraint if exists api_tokens_scopes_check;
alter table public.api_tokens add constraint api_tokens_scopes_check
  check (cardinality(scopes) between 1 and 3 and scopes <@ array['read', 'write', 'interact']);
alter table public.oauth_grants drop constraint if exists oauth_grants_scopes_check;
alter table public.oauth_grants add constraint oauth_grants_scopes_check
  check (cardinality(scopes) between 1 and 3 and scopes <@ array['read', 'write', 'interact']);
alter table public.oauth_codes drop constraint if exists oauth_codes_scopes_check;
alter table public.oauth_codes add constraint oauth_codes_scopes_check
  check (cardinality(scopes) between 1 and 3 and scopes <@ array['read', 'write', 'interact']);

create or replace function public.create_api_token(p_name text, p_scopes text[] default array['read'], p_expires_in_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_scopes text[];
  v_token text;
  v_row public.api_tokens;
  v_active integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid_name'; end if;

  select coalesce(array_agg(distinct s order by s), '{}') into v_scopes from unnest(coalesce(p_scopes, array['read'])) as s;
  if cardinality(v_scopes) = 0 or not (v_scopes <@ array['read', 'write', 'interact']) then raise exception 'invalid_scope'; end if;
  if p_expires_in_days is not null and p_expires_in_days not in (30, 90, 365) then raise exception 'invalid_expiry'; end if;

  perform public._assert_can_act('write' = any (v_scopes));

  perform pg_advisory_xact_lock(hashtextextended('api_token:' || v_uid::text, 0));
  perform public._rate_limit('api_token_create', 20, interval '1 hour');

  delete from public.api_tokens
   where user_id = v_uid
     and grant_id is null
     and coalesce(revoked_at, expires_at) < now() - interval '180 days';

  select count(*) into v_active from public.api_tokens
   where user_id = v_uid and grant_id is null and revoked_at is null and (expires_at is null or expires_at > now());
  if v_active >= 10 then raise exception 'token_limit'; end if;

  v_token := 'pmt_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.api_tokens (user_id, name, token_hash, prefix, scopes, expires_at)
  values (v_uid, v_name, encode(extensions.digest(v_token, 'sha256'), 'hex'), left(v_token, 8), v_scopes,
          case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end)
  returning * into v_row;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_uid, null, 'system',
          format('Yeni bir API anahtarı oluşturuldu: "%s" (%s…). Sen oluşturmadıysan hemen iptal et.', v_name, v_row.prefix),
          '/settings', 'api_token_created:' || v_row.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('id', v_row.id, 'token', v_token, 'prefix', v_row.prefix, 'name', v_row.name,
                            'scopes', to_jsonb(v_row.scopes), 'expires_at', v_row.expires_at, 'created_at', v_row.created_at);
end;
$$;

-- Onay: `p_interact` varsayılan KAPALI. Eski 3 argümanlı imza düşer (yenisi varsayılanla aynı çağrıyı karşılar; iki imza birlikte "benzersiz değil" hatası verirdi).
drop function if exists public.oauth_decide(text, boolean, boolean);
create or replace function public.oauth_decide(p_request text, p_approve boolean, p_write boolean default false, p_interact boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.oauth_requests;
  v_code text;
  v_scopes text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.oauth_requests where id_hash = public._oauth_hash(p_request) and expires_at > now() for update;
  if not found then raise exception 'request_not_found'; end if;
  delete from public.oauth_requests where id_hash = v_req.id_hash;

  if not coalesce(p_approve, false) then
    return jsonb_build_object('redirect_uri', v_req.redirect_uri,
                              'params', jsonb_strip_nulls(jsonb_build_object('error', 'access_denied', 'state', v_req.state)));
  end if;

  perform public._assert_can_act(coalesce(p_write, false));
  perform public._rate_limit('oauth_approve', 30, interval '1 hour');

  v_scopes := array['read']
    || case when coalesce(p_write, false) then array['write'] else array[]::text[] end
    || case when coalesce(p_interact, false) then array['interact'] else array[]::text[] end;
  v_code := public._oauth_random();
  insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
  values (public._oauth_hash(v_code), v_req.client_id, v_uid, v_req.redirect_uri, v_req.code_challenge, v_scopes, v_req.resource, now() + interval '5 minutes');
  update public.oauth_clients set last_authorized_at = now() where id = v_req.client_id;

  return jsonb_build_object('redirect_uri', v_req.redirect_uri,
                            'params', jsonb_strip_nulls(jsonb_build_object('code', v_code, 'state', v_req.state)));
end;
$$;
revoke all on function public.oauth_decide(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.oauth_decide(text, boolean, boolean, boolean) to authenticated;

-- Hız sınırı kovaları: okuma 120/dk, yazma (taslak) 30/dk, etkileşim 60/dk. Eski `api_me_throttle(boolean)` olduğu gibi durur.
create or replace function public.api_me_throttle_kind(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind = 'write' then perform public._rate_limit('api_me_write', 30, interval '1 minute');
  elsif p_kind = 'interact' then perform public._rate_limit('api_me_interact', 60, interval '1 minute');
  else perform public._rate_limit('api_me_read', 120, interval '1 minute'); end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Okuma: akış, koleksiyonlar, benim durumum
-- ---------------------------------------------------------------------------------------------------------------------

-- Ana Sayfa akışı yalnız PROMPT için: 'for_you' = Sana özel (`for_you_page`, puanlama tamamen veritabanında; `p_as_of` oturum boyunca sabit tutulur),
-- 'following' = takip ettiklerim, kronolojik (`feed_page`). İki fonksiyon da INVOKER'dır; kimlik `auth.uid()`. Satır içeriği çağıranda doldurulur.
-- `reason_ref` yalnız etiket/araç/ilgi alanı için döner; takip edilen kişi (`creator`) için kimlik dışarı verilmez.
create or replace function public.api_me_feed(
  p_tab text, p_as_of timestamptz default null, p_content_type text default null, p_limit integer default 20,
  p_after_rank bigint default null, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, created_at timestamptz, sort_rank bigint, reason_kind text, reason_ref text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_tab = 'for_you' then
    return query
      select f.id, f.created_at, f.sort_rank, f.reason_kind,
             case when f.reason_kind in ('tag', 'liked_tag', 'interest', 'tool') then f.reason_ref else null end
      from public.for_you_page(p_as_of, array['prompt'], p_content_type, null::text, null::text, v_limit, p_after_rank, p_after_created_at, p_after_id) f
      where f.kind = 'prompt';
  elsif p_tab = 'following' then
    return query
      select f.id, f.created_at, f.sort_rank, null::text, null::text
      from public.feed_page('following', 'newest', array['prompt'], p_content_type, null::text, null::text, v_limit, p_after_rank, p_after_created_at, p_after_id) f
      where f.kind = 'prompt';
  else
    raise exception 'invalid_tab';
  end if;
end $$;

-- Koleksiyonlarım: sahibi olduklarım + ortak olduklarım (sistem koleksiyonu "Kaydedilenlerin tümü" listelenmez). Sayı yalnız PROMPT sayısıdır.
create or replace function public.api_me_collections()
returns table (id uuid, name text, visibility text, prompt_count integer, is_shared boolean, mine boolean, owner_username text, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name, c.visibility,
         (select count(*)::integer from public.collection_items ci where ci.collection_id = c.id and ci.prompt_id is not null),
         c.is_shared, c.owner_id = auth.uid(), pr.username, c.updated_at
  from public.collections c
  join public.profiles pr on pr.id = c.owner_id
  where not c.is_default
    and (c.owner_id = auth.uid() or exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = auth.uid()))
  order by c.updated_at desc, c.id desc
  limit 100;
$$;

-- Bir koleksiyondaki promptlar (okuyabildiklerim: yayında + herkese açık + topluluğa özgü değil), en son eklenen önce, keyset.
create or replace function public.api_me_collection_prompts(
  p_collection uuid, p_limit integer default 20, p_after_added_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, added_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, ci.created_at
  from public.collection_items ci
  join public.collections c on c.id = ci.collection_id
  join public.prompts p on p.id = ci.prompt_id
  where ci.collection_id = p_collection and not c.is_default
    and p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null
    and (p_after_added_at is null or (ci.created_at, p.id) < (p_after_added_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by ci.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

-- Benim durumum, bir grup prompt için (en çok 30): tepkim, kaydettim mi, hangi koleksiyonlarımda, yazarı takip ediyor muyum, "Çalıştı mı?" durumu.
-- `prompt_works_state` SECURITY DEFINER'dır ama yalnız sayılar + ÇAĞIRANIN kendi oyu/yetkisini döndürür (başkasının oyu sızmaz).
create or replace function public.api_me_engagement(p_ids uuid[])
returns table (prompt_id uuid, reaction text, saved boolean, collection_ids uuid[], author_username text, following_author boolean,
               works_yes integer, works_no integer, my_vote boolean, can_vote boolean)
language sql stable security invoker set search_path = public as $$
  select p.id,
         (select coalesce(l.reaction, 'love') from public.prompt_likes l where l.prompt_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
                  where ci.prompt_id = p.id and c.owner_id = auth.uid() and c.is_default),
         coalesce((select array_agg(ci.collection_id) from public.collection_items ci join public.collections c on c.id = ci.collection_id
                    where ci.prompt_id = p.id and not c.is_default
                      and (c.owner_id = auth.uid() or exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = auth.uid()))),
                  '{}'::uuid[]),
         pr.username,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id),
         w.yes_count, w.no_count, w.my_vote, w.can_vote
  from public.prompts p
  join public.profiles pr on pr.id = p.author_id
  cross join lateral public.prompt_works_state(p.id) w
  where p.id = any (p_ids[1:30])
    and p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Yazma (yalnız `interact` kapsamıyla çağrılır; veritabanında da INVOKER: sitedeki aynı RLS/tetikleyiciler)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._api_me_readable_prompt(p_prompt uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.prompts p
                  where p.id = p_prompt and p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null);
$$;

-- Tepki: p_reaction null → geri al. Dönüş: yeni tepki (ya da null). Her beğeni bir tepkidir (265-*).
create or replace function public.api_me_react(p_prompt uuid, p_reaction text)
returns text language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_reaction is not null and p_reaction not in ('love', 'fire', 'wow', 'clap', 'haha', 'idea') then raise exception 'invalid_reaction'; end if;
  if not public._api_me_readable_prompt(p_prompt) then raise exception 'not_found'; end if;
  if p_reaction is null then
    delete from public.prompt_likes where prompt_id = p_prompt and user_id = auth.uid();
    return null;
  end if;
  update public.prompt_likes set reaction = p_reaction where prompt_id = p_prompt and user_id = auth.uid();
  if not found then
    begin
      insert into public.prompt_likes (prompt_id, user_id, reaction) values (p_prompt, auth.uid(), p_reaction);
    exception when unique_violation then
      update public.prompt_likes set reaction = p_reaction where prompt_id = p_prompt and user_id = auth.uid();
    end;
  end if;
  return p_reaction;
end $$;

-- Kaydet / kaydedilenlerden kaldır (336-*): kaydetmek = sistem koleksiyonuna satır; kaldırmak = tüm koleksiyonlarımdan çıkar.
create or replace function public.api_me_set_saved(p_prompt uuid, p_saved boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_col uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_saved, false) then
    if not public._api_me_readable_prompt(p_prompt) then raise exception 'not_found'; end if;
    v_col := public.get_or_create_own_default_collection();
    insert into public.collection_items (collection_id, prompt_id) values (v_col, p_prompt) on conflict do nothing;
    return true;
  end if;
  perform public.unsave_content('prompt', p_prompt);
  return false;
end $$;

-- Koleksiyona ekle / çıkar (yalnız kendi ya da ortak olduğum, sistem olmayan koleksiyon). Çıkarmak kaydı ETKİLEMEZ.
create or replace function public.api_me_collection_item(p_collection uuid, p_prompt uuid, p_present boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.collections c
                  where c.id = p_collection and not c.is_default
                    and (c.owner_id = auth.uid() or exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = auth.uid()))) then
    raise exception 'collection_not_found';
  end if;
  if coalesce(p_present, false) then
    if not public._api_me_readable_prompt(p_prompt) then raise exception 'not_found'; end if;
    insert into public.collection_items (collection_id, prompt_id) values (p_collection, p_prompt) on conflict do nothing;
    return true;
  end if;
  delete from public.collection_items where collection_id = p_collection and prompt_id = p_prompt;
  return false;
end $$;

-- Kişi takibi (kullanıcı adıyla). Engel / kendini takip / hız sınırı tetikleyicileri sitedeki gibi çalışır.
create or replace function public.api_me_set_follow(p_username text, p_follow boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_target uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select pr.id into v_target from public.profiles pr where lower(pr.username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then raise exception 'not_found'; end if;
  if v_target = auth.uid() then raise exception 'self_follow_not_allowed'; end if;
  if coalesce(p_follow, false) then
    insert into public.follows (follower_id, following_id) values (auth.uid(), v_target) on conflict do nothing;
    return true;
  end if;
  delete from public.follows where follower_id = auth.uid() and following_id = v_target;
  return false;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Yetkiler: yalnız oturumlu (Edge Function işlemde `authenticated` rolüne geçer); ziyaretçi hiçbirini çağıramaz.
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public.api_me_throttle_kind(text) from public, anon;
revoke all on function public.api_me_feed(text, timestamptz, text, integer, bigint, timestamptz, uuid) from public, anon;
revoke all on function public.api_me_collections() from public, anon;
revoke all on function public.api_me_collection_prompts(uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.api_me_engagement(uuid[]) from public, anon;
revoke all on function public._api_me_readable_prompt(uuid) from public, anon;
revoke all on function public.api_me_react(uuid, text) from public, anon;
revoke all on function public.api_me_set_saved(uuid, boolean) from public, anon;
revoke all on function public.api_me_collection_item(uuid, uuid, boolean) from public, anon;
revoke all on function public.api_me_set_follow(text, boolean) from public, anon;
grant execute on function public.api_me_throttle_kind(text) to authenticated;
grant execute on function public.api_me_feed(text, timestamptz, text, integer, bigint, timestamptz, uuid) to authenticated;
grant execute on function public.api_me_collections() to authenticated;
grant execute on function public.api_me_collection_prompts(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.api_me_engagement(uuid[]) to authenticated;
grant execute on function public._api_me_readable_prompt(uuid) to authenticated;
grant execute on function public.api_me_react(uuid, text) to authenticated;
grant execute on function public.api_me_set_saved(uuid, boolean) to authenticated;
grant execute on function public.api_me_collection_item(uuid, uuid, boolean) to authenticated;
grant execute on function public.api_me_set_follow(text, boolean) to authenticated;
