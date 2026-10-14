-- Herkese açık koleksiyonları takip etme: kullanıcı başkasının herkese açık koleksiyonunu takip
-- eder; takip ettikleri kendi profilindeki Kaydedilenler sekmesinde "Takip ettiğin koleksiyonlar"
-- olarak görünür, koleksiyonun sahibi bildirim alır, koleksiyonda takipçi sayısı gösterilir.
--
--   * `collection_follows (user_id, collection_id)`: RLS yalnızca sahibi okur/siler; ekleme
--     yalnızca HERKESE AÇIK, kendine ait OLMAYAN ve engelleme ilişkisi olmayan bir koleksiyona
--     yapılabilir. Kullanıcı başına en fazla 200 takip (trigger, hata metni
--     `collection_follow_limit`). Koleksiyon ya da profil silinince takip cascade ile gider.
--   * Koleksiyon sonradan gizli yapılırsa takip satırları durur ama koleksiyon (RLS) kimseye
--     görünmediği için takip listelerinde de görünmez; tekrar herkese açık olunca geri gelir.
--   * `collections.follower_count`: denormalize sayaç, SECURITY DEFINER trigger ile tutulur
--     (RLS çapraz kullanıcı güncellemesini sessizce 0 satıra çevirirdi). Sahip kendi koleksiyonunu
--     güncelleyebildiği için `anon`/`authenticated` rolüyle gelen sayaç değişikliği yok sayılır
--     (`copy_count` ile aynı koruma deseni).
--   * Bildirim: koleksiyon sahibine 'follow' türünde ("Koleksiyonunu takip etmeye başladı: ...");
--     `dedupe_key` takibi bırakıp yeniden takip edince tekrar bildirim gitmesini önler.
--   * Koleksiyon silinince ona işaret eden bildirimler de silinir (ölü bağlantı kalmasın).

alter table public.collections add column if not exists follower_count integer not null default 0;

create or replace function public.protect_collection_follower_count()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.follower_count := 0;
    else
      new.follower_count := old.follower_count;
    end if;
  end if;
  return new;
end;
$$;

create trigger collections_protect_follower_count
  before insert or update on public.collections
  for each row execute function public.protect_collection_follower_count();

create table if not exists public.collection_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);

create index if not exists collection_follows_collection_id_idx on public.collection_follows (collection_id);

alter table public.collection_follows enable row level security;

create policy "Users can read their own collection follows"
  on public.collection_follows for select
  using (auth.uid() = user_id);

create policy "Users can follow public collections of others"
  on public.collection_follows for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.collections c
      where c.id = collection_follows.collection_id
        and c.visibility = 'public'
        and c.owner_id <> auth.uid()
        and not public.is_blocked(auth.uid(), c.owner_id)
    )
  );

create policy "Users can unfollow their own collections"
  on public.collection_follows for delete
  using (auth.uid() = user_id);

create or replace function public.enforce_collection_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.collection_follows where user_id = new.user_id) >= 200 then
    raise exception 'collection_follow_limit';
  end if;
  return new;
end;
$$;

create trigger collection_follows_enforce_limit
  before insert on public.collection_follows
  for each row execute function public.enforce_collection_follow_limit();

create or replace function public.handle_collection_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.collections set follower_count = follower_count + 1 where id = new.collection_id;
    return new;
  end if;
  update public.collections set follower_count = greatest(follower_count - 1, 0) where id = old.collection_id;
  return old;
end;
$$;

create trigger collection_follows_after_change
  after insert or delete on public.collection_follows
  for each row execute function public.handle_collection_follow_change();

create or replace function public.notify_collection_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
begin
  select owner_id, name into v_owner, v_name from public.collections where id = new.collection_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_owner, new.user_id, 'follow',
    'Koleksiyonunu takip etmeye başladı: "' || public.truncate_preview(v_name) || '"',
    '/collections/local?id=' || new.collection_id,
    'colfollow:' || new.collection_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create trigger collection_follows_after_insert_notify
  after insert on public.collection_follows
  for each row execute function public.notify_collection_follow();

create or replace function public.cleanup_notifications_for_deleted_collection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href = '/collections/local?id=' || old.id;
  return old;
end;
$$;

create trigger collections_after_delete_cleanup_notifications
  after delete on public.collections
  for each row execute function public.cleanup_notifications_for_deleted_collection();

revoke execute on function public.protect_collection_follower_count() from public, anon, authenticated;
revoke execute on function public.enforce_collection_follow_limit() from public, anon, authenticated;
revoke execute on function public.handle_collection_follow_change() from public, anon, authenticated;
revoke execute on function public.notify_collection_follow() from public, anon, authenticated;
revoke execute on function public.cleanup_notifications_for_deleted_collection() from public, anon, authenticated;
