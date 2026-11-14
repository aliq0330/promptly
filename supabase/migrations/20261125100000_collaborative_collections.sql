-- Ortak koleksiyon (docs/history/386-*): bir koleksiyonu birden çok kişinin birlikte doldurması.
--
-- Kurallar (kullanıcı kararı):
--   * Sahip + ortaklar. Görüntüleyici rolü YOK; ortakların hepsi eşittir, sahip ek olarak ad/görünürlük/davet/çıkarma/silme yapar.
--   * Koleksiyon herkese açıksa herkes görür ve takip eder; özelse yalnız sahip + ortaklar görür.
--   * İçerik yalnız ortaklarca eklenir; bir içeriği YALNIZ onu ekleyen çıkarır (sahip bile başkasınınkini çıkaramaz).
--     `added_by` boş satırlar (eski satırlar, ayrılan/çıkarılan ortağın bırakılan içerikleri) sahibe aittir.
--   * Davet yalnız kullanıcı adıyla; sahip davet eder. Ortak koleksiyon tüm ortakların profilinde listelenir.
--   * Ortak koleksiyona yalnız herkese açık + yayında + topluluğa/ekibe özgü olmayan içerik girer (her ortak aynı içeriği okuyabilsin).
--   * Kaydet modeli (336 değişmezi): ortak koleksiyona eklenen içerik HEM ekleyenin HEM sahibin "Kaydedilenlerin tümü"ne de girer.
--     Böylece save_count / istatistik / Sana özel okumaları (hepsi sahip başına bir kayıt sayar) hiç değişmez.
--
-- Yalnız EKLEYİCİ (expand): yeni sütun/tablo/işlev; eski istemci çalışmaya devam eder. Yıkıcı ifade yoktur
-- (collection_items'ın INSERT/DELETE politikaları aynı işlemde yeniden kurulur; politika silme/yeniden kurma serbesttir).

-- === 1. Sütunlar ================================================================================================================

alter table public.collections
  add column if not exists is_shared boolean not null default false,
  add column if not exists member_count integer not null default 0;

do $$ begin
  alter table public.collections add constraint collections_shared_not_system check (not (is_default and is_shared));
exception when duplicate_object then null; end $$;

alter table public.collection_items
  add column if not exists added_by uuid references public.profiles (id) on delete set null;
create index if not exists collection_items_added_by_idx on public.collection_items (collection_id, added_by) where added_by is not null;

-- `is_shared` ve `member_count` istemciden yazılamaz: ilki yalnız set_collection_shared, ikincisi tetikleyici (SECURITY DEFINER, current_user = sahip rol).
create or replace function public.protect_collection_shared()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_shared := false;
    else
      new.is_shared := old.is_shared;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_collection_shared() from public, anon, authenticated;
drop trigger if exists collections_protect_shared on public.collections;
create trigger collections_protect_shared before insert or update on public.collections
  for each row execute function public.protect_collection_shared();

drop trigger if exists collections_protect_member_count on public.collections;
create trigger collections_protect_member_count before insert or update on public.collections
  for each row execute function public.protect_counter_columns('member_count');

-- === 2. Üyelik ve davet tabloları ===============================================================================================

create table if not exists public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  added_by      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (collection_id, user_id)
);
create index if not exists collection_members_user_idx on public.collection_members (user_id);
alter table public.collection_members enable row level security;

create table if not exists public.collection_invitations (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  invitee_id    uuid not null references public.profiles (id) on delete cascade,
  invited_by    uuid references public.profiles (id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create unique index if not exists collection_invitations_one_pending on public.collection_invitations (collection_id, invitee_id) where status = 'pending';
create index if not exists collection_invitations_invitee_idx on public.collection_invitations (invitee_id) where status = 'pending';
alter table public.collection_invitations enable row level security;

-- İstemci bu tablolara yazamaz (yalnız SECURITY DEFINER işlevler); davetler hiç okunamaz, üyelikte yalnız kendi satırım okunur.
revoke all on public.collection_members, public.collection_invitations from anon, authenticated;
-- SELECT (yalnız kendi satırım, RLS) hem anon'a hem oturumluya açıktır: collections/collection_items politikaları üyeliğe bakar ve alt sorgu
-- çağıranın yetkisiyle çalışır; anon'da hiç satır dönmez (auth.uid() boş) ama yetki olmazsa ziyaretçinin koleksiyon sorguları patlar.
grant select on public.collection_members to anon, authenticated;

-- (collections politikası üyeliğe, üyelik politikası collections'a bakarsa "infinite recursion in policy" olur — bu yüzden
-- üyelik satırında yalnız `user_id = auth.uid()` vardır; başkalarının üyeliği yalnız collection_members_list RPC'sindendir.)
drop policy if exists collection_members_own_read on public.collection_members;
create policy collection_members_own_read on public.collection_members for select using (user_id = (select auth.uid()));

-- Okuma: üye de okur (mevcut politikalar KORUNUR; bunlar onlara VEYA ile eklenir, adlarına bağımlılık yok).
drop policy if exists collections_readable_by_members on public.collections;
create policy collections_readable_by_members on public.collections for select
  using (exists (select 1 from public.collection_members m where m.collection_id = collections.id and m.user_id = (select auth.uid())));

drop policy if exists collection_items_readable_by_members on public.collection_items;
create policy collection_items_readable_by_members on public.collection_items for select
  using (exists (select 1 from public.collection_members m where m.collection_id = collection_items.collection_id and m.user_id = (select auth.uid())));

-- Yazma: collection_items'ın INSERT ve DELETE politikaları adından bağımsız olarak yeniden kurulur.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'collection_items' and cmd in ('INSERT', 'DELETE') loop
    execute format('drop policy %I on public.collection_items', r.policyname);
  end loop;
end $$;

-- Ekleme: koleksiyonun sahibi YA DA ortak koleksiyonda üye.
create policy "Owners and members can add items" on public.collection_items for insert to authenticated
  with check (exists (
    select 1 from public.collections c
    where c.id = collection_items.collection_id
      and (c.owner_id = (select auth.uid())
           or (c.is_shared and exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = (select auth.uid()))))
  ));

-- Çıkarma: YALNIZ ekleyen. `added_by` boş satırı (eski/bırakılan) koleksiyonun sahibi çıkarır.
create policy "Only the adder can remove an item" on public.collection_items for delete to authenticated
  using (
    added_by = (select auth.uid())
    or (added_by is null and exists (select 1 from public.collections c where c.id = collection_items.collection_id and c.owner_id = (select auth.uid())))
  );

-- Sahip/üye kendi koleksiyonunu takip etmez (sahip zaten politikada; üyeler için tetikleyici).
create or replace function public.collection_follows_no_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.collection_members m where m.collection_id = new.collection_id and m.user_id = new.user_id) then
    raise exception 'collection_follow_member';
  end if;
  return new;
end $$;
revoke all on function public.collection_follows_no_member() from public, anon, authenticated;
drop trigger if exists collection_follows_no_member on public.collection_follows;
create trigger collection_follows_no_member before insert on public.collection_follows
  for each row execute function public.collection_follows_no_member();

-- === 3. Sayaç + bildirim tetikleyicileri ========================================================================================

create or replace function public.collection_members_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.collections set member_count = member_count + 1 where id = new.collection_id;
  elsif tg_op = 'DELETE' then
    update public.collections set member_count = greatest(0, member_count - 1) where id = old.collection_id;
  end if;
  return null;
end $$;
revoke all on function public.collection_members_after_change() from public, anon, authenticated;
drop trigger if exists collection_members_after_change on public.collection_members;
create trigger collection_members_after_change after insert or delete on public.collection_members
  for each row execute function public.collection_members_after_change();

-- Ortak koleksiyonu silmek ortaklara haber verir (yalnız kullanıcı eylemi; hesap silme zinciri auth.uid() olmadan çalışır).
create or replace function public.collections_notify_members_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_shared and auth.uid() is not null then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    select m.user_id, auth.uid(), 'system', '"' || old.name || '" koleksiyonu sahibi tarafından silindi.', '/saved'
      from public.collection_members m join public.profiles p on p.id = m.user_id
     where m.collection_id = old.id and m.user_id <> auth.uid();
  end if;
  return old;
end $$;
revoke all on function public.collections_notify_members_on_delete() from public, anon, authenticated;
drop trigger if exists collections_notify_members_on_delete on public.collections;
create trigger collections_notify_members_on_delete before delete on public.collections
  for each row execute function public.collections_notify_members_on_delete();

-- === 4. collection_items tetikleyicileri ========================================================================================

-- BEFORE INSERT (ad "a_" önekli: block_community / rate_limit / saved_all tetikleyicilerinden ÖNCE çalışır):
--   * `added_by` istemciden verilemez: ortak koleksiyonda eklenen = auth.uid(), değilse boş.
--   * Ortak koleksiyona yalnız herkese açık + yayında + topluluğa/ekibe özgü olmayan içerik girer; topluluk başvuru gönderisi girmez.
create or replace function public.collection_items_a_shared_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shared boolean;
begin
  select c.is_shared into v_shared from public.collections c where c.id = new.collection_id;
  if coalesce(v_shared, false) then
    if auth.uid() is not null then new.added_by := auth.uid(); end if;
    if new.community_post_id is not null then raise exception 'collection_item_not_shareable'; end if;
    if new.prompt_id is not null and not public.quote_target_ok('prompt', new.prompt_id) then raise exception 'collection_item_not_shareable'; end if;
    if new.workflow_id is not null and not public.quote_target_ok('workflow', new.workflow_id) then raise exception 'collection_item_not_shareable'; end if;
    if new.preset_id is not null and not public.quote_target_ok('preset', new.preset_id) then raise exception 'collection_item_not_shareable'; end if;
  elsif auth.uid() is not null then
    new.added_by := null;
  end if;
  return new;
end $$;
revoke all on function public.collection_items_a_shared_guard() from public, anon, authenticated;
drop trigger if exists collection_items_a_shared_guard on public.collection_items;
create trigger collection_items_a_shared_guard before insert on public.collection_items
  for each row execute function public.collection_items_a_shared_guard();

-- 336'daki tetikleyici genişler: koleksiyona eklenen içerik kayıtlı değilse sistem koleksiyonuna da girer. Ortak koleksiyonda
-- ekleyen bir ortaksa hem EKLEYENİN hem SAHİBİN sistem koleksiyonuna yazılır (sahibin değişmezi: koleksiyon ⊆ kayıtlar).
create or replace function public.collection_items_saved_all_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_default boolean;
  v_shared boolean;
  v_uid uuid := auth.uid();
begin
  select owner_id, is_default, is_shared into v_owner, v_default, v_shared from public.collections where id = new.collection_id;
  if v_owner is null or v_default then
    return new;
  end if;
  if v_uid is not null and v_uid <> v_owner then
    -- Başkasının koleksiyonu: yalnız ortak koleksiyonun ortağı ekleyebilir (aksi hâlde RLS reddeder, sisteme dokunma).
    if not (v_shared and exists (select 1 from public.collection_members m where m.collection_id = new.collection_id and m.user_id = v_uid)) then
      return new;
    end if;
    insert into public.collection_items (collection_id, prompt_id, workflow_id, preset_id, community_post_id)
    values (public.ensure_default_collection(v_uid), new.prompt_id, new.workflow_id, new.preset_id, new.community_post_id)
    on conflict do nothing;
  end if;
  insert into public.collection_items (collection_id, prompt_id, workflow_id, preset_id, community_post_id)
  values (public.ensure_default_collection(v_owner), new.prompt_id, new.workflow_id, new.preset_id, new.community_post_id)
  on conflict do nothing;
  return new;
end $$;

-- AFTER INSERT: ortak koleksiyona içerik eklenince diğer ortaklara + sahibe günde en çok BİR bildirim (üye ≤ 10: "bir olay herkese yazmaz" kuralına uyar).
create or replace function public.collection_items_notify_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_c public.collections;
begin
  if new.added_by is null then return null; end if;
  select * into v_c from public.collections where id = new.collection_id;
  if not found or not v_c.is_shared then return null; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  select r.uid, new.added_by, 'system', '"' || v_c.name || '" koleksiyonuna içerik ekledi.',
         '/collections/local?id=' || v_c.id, 'collab-add:' || v_c.id || ':' || r.uid || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    from (select v_c.owner_id as uid union select m.user_id from public.collection_members m where m.collection_id = v_c.id) r
   where r.uid <> new.added_by
  on conflict do nothing;
  return null;
end $$;
revoke all on function public.collection_items_notify_shared() from public, anon, authenticated;
drop trigger if exists collection_items_notify_shared on public.collection_items;
create trigger collection_items_notify_shared after insert on public.collection_items
  for each row execute function public.collection_items_notify_shared();

-- === 5. Yardımcılar =============================================================================================================

-- Çağıranın koleksiyonu okuyabilmesi (RLS'in aynası; yalnız işlevlerin içinden).
create or replace function public._collection_can_read(p_collection uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.collections c
     where c.id = p_collection and not c.is_default
       and (c.visibility = 'public' or c.owner_id = p_user
            or exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = p_user))
  );
$$;
revoke all on function public._collection_can_read(uuid, uuid) from public, anon, authenticated;

-- === 6. RPC'ler =================================================================================================================

-- Ortak çalışmayı aç/kapat (yalnız sahip). Açarken ortak olamayacak içerik varsa reddeder (collection_has_unshareable_items).
create or replace function public.set_collection_shared(p_collection uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.collections;
  v_bad integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from public.collections where id = p_collection for update;
  if not found or v_c.owner_id <> v_uid then raise exception 'collection_not_found'; end if;
  if v_c.is_default then raise exception 'collection_system'; end if;
  if coalesce(p_shared, false) then
    if v_c.is_shared then return; end if;
    select count(*) into v_bad from public.collection_items ci
     where ci.collection_id = p_collection
       and (ci.community_post_id is not null
            or (ci.prompt_id is not null and not public.quote_target_ok('prompt', ci.prompt_id))
            or (ci.workflow_id is not null and not public.quote_target_ok('workflow', ci.workflow_id))
            or (ci.preset_id is not null and not public.quote_target_ok('preset', ci.preset_id)));
    if v_bad > 0 then raise exception 'collection_has_unshareable_items'; end if;
    -- Var olan takipçiler korunur (ortak olmayanlar takipçi kalır).
    update public.collections set is_shared = true where id = p_collection;
  else
    if not v_c.is_shared then return; end if;
    update public.collection_invitations set status = 'revoked', responded_at = now() where collection_id = p_collection and status = 'pending';
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    select m.user_id, v_uid, 'system', '"' || v_c.name || '" koleksiyonunda ortak çalışma kapatıldı.', '/saved'
      from public.collection_members m where m.collection_id = p_collection;
    -- Ortakların eklediği içerikler koleksiyonda kalır ve sahibe geçer.
    update public.collection_items set added_by = null where collection_id = p_collection and added_by is not null;
    delete from public.collection_members where collection_id = p_collection;
    update public.collections set is_shared = false where id = p_collection;
  end if;
end $$;

-- Ortak yapmayı engelleyen içerikler (düzenleme penceresi "Çıkar" listesi için). Yalnız sahip.
create or replace function public.collection_unshareable_items(p_collection uuid)
returns table (item_id uuid, content_type text, title text, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.collections c where c.id = p_collection and c.owner_id = auth.uid()) then
    raise exception 'collection_not_found';
  end if;
  return query
    select ci.id,
           case when ci.community_post_id is not null then 'community_post' when ci.prompt_id is not null then 'prompt'
                when ci.workflow_id is not null then 'workflow' else 'preset' end,
           coalesce(p.title, w.title, ps.title),
           case when ci.community_post_id is not null then 'community' else 'not_public' end
      from public.collection_items ci
      left join public.prompts p on p.id = ci.prompt_id
      left join public.workflows w on w.id = ci.workflow_id
      left join public.presets ps on ps.id = ci.preset_id
     where ci.collection_id = p_collection
       and (ci.community_post_id is not null
            or (ci.prompt_id is not null and not public.quote_target_ok('prompt', ci.prompt_id))
            or (ci.workflow_id is not null and not public.quote_target_ok('workflow', ci.workflow_id))
            or (ci.preset_id is not null and not public.quote_target_ok('preset', ci.preset_id)))
     order by ci.created_at;
end $$;

-- Davet (yalnız sahip, yalnız kullanıcı adıyla). Üye + bekleyen davet en çok 9 (sahiple 10 kişi).
create or replace function public.invite_collection_member(p_collection uuid, p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.collections;
  v_target uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(false);
  select * into v_c from public.collections where id = p_collection for update;
  if not found or v_c.owner_id <> v_uid then raise exception 'collection_not_found'; end if;
  if not v_c.is_shared then raise exception 'collection_not_shared'; end if;
  select p.id into v_target from public.profiles p where lower(p.username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then raise exception 'collection_user_not_found'; end if;
  if v_target = v_uid then raise exception 'collection_self_invite'; end if;
  if public.is_blocked(v_uid, v_target) then raise exception 'collection_user_not_found'; end if;
  if exists (select 1 from public.collection_members m where m.collection_id = p_collection and m.user_id = v_target) then
    raise exception 'collection_already_member';
  end if;
  if exists (select 1 from public.collection_invitations i where i.collection_id = p_collection and i.invitee_id = v_target and i.status = 'pending') then
    raise exception 'collection_invite_exists';
  end if;
  if (select count(*) from public.collection_members m where m.collection_id = p_collection)
     + (select count(*) from public.collection_invitations i where i.collection_id = p_collection and i.status = 'pending') >= 9 then
    raise exception 'collection_member_limit';
  end if;
  perform public._rate_limit('collection_invite', 20, interval '1 day');
  insert into public.collection_invitations (collection_id, invitee_id, invited_by) values (p_collection, v_target, v_uid) returning id into v_id;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_target, v_uid, 'system', 'Seni "' || v_c.name || '" koleksiyonuna ortak olarak davet etti.', '/saved?invites=1', 'collab-invite:' || v_id)
  on conflict do nothing;
  return v_id;
end $$;

create or replace function public.respond_collection_invitation(p_invitation uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.collection_invitations;
  v_c public.collections;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_inv from public.collection_invitations where id = p_invitation for update;
  if not found or v_inv.invitee_id <> v_uid or v_inv.status <> 'pending' then raise exception 'collection_invite_not_found'; end if;
  select * into v_c from public.collections where id = v_inv.collection_id for update;
  if not found or not v_c.is_shared then
    update public.collection_invitations set status = 'revoked', responded_at = now() where id = v_inv.id;
    raise exception 'collection_invite_not_found';
  end if;
  if not coalesce(p_accept, false) then
    update public.collection_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return v_inv.collection_id;
  end if;
  perform public._assert_can_act(false);
  if public.is_blocked(v_c.owner_id, v_uid) then raise exception 'collection_invite_not_found'; end if;
  if (select count(*) from public.collection_members m where m.collection_id = v_c.id) >= 9 then raise exception 'collection_member_limit'; end if;
  if (select count(*) from public.collection_members m where m.user_id = v_uid) >= 50 then raise exception 'collection_joined_limit'; end if;
  update public.collection_invitations set status = 'accepted', responded_at = now() where id = v_inv.id;
  insert into public.collection_members (collection_id, user_id, added_by) values (v_c.id, v_uid, v_inv.invited_by) on conflict do nothing;
  delete from public.collection_follows where collection_id = v_c.id and user_id = v_uid;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_c.owner_id, v_uid, 'system', '"' || v_c.name || '" koleksiyonuna ortak oldu.', '/collections/local?id=' || v_c.id || '&tab=members');
  return v_c.id;
end $$;

create or replace function public.revoke_collection_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.collection_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select i.* into v_inv from public.collection_invitations i where i.id = p_invitation for update;
  if not found or v_inv.status <> 'pending'
     or not exists (select 1 from public.collections c where c.id = v_inv.collection_id and c.owner_id = v_uid) then
    raise exception 'collection_invite_not_found';
  end if;
  update public.collection_invitations set status = 'revoked', responded_at = now() where id = v_inv.id;
  delete from public.notifications where dedupe_key = 'collab-invite:' || v_inv.id;
end $$;

create or replace function public.my_collection_invitations()
returns table (id uuid, collection_id uuid, collection_name text, visibility text, item_count integer,
               owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, c.id, c.name, c.visibility, c.item_count, p.id, p.username, p.display_name, p.avatar_url, i.created_at
    from public.collection_invitations i
    join public.collections c on c.id = i.collection_id and c.is_shared
    join public.profiles p on p.id = c.owner_id
   where i.invitee_id = auth.uid() and i.status = 'pending' and auth.uid() is not null
     and not public.is_blocked(auth.uid(), c.owner_id)
   order by i.created_at desc;
$$;

-- Ortak listesi: sahip + ortaklar (+ sahip için bekleyen davetler). Koleksiyonu okuyamayan boş döner.
create or replace function public.collection_members_list(p_collection uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, invitation_id uuid, item_count integer, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.collections;
  v_uid uuid := auth.uid();
begin
  select * into v_c from public.collections where id = p_collection;
  if not found or not v_c.is_shared or not public._collection_can_read(p_collection, v_uid) then return; end if;
  return query
    select x.* from (
    select p.id as uid, p.username as uname, p.display_name as dname, p.avatar_url as aurl, 'owner'::text as prole, null::uuid as inv,
           (select count(*)::integer from public.collection_items ci where ci.collection_id = p_collection and (ci.added_by = p.id or ci.added_by is null)) as cnt,
           v_c.created_at as at
      from public.profiles p where p.id = v_c.owner_id
    union all
    select p.id, p.username, p.display_name, p.avatar_url, 'member'::text, null::uuid,
           (select count(*)::integer from public.collection_items ci where ci.collection_id = p_collection and ci.added_by = p.id),
           m.created_at
      from public.collection_members m join public.profiles p on p.id = m.user_id
     where m.collection_id = p_collection
    union all
    select p.id, p.username, p.display_name, p.avatar_url, 'invited'::text, i.id, 0, i.created_at
      from public.collection_invitations i join public.profiles p on p.id = i.invitee_id
     where i.collection_id = p_collection and i.status = 'pending' and v_uid is not null and v_uid = v_c.owner_id
    ) x order by case x.prole when 'owner' then 0 when 'member' then 1 else 2 end, x.at;
end $$;

-- Ortak çıkar (sahip) ya da ayrıl (kişinin kendisi). Eklediği içerikler: kaldırılır ya da koleksiyonda kalır ve sahibe geçer.
create or replace function public.remove_collection_member(p_collection uuid, p_user uuid, p_remove_items boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.collections;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from public.collections where id = p_collection for update;
  if not found then raise exception 'collection_not_found'; end if;
  if p_user = v_c.owner_id then raise exception 'collection_owner_cannot_leave'; end if;
  if v_uid <> v_c.owner_id and v_uid <> p_user then raise exception 'collection_not_found'; end if;
  if not exists (select 1 from public.collection_members m where m.collection_id = p_collection and m.user_id = p_user) then
    raise exception 'collection_not_found';
  end if;
  if coalesce(p_remove_items, false) then
    delete from public.collection_items where collection_id = p_collection and added_by = p_user;
  else
    update public.collection_items set added_by = null where collection_id = p_collection and added_by = p_user;
  end if;
  delete from public.collection_members where collection_id = p_collection and user_id = p_user;
  update public.collection_invitations set status = 'revoked', responded_at = now() where collection_id = p_collection and invitee_id = p_user and status = 'pending';
  if v_uid = p_user then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_c.owner_id, v_uid, 'system', '"' || v_c.name || '" koleksiyonundan ayrıldı.', '/collections/local?id=' || v_c.id || '&tab=members');
  else
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (p_user, v_uid, 'system', 'Seni "' || v_c.name || '" koleksiyonunun ortaklığından çıkardı.', '/saved');
  end if;
end $$;

-- Profil: kişinin sahibi YA DA ortağı olduğu koleksiyonlar — yalnız ÇAĞIRANIN okuyabildikleri (özel ortak koleksiyonu başkası görmez).
-- Başkasının profilinde yalnız boş olmayanlar; kişinin kendi profilinde hepsi (sistem koleksiyonu hariç).
create or replace function public.profile_collections(p_user uuid, p_limit integer default 24, p_offset integer default 0)
returns table (id uuid, name text, visibility text, item_count integer, follower_count integer, member_count integer, is_shared boolean,
               owner_id uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.visibility, c.item_count, c.follower_count, c.member_count, c.is_shared, c.owner_id, c.created_at, c.updated_at
    from public.collections c
   where not c.is_default
     and (c.owner_id = p_user or (c.is_shared and exists (select 1 from public.collection_members m where m.collection_id = c.id and m.user_id = p_user)))
     and public._collection_can_read(c.id, auth.uid())
     and (auth.uid() = p_user or c.item_count > 0)
     and not public.is_blocked(auth.uid(), p_user)
   order by c.created_at desc, c.id
   limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- === 7. Yetkiler ================================================================================================================

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_collection_shared(uuid, boolean)', 'public.collection_unshareable_items(uuid)', 'public.invite_collection_member(uuid, text)',
    'public.respond_collection_invitation(uuid, boolean)', 'public.revoke_collection_invitation(uuid)', 'public.my_collection_invitations()',
    'public.collection_members_list(uuid)', 'public.remove_collection_member(uuid, uuid, boolean)', 'public.profile_collections(uuid, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Ziyaretçi de herkese açık ortak koleksiyonları profilde ve sayfada görür.
grant execute on function public.profile_collections(uuid, integer, integer) to anon;
grant execute on function public.collection_members_list(uuid) to anon;
