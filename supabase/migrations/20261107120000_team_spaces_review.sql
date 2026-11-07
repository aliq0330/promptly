-- Ekip alanı, Aşama 3 (docs/history/349-*): ekip kütüphanesinde prompt SÜRÜM GEÇMİŞİ ve "Onaya gönder".
--
--   1) space_item_versions: ekip kütüphanesindeki prompt TASLAĞININ başlık/metni değişince ESKİ hâl bir satır olarak saklanır (öğe başına son 50).
--      Yazma yalnız tetikleyicidir (istemci yazamaz); okuma = Space'i okuyabilen. Geri yükleme `space_restore_item_version` RPC'sidir ve YENİ bir
--      düzenlemedir (mevcut metin de sürüm olur, onay kendiliğinden düşer — 348'deki kural).
--   2) space_items.review_requested_at / review_requested_by: bir düzenleyici "Onaya gönder" der → onay yetkisi olanlara bildirim. Yazma yalnız
--      `space_request_review` RPC'si ve onay RPC'sidir (işlem-yerel işaret); onaylanınca/onay geri alınınca istek temizlenir.
--
-- Hiçbir şey silinmez/yeniden adlandırılmaz (expand); mevcut CHECK'ler değişmez (etkinlik günlüğüne yeni eylem EKLENMEDİ).

alter table public.space_items add column if not exists review_requested_at timestamptz;
alter table public.space_items add column if not exists review_requested_by uuid references public.profiles (id) on delete set null;

create table if not exists public.space_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.space_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 8000),
  -- Bu metni yazan kişi (önceki düzenleyen); değiştiren kişi bir sonraki sürümün/öğenin yazarıdır.
  author_id uuid references public.profiles (id) on delete set null,
  was_approved boolean not null default false,
  replaced_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists space_item_versions_item_idx on public.space_item_versions (item_id, created_at desc);
create index if not exists space_item_versions_space_idx on public.space_item_versions (space_id);

alter table public.space_item_versions enable row level security;
drop policy if exists space_item_versions_select on public.space_item_versions;
create policy space_item_versions_select on public.space_item_versions for select
  using (public.can_read_space(space_id));
revoke all on public.space_item_versions from anon, authenticated;
grant select on public.space_item_versions to authenticated;

-- Eski hâli sürüm olarak sakla. Yalnız ekip kütüphanesindeki prompt taslağı, yalnız başlık/metin değişince. Öğe başına son 50.
create or replace function public.space_items_version_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.kind <> 'prompt' or not old.is_draft then return new; end if;
  if (new.title, new.body) is not distinct from (old.title, old.body) then return new; end if;
  if not exists (select 1 from public.spaces s where s.id = old.space_id and s.kind = 'team_library') then return new; end if;
  insert into public.space_item_versions (item_id, space_id, title, body, author_id, was_approved, replaced_by)
  values (old.id, old.space_id, old.title, old.body, coalesce(old.updated_by, old.created_by), old.approved_at is not null, auth.uid());
  delete from public.space_item_versions v
   where v.item_id = old.id
     and v.id in (select x.id from public.space_item_versions x where x.item_id = old.id order by x.created_at desc, x.id desc offset 50);
  return new;
end;
$$;
revoke execute on function public.space_items_version_snapshot() from public, anon, authenticated;

drop trigger if exists space_items_version_snapshot on public.space_items;
create trigger space_items_version_snapshot after update on public.space_items
  for each row execute function public.space_items_version_snapshot();

-- İnceleme sütunlarını yalnız RPC'ler yazar (istemci doğrudan değiştiremez).
create or replace function public.space_items_review_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ok boolean := coalesce(current_setting('promptly.space_review', true), '') = '1'
               or coalesce(current_setting('promptly.space_approval', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if (new.review_requested_at is not null or new.review_requested_by is not null) and not v_ok then
      raise exception 'space_review_forbidden';
    end if;
    return new;
  end if;
  if (new.review_requested_at is distinct from old.review_requested_at or new.review_requested_by is distinct from old.review_requested_by) and not v_ok then
    raise exception 'space_review_forbidden';
  end if;
  return new;
end;
$$;
revoke execute on function public.space_items_review_guard() from public, anon, authenticated;

drop trigger if exists space_items_review_guard on public.space_items;
create trigger space_items_review_guard before insert or update on public.space_items
  for each row execute function public.space_items_review_guard();

-- Kilit, inceleme sütunlarını da "değişiklik" saymaz (kilitli taslak için de onay istenebilir).
create or replace function public.space_items_lock_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() <= 1 then
      raise exception 'space_item_locked';
    end if;
    return old;
  end if;
  if old.locked and (to_jsonb(new) - 'locked' - 'updated_at' - 'updated_by' - 'approved_at' - 'approved_by' - 'review_requested_at' - 'review_requested_by')
                    is distinct from (to_jsonb(old) - 'locked' - 'updated_at' - 'updated_by' - 'approved_at' - 'approved_by' - 'review_requested_at' - 'review_requested_by') then
    raise exception 'space_item_locked';
  end if;
  return new;
end;
$$;
revoke execute on function public.space_items_lock_guard() from public, anon, authenticated;

-- Onay verilince/geri alınınca bekleyen inceleme isteği biter (onay kararı verildi).
create or replace function public.space_set_item_approval(p_item uuid, p_approved boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_kind text;
  v_comm uuid;
  v_title text;
  v_at timestamptz;
  v_rows integer;
  v_author uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_approved is null then raise exception 'space_invalid'; end if;
  select i.space_id into v_space from public.space_items i where i.id = p_item;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  select s.kind, s.community_id into v_kind, v_comm from public.spaces s where s.id = v_space;
  if v_comm is not null then
    if not coalesce(public._group_can(v_comm, v_uid, 'approve_library'), false) or not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  elsif public.space_role(v_space) is distinct from 'owner' or not public.can_edit_space(v_space) then
    raise exception 'space_forbidden';
  end if;
  if v_kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  perform set_config('promptly.space_approval', '1', true);
  update public.space_items
     set approved_at = case when p_approved then now() else null end,
         approved_by = case when p_approved then v_uid else null end,
         review_requested_at = null,
         review_requested_by = null
   where id = p_item and kind = 'prompt' and is_draft
   returning title, approved_at, created_by into v_title, v_at, v_author;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_approval', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  perform public._space_log(v_space, case when p_approved then 'item_approved' else 'item_unapproved' end, nullif(btrim(v_title), ''));
  if v_comm is not null then
    perform public._community_notify(
      v_author, v_uid, v_comm, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(v_title), ''), 'Adsız'), 80) || case when p_approved then '" promptunu ekip kütüphanesinde onayladı.' else '" promptunun onayını kaldırdı.' end,
      '/spaces/local?id=' || v_space || '&tab=prompts',
      'teamapprove:' || p_item || ':' || case when p_approved then 'a' else 'r' end || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return v_at;
end;
$$;
revoke execute on function public.space_set_item_approval(uuid, boolean) from public, anon;
grant execute on function public.space_set_item_approval(uuid, boolean) to authenticated;

-- "Onaya gönder" / geri çek. Düzenleyici (arşivlenmemiş), ekip kütüphanesi, onaylanmamış prompt taslağı. Zaten bekleyen istek tekrar
-- bildirim üretmez (idempotent). Bildirim: onay yetkisi olanlara (sahip her zaman + `approve_library` verilmiş yönetici/moderatör), en çok 200 kişi,
-- topluluk bildirim düzeylerine uyar (`_community_notify`). Dönüş: isteğin yeni durumu (zaman ya da null).
create or replace function public.space_request_review(p_item uuid, p_withdraw boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_kind text;
  v_comm uuid;
  v_title text;
  v_approved timestamptz;
  v_pending timestamptz;
  v_at timestamptz;
  v_rows integer;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null then raise exception 'space_invalid'; end if;
  select i.space_id, i.title, i.approved_at, i.review_requested_at
    into v_space, v_title, v_approved, v_pending
    from public.space_items i where i.id = p_item and i.kind = 'prompt' and i.is_draft;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  select s.kind, s.community_id into v_kind, v_comm from public.spaces s where s.id = v_space;
  if v_kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  if coalesce(p_withdraw, false) then
    if v_pending is null then return null; end if;
    perform set_config('promptly.space_review', '1', true);
    update public.space_items set review_requested_at = null, review_requested_by = null where id = p_item;
    perform set_config('promptly.space_review', '', true);
    return null;
  end if;

  if v_approved is not null then raise exception 'space_invalid'; end if;
  if v_pending is not null then return v_pending; end if;

  perform set_config('promptly.space_review', '1', true);
  update public.space_items set review_requested_at = now(), review_requested_by = v_uid
   where id = p_item returning review_requested_at into v_at;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_review', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  -- Ekip Space'inde onaylayacak kişilere haber. Kişisel kütüphanede (ekibe bağlı değil) bildirim yok: sahip rozetten görür.
  if v_comm is not null then
    for r in
      select m.user_id
        from public.conversation_members m
       where m.conversation_id = v_comm and m.user_id <> v_uid
         and coalesce(public._group_can(v_comm, m.user_id, 'approve_library'), false)
       order by (m.role = 'owner') desc, m.user_id
       limit 200
    loop
      perform public._community_notify(
        r.user_id, v_uid, v_comm, 'direct',
        '"' || public.truncate_preview(coalesce(nullif(btrim(v_title), ''), 'Adsız'), 80) || '" promptu için onay istedi.',
        '/spaces/local?id=' || v_space || '&tab=prompts',
        'teamreview:' || p_item || ':' || r.user_id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
    end loop;
  end if;
  return v_at;
end;
$$;
revoke execute on function public.space_request_review(uuid, boolean) from public, anon;
grant execute on function public.space_request_review(uuid, boolean) to authenticated;

-- Sürüm listesi (yazar adıyla). SECURITY INVOKER: tabloyu çağıranın RLS'i okur.
create or replace function public.list_space_item_versions(p_item uuid)
returns table (id uuid, title text, body text, author_id uuid, author_name text, author_username text, was_approved boolean, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.title, v.body, v.author_id, coalesce(nullif(p.display_name, ''), p.username), p.username, v.was_approved, v.created_at
    from public.space_item_versions v
    left join public.profiles p on p.id = v.author_id
   where v.item_id = p_item
   order by v.created_at desc, v.id desc
   limit 50;
$$;
revoke execute on function public.list_space_item_versions(uuid) from public, anon;
grant execute on function public.list_space_item_versions(uuid) to authenticated;

-- Geri yükle: seçilen sürümün metni öğeye YENİ düzenleme olarak yazılır (şimdiki hâl de sürüm olur; onay kendiliğinden düşer). Düzenleyici gerekir;
-- kilitli öğede `space_item_locked` doğal olarak atılır (kilit içeriği korur).
create or replace function public.space_restore_item_version(p_version uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item uuid;
  v_space uuid;
  v_title text;
  v_body text;
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select v.item_id, v.space_id, v.title, v.body into v_item, v_space, v_title, v_body
    from public.space_item_versions v where v.id = p_version;
  if v_item is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  update public.space_items set title = v_title, body = v_body
   where id = v_item and kind = 'prompt' and is_draft;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'space_invalid'; end if;
  return v_item;
end;
$$;
revoke execute on function public.space_restore_item_version(uuid) from public, anon;
grant execute on function public.space_restore_item_version(uuid) to authenticated;

-- Onay yetkisi istemciye sorulur (docs/history/349-*): ekip Space'inde `approve_library` yeteneği, kişisel kütüphanede Space sahipliği. Karar
-- `space_set_item_approval`'ın kullandığı kuralla AYNIDIR; bu yalnız arayüzün düğmeyi doğru göstermesi içindir (yetki yine sunucuda denetlenir).
create or replace function public.space_can_approve(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.kind = 'team_library'
       and public.can_edit_space(s.id)
       and case when s.community_id is not null
                then coalesce(public._group_can(s.community_id, auth.uid(), 'approve_library'), false)
                else public.space_role(s.id) = 'owner' end
      from public.spaces s
     where s.id = p_space and auth.uid() is not null and public.can_read_space(s.id)
  ), false)
$$;
revoke execute on function public.space_can_approve(uuid) from public, anon;
grant execute on function public.space_can_approve(uuid) to authenticated;
