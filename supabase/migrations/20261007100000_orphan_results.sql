-- ci:allow-destructive
-- Prompt silinince kullanıcı sonuçları SİLİNMEZ (docs/history/283-*).
--
-- Eskiden `prompt_results.prompt_id ... on delete cascade`: bir prompt silinince başkalarının paylaştığı sonuçlar (görselleri, beğenileri,
-- yorumlarıyla) sessizce gidiyordu. Yeni kural:
--   • herkese açık (topluluğa özgü olmayan) bir prompt silinince sonuçlar `prompt_id = null` ile "yetim" kalır; yalnız SAHİBİNE görünür
--     (profilindeki "Sonuçlar"da "Prompt silindi" notuyla), herkese açık hiçbir listede/sayfada görünmez; beğeni/yorum kapanır (okuma
--     politikaları sonucun promptuna bağlıdır — yetimin beğeni/yorumları sahibine de gösterilmez, sayaçları olduğu gibi kalır);
--   • topluluğa özgü bir promptun sonuçları eskisi gibi birlikte silinir (içerik topluluktan dışarı çıkmaz);
--   • sonuç sahiplerine tek bir bildirim gider (kişi başına; promptun yazarı hariç, en çok 20 000).
--
-- Yalnızca gevşetir: bir `not null` kalkar, iki kısıt (FK + "değişiklik biçimi" CHECK'i) aynı adla yeniden eklenir (veri silinmez),
-- bir okuma politikası genişler, bir koruma tetikleyicisi yalnız FK eyleminin `prompt_id`'yi boşaltmasına izin verir.

-- 1) prompt_id boş olabilir; FK silinen promptta `set null`.
alter table public.prompt_results alter column prompt_id drop not null;
alter table public.prompt_results drop constraint prompt_results_prompt_id_fkey;
alter table public.prompt_results
  add constraint prompt_results_prompt_id_fkey foreign key (prompt_id) references public.prompts (id) on delete set null;

-- "Değişiklikli sonuç" artık prompt_id şartı aramaz (yetimde de metni kalır).
alter table public.prompt_results drop constraint prompt_results_modification_shape;
alter table public.prompt_results
  add constraint prompt_results_modification_shape check (
    (has_modification = false and modification_summary is null and modified_prompt_text is null)
    or (has_modification = true and (modification_summary is not null or modified_prompt_text is not null))
  );

-- 2) Okuma: promptu okunabilen herkes (eskisi gibi) + yetim sonucu YALNIZ yaratıcısı.
alter policy "Prompt results are readable wherever their prompt is readable" on public.prompt_results
  using (
    (prompt_id is null and creator_id = auth.uid())
    or exists (
      select 1 from public.prompts p
      where p.id = prompt_results.prompt_id and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

-- 3) Koruma tetikleyicisi: `prompt_id` yalnız FK'nin `set null` eylemiyle (iç içe tetikleyici derinliği > 1) boşalır; istemci güncellemesi (derinlik 1) yine reddedilir.
create or replace function public.prompt_results_before_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.prompt_id is distinct from old.prompt_id and not (pg_trigger_depth() > 1 and new.prompt_id is null))
     or new.creator_id is distinct from old.creator_id
     or new.media_type is distinct from old.media_type
     or new.media_url is distinct from old.media_url
     or new.thumbnail_url is distinct from old.thumbnail_url
     or new.width is distinct from old.width
     or new.height is distinct from old.height
  then
    raise exception 'prompt_results: yalnızca tool, text_content, has_modification, modification_summary, modified_prompt_text alanları düzenlenebilir.';
  end if;
  return new;
end;
$$;

-- 4) Prompt silinmeden önce: topluluğa özgü promptun sonuçları birlikte gider; diğerlerinin sahiplerine bildirim yazılır (sonuçlar yetim kalır).
create or replace function public.prompts_before_delete_results()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.community_id is not null then
    delete from public.prompt_results where prompt_id = old.id;
    return old;
  end if;

  -- Kişi başına tek bildirim (o kişinin en yeni sonucuna gider). Yazar hesabı da siliniyorsa (hesap silme) actor boş kalır.
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  select r.creator_id,
         (select pr.id from public.profiles pr where pr.id = old.author_id),
         'system',
         'Sonucunun promptunu sildi: "' || public.truncate_preview(coalesce(old.title, '')) || '"',
         '/results/local?id=' || r.id
  from (
    select distinct on (x.creator_id) x.creator_id, x.id
    from public.prompt_results x
    where x.prompt_id = old.id and x.creator_id <> old.author_id
    order by x.creator_id, x.created_at desc
    limit 20000
  ) r;
  return old;
end;
$$;

drop trigger if exists prompts_before_delete_results on public.prompts;
create trigger prompts_before_delete_results
  before delete on public.prompts
  for each row execute function public.prompts_before_delete_results();

-- 5) Profildeki "Sonuçlar" (docs/history/282-*, 283-*): bir kişinin sonuçları + promptunun adı. SECURITY INVOKER → okuma politikası geçerlidir
-- (ziyaretçi yalnız okuyabildiğini, sahibi kendi yetimlerini görür). Topluluğa özgü promptun sonucu listelenmez.
create or replace function public.profile_results(p_creator uuid, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid,
  prompt_id uuid,
  prompt_title text,
  media_type text,
  thumbnail_url text,
  text_content text,
  tool text,
  has_modification boolean,
  like_count integer,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.id, r.prompt_id, p.title, r.media_type, r.thumbnail_url, r.text_content, r.tool, r.has_modification, r.like_count, r.created_at,
         count(*) over ()
  from public.prompt_results r
  left join public.prompts p on p.id = r.prompt_id
  where r.creator_id = p_creator
    and (r.prompt_id is null or (p.id is not null and p.community_id is null))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.profile_result_count(p_creator uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)
  from public.prompt_results r
  left join public.prompts p on p.id = r.prompt_id
  where r.creator_id = p_creator
    and (r.prompt_id is null or (p.id is not null and p.community_id is null))
$$;

revoke all on function public.profile_results(uuid, integer, integer) from public;
revoke all on function public.profile_result_count(uuid) from public;
grant execute on function public.profile_results(uuid, integer, integer) to anon, authenticated;
grant execute on function public.profile_result_count(uuid) to anon, authenticated;

-- Tetikleyici fonksiyonlardan EXECUTE kapalı.
revoke all on function public.prompts_before_delete_results() from public, anon, authenticated;
revoke all on function public.prompt_results_before_update_guard() from public, anon, authenticated;
