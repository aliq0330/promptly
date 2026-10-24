-- Promptly — güvenlik/sosyal mantık sertleştirmesi (docs/history/224-*).
--
-- 1. Engelleme tek yerde uygulanır: engelli taraf içeriği/yorumu OKUYAMAZ (RESTRICTIVE RLS — feed_page, for_you_page,
--    search_content, detay ve profil sorguları hepsi INVOKER olduğundan otomatik kapsanır), yanıt/yorum beğenisi/takip engellidir.
-- 2. Askıya alma / paylaşım engeli: yeni yazma yolları (Space, topluluk, alıntı…) ve KENDİ içeriğini düzenleme de kapsanır.
-- 3. Rapor: aynı kişi aynı hedefi açıkken ikinci kez raporlayamaz; günlük sınır.
-- 4. Genel hız sınırı (`_rate_limit`): sunucu tarafı, geri alma (aç-kapa) ile aşılamaz.
-- 5. Serbest metin sütunlarına üst sınır.
-- 6. Kendi içeriğini beğenme yasak, engelli taraf beğenemez (yeni beğeniler; mevcut satırlara dokunulmaz).
-- 7. `profiles.is_demo` (örnek hesap rozeti) + eski bildirim temizliği.
-- 9. Tetikleyici fonksiyonların EXECUTE yetkisi kapatılır, sabit olmayan search_path düzeltilir.
--
-- Yalnızca ekleyici/değiştirici: `drop table/column` yok. `drop trigger if exists` yalnızca bu dosyanın yeniden oynatılabilmesi içindir.

-- === 2. Ortak denetim: _assert_can_act ===========================================================================================
create or replace function public._assert_can_act(p_content boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  if auth.uid() is null then return; end if;
  select * into v from public.profiles where id = auth.uid();
  if not found then return; end if;
  if v.suspended_until is not null and v.suspended_until > now() then
    raise exception 'Hesabın geçici olarak askıya alındı.';
  end if;
  if p_content and v.posting_blocked then
    raise exception 'Hesabın için paylaşım yapma yetkisi kısıtlandı.';
  end if;
end $$;
revoke all on function public._assert_can_act(boolean) from public, anon, authenticated;

-- Eski davranış aynen korunur (aynı imza, aynı iletiler); gövde ortak yardımcıdan geçer.
create or replace function public.enforce_can_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_can_act(tg_argv[0] = 'content');
  return new;
end $$;
revoke all on function public.enforce_can_post() from public, anon, authenticated;

-- Önceden kapsanmayan yazma yolları (RPC'ler bu tablolara yazar; kimlik yine auth.uid()).
do $$
declare r record;
begin
  for r in select * from (values
    ('spaces', 'content'), ('chat_groups', 'content'), ('community_posts', 'content'), ('content_quotes', 'content'),
    ('space_items', 'content'), ('chat_group_join_requests', 'all')
  ) as t(tbl, mode) loop
    if to_regclass('public.' || r.tbl) is not null
       and not exists (select 1 from pg_trigger where tgname = r.tbl || '_enforce_can_post' and tgrelid = ('public.' || r.tbl)::regclass) then
      execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_can_post(%L)',
                     r.tbl || '_enforce_can_post', r.tbl, r.mode);
    end if;
  end loop;
end $$;

-- Kendi satırını DEĞİŞTİRME (düzenleme): yalnızca sahibin kendi eylemi ve yalnızca sayaç/zaman damgası dışı bir alan değiştiyse.
-- Başkasının eylemiyle sayaç güncellemesi (auth.uid() sahip değil) ve soft-delete (deleted_at) engellenmez.
create or replace function public._strip_volatile(j jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(j) as e
  where e.key !~ '(_count$|^updated_at$|^deleted_at$|^edited_at$)'
$$;
revoke all on function public._strip_volatile(jsonb) from public, anon, authenticated;

create or replace function public.enforce_can_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if auth.uid() is null or (v_old ->> tg_argv[0]) is distinct from auth.uid()::text then return new; end if;
  if public._strip_volatile(v_old) = public._strip_volatile(v_new) then return new; end if;
  perform public._assert_can_act(tg_argv[1] = 'content');
  return new;
end $$;
revoke all on function public.enforce_can_edit() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select * from (values
    ('prompts', 'author_id', 'content'), ('prompt_requests', 'author_id', 'content'), ('workflows', 'creator_id', 'content'),
    ('presets', 'creator_id', 'content'), ('prompt_comments', 'author_id', 'content'), ('messages', 'sender_id', 'all')
  ) as t(tbl, owner_col, mode) loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_enforce_can_edit', r.tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.enforce_can_edit(%L, %L)',
                   r.tbl || '_enforce_can_edit', r.tbl, r.owner_col, r.mode);
  end loop;
end $$;

-- === 1. Engelleme ====================================================================================================================
-- Engelli taraf (iki yönde) birbirinin içeriğini ve yorumunu göremez. RESTRICTIVE: mevcut izinlerin ÜSTÜNE biner, onları genişletmez.
-- `is_blocked` SECURITY DEFINER (blocks tablosunu RLS yüzünden istemci okuyamaz). Moderatör muafiyeti YOK: moderasyon kuyruğu/yönetim
-- ekranları SECURITY DEFINER RPC'lerle okur, `is_moderator` ise anon'a kapalıdır (politikada çağrılırsa ziyaretçi sorguları patlar).
do $$
declare r record;
begin
  for r in select * from (values
    ('prompts', 'author_id'), ('prompt_requests', 'author_id'), ('workflows', 'creator_id'), ('presets', 'creator_id'),
    ('prompt_comments', 'author_id'), ('community_posts', 'author_id')
  ) as t(tbl, owner_col) loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_hide_blocked', r.tbl);
    execute format(
      'create policy %I on public.%I as restrictive for select using ((select auth.uid()) is null or not public.is_blocked((select auth.uid()), %I))',
      r.tbl || '_hide_blocked', r.tbl, r.owner_col);
  end loop;
end $$;

-- Engelli kişiyle etkileşim: takip, yoruma yanıt, yorum beğenisi.
create or replace function public.enforce_no_block_interaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_other uuid;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'follows' then
    v_other := new.following_id;
  elsif tg_table_name = 'prompt_comments' then
    if new.parent_id is null then return new; end if;
    select author_id into v_other from public.prompt_comments where id = new.parent_id;
  elsif tg_table_name = 'comment_likes' then
    select author_id into v_other from public.prompt_comments where id = new.comment_id;
  end if;
  if v_other is not null and public.is_blocked(auth.uid(), v_other) then
    raise exception 'interaction_blocked';
  end if;
  return new;
end $$;
revoke all on function public.enforce_no_block_interaction() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['follows', 'prompt_comments', 'comment_likes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_enforce_no_block', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_no_block_interaction()', t || '_enforce_no_block', t);
  end loop;
end $$;

-- === 4. Genel hız sınırı ==============================================================================================================
-- Geri alınabilen eylemler (beğeni/takip) satır sayarak sınırlanamaz (silinince sayı düşer); bu yüzden ayrı, yalnızca-ekleyen bir olay günlüğü.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx on public.rate_limit_events (user_id, action, created_at desc);
alter table public.rate_limit_events enable row level security; -- politika yok: yalnız SECURITY DEFINER fonksiyon yazar/okur

create or replace function public._rate_limit(p_action text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));
  select count(*) into v_count from public.rate_limit_events
    where user_id = v_uid and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'rate_limit';
  end if;
  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
  -- Bakım: yalnız bu kullanıcının, her koşulda gereksiz kalan (2 günden eski) olayları.
  delete from public.rate_limit_events where user_id = v_uid and created_at < now() - interval '2 days';
end $$;
revoke all on function public._rate_limit(text, integer, interval) from public, anon, authenticated;

create or replace function public.enforce_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._rate_limit(tg_argv[0], tg_argv[1]::integer, (tg_argv[2] || ' seconds')::interval);
  return new;
end $$;
revoke all on function public.enforce_rate_limit() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select * from (values
    ('prompts', 'prompt', 30, 3600), ('prompt_requests', 'request', 20, 3600), ('workflows', 'workflow', 20, 3600),
    ('presets', 'preset', 30, 3600), ('prompt_comments', 'comment', 60, 600), ('prompt_likes', 'like', 150, 600),
    ('comment_likes', 'comment_like', 150, 600), ('follows', 'follow', 60, 3600), ('messages', 'message', 300, 600),
    ('conversations', 'conversation', 30, 3600), ('collection_items', 'save', 200, 600), ('reports', 'report', 20, 86400)
  ) as t(tbl, act, mx, win) loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_rate_limit', r.tbl);
    execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_rate_limit(%L, %L, %L)',
                   r.tbl || '_rate_limit', r.tbl, r.act, r.mx::text, r.win::text);
  end loop;
end $$;

-- === 3. Rapor tekilliği ================================================================================================================
-- Açık bir rapor varken aynı kişi aynı hedefi tekrar raporlayamaz (çözülünce yeniden raporlayabilir).
create or replace function public.enforce_report_unique()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.reports
    where reporter_id = new.reporter_id and target_type = new.target_type and target_id = new.target_id and status = 'open'
  ) then
    raise exception 'report_duplicate';
  end if;
  return new;
end $$;
revoke all on function public.enforce_report_unique() from public, anon, authenticated;
drop trigger if exists reports_enforce_unique on public.reports;
create trigger reports_enforce_unique before insert on public.reports for each row execute function public.enforce_report_unique();
create unique index if not exists reports_open_unique_idx on public.reports (reporter_id, target_type, target_id) where status = 'open';

-- === 5. Metin uzunluğu sınırları ==========================================================================================================
-- NOT VALID + VALIDATE: önce yeni/değişen satırlara uygulanır, sonra mevcut veri taranır (ihlal varsa migration durur → bilinçli).
do $$
declare r record;
begin
  for r in select * from (values
    ('prompt_comments', 'prompt_comments_body_len', 'char_length(body) <= 2000'),
    ('messages', 'messages_body_len', 'char_length(body) <= 32000'),
    ('prompts', 'prompts_title_len', 'char_length(title) <= 200'),
    ('prompts', 'prompts_description_len', 'char_length(description) <= 5000'),
    ('prompts', 'prompts_prompt_text_len', 'char_length(prompt_text) <= 50000'),
    ('prompt_requests', 'prompt_requests_title_len', 'char_length(title) <= 200'),
    ('prompt_requests', 'prompt_requests_description_len', 'char_length(description) <= 5000'),
    ('prompt_requests', 'prompt_requests_direction_len', 'char_length(creative_direction) <= 5000'),
    ('profiles', 'profiles_bio_len', 'char_length(bio) <= 500'),
    ('profiles', 'profiles_display_name_len', 'char_length(display_name) <= 80'),
    ('profiles', 'profiles_website_len', 'char_length(website) <= 300')
  ) as t(tbl, cname, expr) loop
    if not exists (select 1 from pg_constraint where conname = r.cname) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.cname, r.expr);
      execute format('alter table public.%I validate constraint %I', r.tbl, r.cname);
    end if;
  end loop;
end $$;

-- === 6. Beğeni kuralları: kendi içeriğini beğenme yasak; engelli taraf beğenemez ======================================================
-- `prompt_likes` INSERT politikası hedefin okunabilirliğine bakmaz (yalnız user_id = auth.uid()), bu yüzden engel kontrolü burada.
create or replace function public.enforce_like_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if new.prompt_id is not null then
    select author_id into v_owner from public.prompts where id = new.prompt_id;
  elsif new.request_id is not null then
    select author_id into v_owner from public.prompt_requests where id = new.request_id;
  elsif new.workflow_id is not null then
    select creator_id into v_owner from public.workflows where id = new.workflow_id;
  elsif new.preset_id is not null then
    select creator_id into v_owner from public.presets where id = new.preset_id;
  elsif new.community_post_id is not null then
    select author_id into v_owner from public.community_posts where id = new.community_post_id;
  elsif new.space_id is not null then
    select owner_id into v_owner from public.spaces where id = new.space_id;
  elsif new.quote_id is not null then
    select author_id into v_owner from public.content_quotes where id = new.quote_id;
  end if;
  if v_owner is not null and v_owner = new.user_id then
    raise exception 'self_like_not_allowed';
  end if;
  if v_owner is not null and auth.uid() is not null and public.is_blocked(new.user_id, v_owner) then
    raise exception 'interaction_blocked';
  end if;
  return new;
end $$;
revoke all on function public.enforce_like_rules() from public, anon, authenticated;
drop trigger if exists prompt_likes_forbid_self on public.prompt_likes;
drop trigger if exists prompt_likes_like_rules on public.prompt_likes;
create trigger prompt_likes_like_rules before insert on public.prompt_likes for each row execute function public.enforce_like_rules();

-- === 7. Örnek (demo) hesap bayrağı + bildirim temizliği ====================================================================================
alter table public.profiles add column if not exists is_demo boolean not null default false;

-- Bayrağı yalnız sunucu (migration/seed/service_role) değiştirir; istemci ne ekleyebilir ne güncelleyebilir.
create or replace function public.protect_profile_demo_flag()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then new.is_demo := false; else new.is_demo := old.is_demo; end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_profile_demo_flag() from public, anon, authenticated;
drop trigger if exists profiles_protect_demo_flag on public.profiles;
create trigger profiles_protect_demo_flag before insert or update on public.profiles
  for each row execute function public.protect_profile_demo_flag();

-- Seed hesapları sabit kimlik kalıbını taşır (`5eed0000-0000-4000-8000-0000000000NN`, bkz. switch-account).
update public.profiles set is_demo = true where id::text like '5eed0000-0000-4000-8000-%' and not is_demo;

-- Okunmuş bildirimler 90 gün, hiç okunmayanlar 180 gün sonra silinir (bildirim kutusunun sınırsız büyümesini önler).
create or replace function public.prune_old_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  delete from public.notifications
  where (is_read and created_at < now() - interval '90 days')
     or created_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;
revoke all on function public.prune_old_notifications() from public, anon, authenticated;

-- === 9. Güvenlik uyarıları ===================================================================================================================
-- Tetikleyici fonksiyonlar `/rest/v1/rpc` ile çağrılamaz hâle gelir (CREATE TRIGGER zamanı dışında EXECUTE gerekmez).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- Sabit olmayan search_path (Supabase linter `function_search_path_mutable`).
alter function public.protect_collection_follower_count() set search_path = public;
