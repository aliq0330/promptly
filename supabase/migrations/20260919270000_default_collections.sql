-- Kalıcı düzeltme: her kullanıcının bir "Genel" (default) koleksiyonu olması,
-- bunun isimden bağımsız kalıcı bir kimliğe sahip olması, genel kaydetmenin
-- artık ayrı bir prompt_saves yerine BU koleksiyona üyelik olarak tanımlanması,
-- ve genel kaydı kaldırmanın kullanıcının TÜM koleksiyonlarından atomik olarak
-- temizlenmesi (CLAUDE.md Bölüm 9.22 — "Kaydedilenler ve Koleksiyon Sistemini
-- Kalıcı Olarak Düzeltme ve Tamamlama"). prompt_saves (20260919120300)
-- SİLİNMEDİ — geriye dönük veri kaybı olmasın diye satırları duruyor, ama bu
-- migration'dan sonra hiçbir yeni yazma/okuma onu kullanmıyor (tek kaynak artık
-- collections.is_default + collection_items).

-- === 1. Durable, name-independent default flag =============================

alter table public.collections
  add column is_default boolean not null default false;

-- Tam olarak bir tane varsayılan koleksiyon / kullanıcı — hem backfill hem
-- eşzamanlı "ensure" çağrıları için veritabanı seviyesinde garanti.
create unique index collections_one_default_per_owner
  on public.collections (owner_id)
  where is_default;

-- === 2. Varsayılan koleksiyon asla silinemez / is_default asla değişemez ===

create or replace function public.handle_collection_before_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_default then
    raise exception 'Varsayılan koleksiyon silinemez. İstersen koleksiyonun adını veya gizlilik ayarını değiştirebilirsin.';
  end if;
  return old;
end;
$$;

create trigger collections_before_delete
  before delete on public.collections
  for each row
  execute function public.handle_collection_before_delete();

create or replace function public.handle_collection_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.is_default is distinct from old.is_default then
    raise exception 'Koleksiyonun varsayılan durumu değiştirilemez.';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Koleksiyonun sahibi değiştirilemez.';
  end if;
  return new;
end;
$$;

create trigger collections_before_update
  before update on public.collections
  for each row
  execute function public.handle_collection_before_update();

-- === 3. Idempotent "get or create" — hem sunucu tarafı (signup trigger'ı,
-- backfill) hem güvenli bir client-safe RPC için tek gerçek kaynak =========

create or replace function public.ensure_default_collection(p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.collections where owner_id = p_owner_id and is_default limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.collections (owner_id, name, visibility, is_default)
  values (p_owner_id, 'Genel', 'private', true)
  on conflict (owner_id) where is_default do nothing
  returning id into v_id;

  if v_id is null then
    -- Eşzamanlı bir başka çağrı araya girip zaten oluşturmuş olabilir —
    -- unique index'in kendisi yarış durumunu önlüyor, burada yalnızca
    -- gerçek id'yi geri okuyoruz.
    select id into v_id from public.collections where owner_id = p_owner_id and is_default limit 1;
  end if;

  return v_id;
end;
$$;

-- İstemciden asla keyfi bir owner_id ile çağrılamaz (başka bir kullanıcı
-- adına koleksiyon oluşturma riski) — yalnızca auth.uid()'ye sabitlenmiş bu
-- ince sarmalayıcı authenticated'e açık.
create or replace function public.get_or_create_own_default_collection()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın.';
  end if;
  return public.ensure_default_collection(auth.uid());
end;
$$;

revoke all on function public.get_or_create_own_default_collection() from public;
grant execute on function public.get_or_create_own_default_collection() to authenticated;

-- === 4. Yeni kullanıcı → gerçek profile satırının hemen yanında gerçek bir
-- Genel koleksiyonu da otomatik oluşsun (handle_new_user'ın aynı, var olan
-- trigger'ı — yalnızca gövdesi genişletildi, on_auth_user_created değişmedi) ==

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    public.generate_username(split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  perform public.ensure_default_collection(new.id);
  return new;
end;
$$;

-- === 5. Mevcut kullanıcılar için güvenli, idempotent backfill ==============
-- (aynı transaction içinde, iki adımda: eksik olan varsayılan koleksiyonları
-- oluştur, sonra var olan prompt_saves ilişkilerini bu koleksiyonlara taşı —
-- ikisi de yeniden çalıştırılabilir, kimseyi iki kez oluşturmaz/yinelemez.)

insert into public.collections (owner_id, name, visibility, is_default)
select p.id, 'Genel', 'private', true
from public.profiles p
where not exists (
  select 1 from public.collections c where c.owner_id = p.id and c.is_default
)
on conflict (owner_id) where is_default do nothing;

insert into public.collection_items (collection_id, prompt_id, created_at)
select c.id, ps.prompt_id, ps.created_at
from public.prompt_saves ps
join public.collections c on c.owner_id = ps.user_id and c.is_default
on conflict (collection_id, prompt_id) do nothing;

-- === 6. Genel kaydı kaldırma — kullanıcının TÜM koleksiyonlarından (Genel +
-- özel koleksiyonlar) atomik, tek bir DELETE ile temizler. security invoker
-- (varsayılan) yeterli: yalnızca auth.uid()'nin KENDİ koleksiyonlarına
-- dokunuyor, RLS zaten bunu tek tek satırlar için de zorluyor — buradaki tek
-- amaç, istemcinin "önce oku sonra tek tek sil" döngüsü yerine tek, atomik
-- bir sunucu operasyonu vermek (bölünmüş bir yarım-kalmış durum imkansız). ==

create or replace function public.remove_prompt_from_saved_everywhere(p_prompt_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın.';
  end if;

  delete from public.collection_items ci
  using public.collections c
  where ci.collection_id = c.id
    and c.owner_id = auth.uid()
    and ci.prompt_id = p_prompt_id;
end;
$$;

revoke all on function public.remove_prompt_from_saved_everywhere(uuid) from public;
grant execute on function public.remove_prompt_from_saved_everywhere(uuid) to authenticated;
