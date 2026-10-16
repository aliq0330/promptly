-- Topluluk gönderisi = kendi kimliği, beğenisi ve yorumları olan bağımsız bir varlık
-- (docs/history/178-*).
--
-- Sorun: `community_posts` bir içeriğe BAŞVURUDUR; beğeni/yorum altyapısı (`prompt_likes`,
-- `prompt_comments`) yalnız içerik hedeflerini (prompt/request/result/workflow/preset) tanır. Bu yüzden
-- topluluktaki bir gönderinin kendi beğenisi/yorumu olamıyordu: kartta görünen sayaçlar ORİJİNAL
-- içeriğinkiydi ve aynı içeriği iki topluluğa taşımak etkileşimi paylaştırıyordu.
--
-- Çözüm (en küçük güvenli değişiklik, paralel sistem yok, hiçbir veri silinmez/yeniden yazılmaz):
--   1) `prompt_likes` / `prompt_comments` ikisine de altıncı bir hedef: `community_post_id`
--      (FK → community_posts ON DELETE CASCADE; "tam biri dolu" CHECK'i genişler; hedef başına tekil
--      beğeni indeksi). Ayrı bir "topluluk yorumu" tablosu YOKTUR.
--   2) `community_posts.kind`: 'native' (içerik bu toplulukta oluşturuldu) | 'application' (var olan
--      içerikle başvuru) | 'legacy' (bu dosyadan ÖNCEKİ satırlar). Eski satırlar güvenilir biçimde
--      ayrılamaz — `?community=` ile oluşturma akışı da aynı `share_to_community` RPC'sini çağırıyordu —
--      bu yüzden TAHMİN EDİLMEZ, 'legacy' kalır ve başvuru gibi gösterilir.
--   3) `community_posts.like_count` / `comment_count`: korumalı sayaçlar (SECURITY DEFINER tetikleyici).
--      Gönderinin beğenisi orijinal içeriğin `like_count`'unu DEĞİŞTİRMEZ ve tersi.
--   4) Etkileşim yazımı yalnız topluluk ÜYESİNE açıktır (tetikleyici); kapatılmış topluluk salt-okunurdur;
--      okuma `community_posts` RLS'inden (= `can_read_community`) miras alınır; bir yanıt başka bir
--      gönderinin/içeriğin yorumuna bağlanamaz (yorumlar karışmaz).
--   5) Yerel (native) içerik: yeni görünürlük DEĞERİ eklenmez. İçerik normal görünürlük seçeneklerinden
--      birini kullanır (public | private). "Yalnızca topluluk" = private + yayında bir native gönderi:
--      içeriğin (ve medya/etiket/değişken/sonuç… alt satırlarının, Storage dosyalarının) okunabilirliği
--      native gönderiyi okuyabilen herkese genişler. Alt tablolar ve Storage zaten ana satırın RLS'ini
--      miras aldığından yalnız dört ana tablonun SELECT politikası + `preset_fields` değişir.
--      Gönderi silinince / içerik taslağa dönünce erişim kendiliğinden kapanır.
--   6) Bildirimler mevcut `like` / `comment` / `comment_reply` türleriyle, gönderiye giden href ile üretilir.
--
-- Bu dosya YALNIZCA ekleyici/değiştiricidir: tablo/sütun/veri silinmez. Tek `drop`, iki CHECK kısıtının
-- (yeni hedefi kapsayacak biçimde) yeniden tanımlanmasıdır; politikalar `alter policy` ile değişir.
-- 20260920080000'den SONRA, istemci kodundan ÖNCE uygulanmalıdır.

-- 1) community_posts: tür + sayaçlar ----------------------------------------------------------
alter table public.community_posts
  add column if not exists kind text not null default 'legacy',
  add column if not exists like_count integer not null default 0,
  add column if not exists comment_count integer not null default 0;

alter table public.community_posts
  add constraint community_posts_kind_check check (kind in ('native', 'application', 'legacy')),
  add constraint community_posts_counts_nonneg check (like_count >= 0 and comment_count >= 0);

-- Yeni satırlar artık RPC'lerin açıkça verdiği türle girer; sütun varsayılanı yalnız ESKİ satırları etiketler.
alter table public.community_posts alter column kind set default 'application';

drop trigger if exists community_posts_protect_counters on public.community_posts;
create trigger community_posts_protect_counters
  before insert or update of like_count, comment_count on public.community_posts
  for each row execute function public.protect_counter_columns('like_count', 'comment_count');

-- RLS'in "bu içerik için okunabilir yerel gönderi var mı" araması ve "içerik hangi gönderilerde" sorguları.
create index if not exists community_posts_native_prompt_idx on public.community_posts (prompt_id) where kind = 'native';
create index if not exists community_posts_native_request_idx on public.community_posts (request_id) where kind = 'native';
create index if not exists community_posts_native_workflow_idx on public.community_posts (workflow_id) where kind = 'native';
create index if not exists community_posts_native_preset_idx on public.community_posts (preset_id) where kind = 'native';

-- Bir içerik EN FAZLA bir toplulukta yerel olabilir (yerel = o topluluk için oluşturuldu).
create unique index if not exists community_posts_native_prompt_uidx on public.community_posts (prompt_id) where kind = 'native' and prompt_id is not null;
create unique index if not exists community_posts_native_request_uidx on public.community_posts (request_id) where kind = 'native' and request_id is not null;
create unique index if not exists community_posts_native_workflow_uidx on public.community_posts (workflow_id) where kind = 'native' and workflow_id is not null;
create unique index if not exists community_posts_native_preset_uidx on public.community_posts (preset_id) where kind = 'native' and preset_id is not null;

-- 2) prompt_likes / prompt_comments: altıncı hedef --------------------------------------------
alter table public.prompt_likes
  add column if not exists community_post_id uuid references public.community_posts (id) on delete cascade;
alter table public.prompt_comments
  add column if not exists community_post_id uuid references public.community_posts (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer = 1
);
alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer = 1
);

create unique index if not exists prompt_likes_community_post_user_uidx
  on public.prompt_likes (community_post_id, user_id) where community_post_id is not null;
create index if not exists prompt_likes_community_post_id_idx
  on public.prompt_likes (community_post_id) where community_post_id is not null;
create index if not exists prompt_comments_community_post_id_idx
  on public.prompt_comments (community_post_id, created_at) where community_post_id is not null;

-- 3) Sayaç tetikleyicileri: hedef zinciri artık AÇIK (eskiden son `else` sessizce prompt_requests'e düşerdi) --
create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set like_count = like_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set like_count = like_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set like_count = like_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set like_count = like_count + 1 where id = new.community_post_id;
    elsif new.request_id is not null then
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set like_count = like_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set like_count = like_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set like_count = like_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set like_count = greatest(like_count - 1, 0) where id = old.community_post_id;
    elsif old.request_id is not null then
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set comment_count = comment_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set comment_count = comment_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set comment_count = comment_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set comment_count = comment_count + 1 where id = new.community_post_id;
    elsif new.request_id is not null then
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set comment_count = comment_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set comment_count = comment_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set comment_count = comment_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.community_post_id;
    elsif old.request_id is not null then
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- Yanıtlı yorum silinince yumuşak silme (gövde boşalır) — AMA gönderi silinirken FK basamağı (cascade)
-- yorumları siler: orada yumuşak silme satırı geride bırakıp sahipsiz kalmasına yol açardı. İç içe
-- tetikleyici derinliği > 1 = basamaklı silme; yalnız topluluk gönderisi yorumlarında gerçek silmeye izin ver.
create or replace function public.handle_comment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.community_post_id is not null and pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = ''
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

-- 4) Yazma kuralları: yalnız üye, kapalı topluluk salt-okunur, engel, yanıt aynı gönderide -----
create or replace function public.enforce_community_post_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := to_jsonb(new);
  v_post_id uuid := nullif(v_row ->> 'community_post_id', '')::uuid;
  v_parent uuid := nullif(v_row ->> 'parent_id', '')::uuid;
  v_post public.community_posts;
  v_parent_post uuid;
begin
  -- Yanıt (yalnız yorumlarda `parent_id` vardır), üst yorumla AYNI hedefte olmalı: bir gönderinin yorumu başka bir
  -- gönderiye/içeriğe taşınamaz (hedef NULL ise de karşılaştırma geçerli: eski içerik yorumlarının davranışı değişmez).
  if v_parent is not null then
    select c.community_post_id into v_parent_post from public.prompt_comments c where c.id = v_parent;
    if v_parent_post is distinct from v_post_id then
      raise exception 'invalid_parent';
    end if;
  end if;

  if v_post_id is null or v_actor is null then
    return new;
  end if;

  select * into v_post from public.community_posts where id = v_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  if public._group_member_role(v_post.community_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.chat_groups g where g.id = v_post.community_id and g.closed_at is not null) then
    raise exception 'community_closed';
  end if;
  if v_post.author_id <> v_actor and public.is_blocked(v_actor, v_post.author_id) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_likes_enforce_community_post on public.prompt_likes;
create trigger prompt_likes_enforce_community_post
  before insert on public.prompt_likes
  for each row execute function public.enforce_community_post_engagement();

drop trigger if exists prompt_comments_enforce_community_post on public.prompt_comments;
create trigger prompt_comments_enforce_community_post
  before insert on public.prompt_comments
  for each row execute function public.enforce_community_post_engagement();

-- Yorum beğenisi (comment_likes) hedef taşımaz; topluluk yorumunu beğenmek de üyelik ister.
create or replace function public.enforce_community_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_post public.community_posts;
  v_post_id uuid;
begin
  if v_actor is null then
    return new;
  end if;
  select c.community_post_id into v_post_id from public.prompt_comments c where c.id = new.comment_id;
  if v_post_id is null then
    return new;
  end if;
  select * into v_post from public.community_posts where id = v_post_id;
  if not found or public._group_member_role(v_post.community_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.chat_groups g where g.id = v_post.community_id and g.closed_at is not null) then
    raise exception 'community_closed';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_likes_enforce_community_post on public.comment_likes;
create trigger comment_likes_enforce_community_post
  before insert on public.comment_likes
  for each row execute function public.enforce_community_comment_like();

-- 5) Yorum politikaları: topluluk gönderisi yorumu, gönderiyi okuyabilen herkese okunur ---------
-- (`community_posts` RLS'i = can_read_community; ziyaretçi dahil herkese açık topluluklarda okur.)
alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using (
    ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or (request_id is not null)
    or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))))
    or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
  );

alter policy "Authenticated users can comment on visible targets" on public.prompt_comments
  with check (
    auth.uid() = author_id
    and (
      ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
      or (request_id is not null)
      or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
      or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
      or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))))
      or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
    )
  );

-- 6) Yerel içerik: okunabilirlik yerel gönderiyi okuyabilene genişler -------------------------
alter policy "Published public prompts are public, the rest is author-only" on public.prompts
  using (
    (status = 'published' and visibility = 'public')
    or auth.uid() = author_id
    or (status = 'published' and exists (select 1 from public.community_posts cp where cp.prompt_id = prompts.id and cp.kind = 'native'))
  );

alter policy "Published public requests are public, the rest is author-only" on public.prompt_requests
  using (
    (not is_draft and visibility = 'public')
    or auth.uid() = author_id
    or (not is_draft and exists (select 1 from public.community_posts cp where cp.request_id = prompt_requests.id and cp.kind = 'native'))
  );

alter policy "Published public workflows are public, the rest is owner-only" on public.workflows
  using (
    (status = 'published' and visibility = 'public')
    or creator_id = auth.uid()
    or (status = 'published' and exists (select 1 from public.community_posts cp where cp.workflow_id = workflows.id and cp.kind = 'native'))
  );

alter policy "Public published presets are readable, owners see their own" on public.presets
  using (
    creator_id = auth.uid()
    or (status = 'published' and visibility = 'public')
    or (status = 'published' and exists (select 1 from public.community_posts cp where cp.preset_id = presets.id and cp.kind = 'native'))
  );

-- Alanlar yalnız "yayında + herkese açık" hazır ayara bakıyordu; artık ana satırın RLS'ini miras alır
-- (ana satır zaten yalnız sahibine / herkese açığa / yerel gönderiyi okuyabilene görünür).
alter policy "Preset fields readable by owner or via a public preset" on public.preset_fields
  using (
    owner_id = auth.uid()
    or (preset_id is not null and exists (select 1 from public.presets p where p.id = preset_fields.preset_id and p.status = 'published'))
  );

-- 7) RPC'ler ----------------------------------------------------------------------------------
-- Başvuru: var olan YAYINDA + HERKESE AÇIK içerik (kural değişmedi); artık türü açıkça 'application'.
create or replace function public.share_to_community(p_group_id uuid, p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._community_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.community_posts where community_id = p_group_id and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;

  begin
    insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id, note)
    values (
      v_id, p_group_id, v_actor, 'application', p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end,
      v_note
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$$;

-- Yerel gönderi: içerik NORMAL oluşturma ekranında yaratılıp yayınlandıktan sonra çağrılır. Başvurudan farkı:
--   - içerik GÜNCEL olarak kullanıcının kendisinindir ve bu toplulukta oluşturulmuştur (7 gün içinde,
--     başka bir toplulukta yerel değil) — başkasının içeriği yerel olamaz;
--   - içerik herkese açık VEYA özel olabilir (özelse yalnız bu topluluğun okuyucularına açılır, madde 6);
--   - not yoktur (gönderi içeriğin kendisidir).
create or replace function public.publish_native_community_post(p_group_id uuid, p_content_type text, p_content_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
  v_owner uuid;
  v_published boolean;
  v_created timestamptz;
  v_id uuid := gen_random_uuid();
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset') or p_content_id is null then
    raise exception 'invalid_content';
  end if;

  if p_content_type = 'prompt' then
    select x.author_id, (x.status = 'published' and x.deleted_at is null), x.created_at into v_owner, v_published, v_created from public.prompts x where x.id = p_content_id;
  elsif p_content_type = 'request' then
    select x.author_id, (not x.is_draft and x.deleted_at is null), x.created_at into v_owner, v_published, v_created from public.prompt_requests x where x.id = p_content_id;
  elsif p_content_type = 'workflow' then
    select x.creator_id, (x.status = 'published'), x.created_at into v_owner, v_published, v_created from public.workflows x where x.id = p_content_id;
  else
    select x.creator_id, (x.status = 'published'), x.created_at into v_owner, v_published, v_created from public.presets x where x.id = p_content_id;
  end if;
  -- Başkasının / var olmayan içerik için aynı yanıt: varlığı sızmasın.
  if v_owner is null or v_owner <> v_actor then
    raise exception 'content_not_found';
  end if;
  if not v_published then
    raise exception 'content_not_published';
  end if;
  if v_created < now() - interval '7 days' then
    raise exception 'content_not_new';
  end if;
  if (select count(*) from public.community_posts where community_id = p_group_id and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;

  begin
    insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id)
    values (
      v_id, p_group_id, v_actor, 'native', p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$$;

-- Not yalnız başvuruda vardır.
create or replace function public.update_community_post(p_post_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  perform public._group_lock(p.community_id);
  if p.author_id <> v_actor or public._group_member_role(p.community_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if (select closed_at from public.chat_groups where id = p.community_id) is not null then
    raise exception 'community_closed';
  end if;
  if p.kind = 'native' then
    raise exception 'invalid_note';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;
  update public.community_posts set note = v_note where id = p_post_id;
end;
$$;

revoke all on function public.publish_native_community_post(uuid, text, uuid) from public, anon;
grant execute on function public.publish_native_community_post(uuid, text, uuid) to authenticated;
revoke all on function public.enforce_community_post_engagement() from public, anon, authenticated;
revoke all on function public.enforce_community_comment_like() from public, anon, authenticated;

-- 8) Bildirimler ------------------------------------------------------------------------------
-- Gönderiye giden adres: topluluk akışı + `post` (gönderi kimliği) + `hl` (vurgulanacak öğe).
create or replace function public._community_post_href(p_post_id uuid, p_community_id uuid, p_highlight text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select '/communities/local?id=' || p_community_id || '&tab=feed&post=' || p_post_id
    || case when p_highlight is null then '' else '&hl=' || p_highlight end;
$$;
revoke all on function public._community_post_href(uuid, uuid, text) from public, anon, authenticated;

-- Gönderi beğenisi → gönderi sahibine (kendi gönderisini beğenirse yok; sahibi artık üye değilse yok).
create or replace function public.notify_community_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.community_posts;
  v_title text;
begin
  select * into v_post from public.community_posts where id = new.community_post_id;
  if not found or v_post.author_id = new.user_id or public._group_member_role(v_post.community_id, v_post.author_id) is null then
    return new;
  end if;
  select coalesce(
    case v_post.content_type
      when 'prompt' then (select title from public.prompts where id = v_post.prompt_id)
      when 'request' then (select title from public.prompt_requests where id = v_post.request_id)
      when 'workflow' then (select title from public.workflows where id = v_post.workflow_id)
      else (select title from public.presets where id = v_post.preset_id)
    end, '') into v_title;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_post.author_id, new.user_id, 'like',
    'Paylaşımını beğendi: "' || public.truncate_preview(v_title) || '"',
    public._community_post_href(v_post.id, v_post.community_id, 'post:' || v_post.id),
    'cpost_like:' || v_post.id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.cleanup_community_post_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where dedupe_key = 'cpost_like:' || old.community_post_id || ':' || old.user_id;
  return old;
end;
$$;

drop trigger if exists prompt_likes_after_insert_notify_community_post on public.prompt_likes;
create trigger prompt_likes_after_insert_notify_community_post
  after insert on public.prompt_likes
  for each row when (new.community_post_id is not null) execute function public.notify_community_post_like();

drop trigger if exists prompt_likes_after_delete_cleanup_community_post on public.prompt_likes;
create trigger prompt_likes_after_delete_cleanup_community_post
  after delete on public.prompt_likes
  for each row when (old.community_post_id is not null) execute function public.cleanup_community_post_like_notification();

-- Yorum / yanıt → yorum yazarı (yanıtsa üst yorumun yazarı, değilse gönderi sahibi).
create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
  v_post public.community_posts;
begin
  if new.workflow_id is not null or new.preset_id is not null then
    return new;
  end if;

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    if not found then
      return new;
    end if;
    v_href := public._community_post_href(v_post.id, v_post.community_id, 'comment:' || new.id);
  else
    v_href := (case
      when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
      when new.result_id is not null then '/results/local?id=' || new.result_id
      else '/requests/local?id=' || new.request_id
    end) || '&hl=comment:' || new.id;
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    if v_post.id is not null and public._group_member_role(v_post.community_id, v_parent_author) is null then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.community_post_id is not null then
      v_post_author := v_post.author_id;
      if public._group_member_role(v_post.community_id, v_post_author) is null then
        return new;
      end if;
    elsif new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    elsif new.result_id is not null then
      select creator_id into v_post_author from public.prompt_results where id = new.result_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case
        when new.prompt_id is not null or new.community_post_id is not null then 'Paylaşımına yorum yaptı: "'
        when new.result_id is not null then 'Sonucuna yorum yaptı: "'
        else 'İsteğine yorum yaptı: "'
      end) || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$$;

-- Yorum beğenisi → yorum yazarı.
create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_result_id uuid;
  v_workflow_id uuid;
  v_preset_id uuid;
  v_post_id uuid;
  v_community_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_post_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  if v_post_id is not null then
    select community_id into v_community_id from public.community_posts where id = v_post_id;
    if v_community_id is null or public._group_member_role(v_community_id, v_comment_author) is null then
      return new;
    end if;
    v_href := public._community_post_href(v_post_id, v_community_id, 'comment:' || new.comment_id);
  else
    v_href := (case
      when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
      when v_result_id is not null then '/results/local?id=' || v_result_id
      when v_workflow_id is not null then '/workflows/local?id=' || v_workflow_id
      when v_preset_id is not null then '/presets/local?id=' || v_preset_id
      else '/requests/local?id=' || v_request_id
    end) || '&hl=comment:' || new.comment_id;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like',
    'Yorumunu beğendi: "' || public.truncate_preview(v_body) || '"', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

-- @bahsetme: topluluk gönderisinde yalnız gönderiyi okuyabilen (üye ya da herkese açık topluluk) kullanıcı anılır.
create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
  v_old text[] := '{}'::text[];
  v_href text;
  v_visible boolean;
  v_post_author uuid;
  v_already uuid;
  v_rec record;
  v_post public.community_posts;
  v_public_community boolean := false;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  v_names := public.extract_mentioned_usernames(new.body);
  if coalesce(array_length(v_names, 1), 0) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := public.extract_mentioned_usernames(old.body);
  end if;

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    v_visible := found;
    v_post_author := v_post.author_id;
    v_public_community := exists (select 1 from public.chat_groups g where g.id = v_post.community_id and g.visibility = 'public');
    v_href := public._community_post_href(v_post.id, v_post.community_id);
  elsif new.prompt_id is not null then
    select (status = 'published' and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompts where id = new.prompt_id;
    v_href := '/prompts/local?id=' || new.prompt_id;
  elsif new.result_id is not null then
    select true, creator_id into v_visible, v_post_author from public.prompt_results where id = new.result_id;
    v_href := '/results/local?id=' || new.result_id;
  elsif new.workflow_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.workflows where id = new.workflow_id;
    v_href := '/workflows/local?id=' || new.workflow_id;
  elsif new.preset_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.presets where id = new.preset_id;
    v_href := '/presets/local?id=' || new.preset_id;
  else
    select (not is_draft and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompt_requests where id = new.request_id;
    v_href := '/requests/local?id=' || new.request_id;
  end if;

  if not coalesce(v_visible, false) then
    return new;
  end if;
  v_href := v_href || '&hl=comment:' || new.id;

  -- Bu yorum için mevcut tetikleyiciler zaten bildirim üretiyor: yanıtta üst yorumun yazarına,
  -- üst düzey yorumda içeriğin sahibine.
  if new.parent_id is not null then
    select author_id into v_already from public.prompt_comments where id = new.parent_id;
  else
    v_already := v_post_author;
  end if;

  for v_rec in
    select p.id
    from public.profiles p
    where p.username = any (v_names)
      and not (p.username = any (v_old))
      and p.id <> new.author_id
      and p.id is distinct from v_already
      and not public.is_blocked(new.author_id, p.id)
      and (
        new.community_post_id is null
        or v_public_community
        or public._group_member_role(v_post.community_id, p.id) is not null
      )
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    values (
      v_rec.id, new.author_id, 'comment',
      'Seni bir yorumda andı: "' || public.truncate_preview(new.body) || '"',
      v_href,
      'mention:comment:' || new.id || ':' || v_rec.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

-- Gönderi silinince (yazar / moderatör / içerik silinmesi / topluluk silinmesi) ona giden bildirimler de gider.
create or replace function public.cleanup_community_post_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '%&post=' || old.id || '%';
  return old;
end;
$$;

drop trigger if exists community_posts_cleanup_notifications on public.community_posts;
create trigger community_posts_cleanup_notifications
  before delete on public.community_posts
  for each row execute function public.cleanup_community_post_notifications();

-- Tetikleyici işlevleri istemciden çağrılmaz (varsayılan yetkiler anon'a EXECUTE verir; kapatılır).
revoke all on function public.notify_community_post_like() from public, anon, authenticated;
revoke all on function public.cleanup_community_post_like_notification() from public, anon, authenticated;
revoke all on function public.cleanup_community_post_notifications() from public, anon, authenticated;

-- 9) Realtime: gönderi sayaçları (beğeni/yorum) canlı güncellensin -----------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_posts'
     ) then
    alter publication supabase_realtime add table public.community_posts;
  end if;
end $$;
