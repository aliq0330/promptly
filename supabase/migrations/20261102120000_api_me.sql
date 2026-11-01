-- Kişisel API anahtarı / OAuth ile "benim hesabım" okumaları (docs/history/313-*, 315-*): Edge Function, işlemde `set local role authenticated` +
-- `request.jwt.claims` kurduktan sonra bu RPC'leri çağırır. Hepsi SECURITY INVOKER: çağıranın RLS'i uygulanır, kendi kuralımızı yazmayız;
-- `author_id = auth.uid()` süzgeci yalnız niyeti belgeler. Yazma YENİ BİR yol değildir: mevcut `import_prompts` (INVOKER; hep özel taslak, askı/hız sınırı geçerli).
--
-- Yalnızca ekleyicidir (expand). Liste fonksiyonları keyset sayfalar ve satır sayısını sınırlar (en çok 51; çağıran limit+1 ister, fazlası "sonraki sayfa" demektir).
-- Topluluğa özgü içerik (`community_id` dolu) ve silinmiş prompt listelenmez (CLAUDE.md §6).

create or replace function public.api_me_profile()
returns table (user_id uuid, username text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.username from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.api_me_prompts(
  p_limit integer default 20, p_after_created_at timestamptz default null, p_after_id uuid default null, p_status text default null)
returns table (id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.title, left(coalesce(p.description, ''), 300), p.content_type, p.status, p.visibility, p.created_at, p.updated_at
  from public.prompts p
  where p.author_id = auth.uid() and p.community_id is null and p.deleted_at is null
    and (p_status is null or p.status = p_status)
    and (p_after_created_at is null or (p.created_at, p.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

create or replace function public.api_me_prompt(p_id uuid)
returns table (id uuid, title text, description text, prompt_text text, content_type text, status text, visibility text, tags text[], created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.title, p.description, p.prompt_text, p.content_type, p.status, p.visibility,
         coalesce((select array_agg(t.tag_slug order by t.tag_slug) from public.prompt_tags t where t.prompt_id = p.id), '{}'::text[]),
         p.created_at, p.updated_at
  from public.prompts p
  where p.id = p_id and p.author_id = auth.uid() and p.community_id is null and p.deleted_at is null;
$$;

-- Kaydettiklerim: tüm koleksiyonlarımdaki benzersiz promptlar (okuyabildiklerim — RLS), en son kaydedilen önce.
create or replace function public.api_me_saved(p_limit integer default 20, p_after_saved_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, title text, description text, content_type text, saved_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.title, left(coalesce(p.description, ''), 300), p.content_type, s.saved_at
  from (
    select ci.prompt_id, max(ci.created_at) as saved_at
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    where c.owner_id = auth.uid() group by ci.prompt_id
  ) s
  join public.prompts p on p.id = s.prompt_id
  where p.community_id is null and p.deleted_at is null
    and (p_after_saved_at is null or (s.saved_at, p.id) < (p_after_saved_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.saved_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

-- İstek başına kullanıcı sınırı (`_rate_limit`, auth.uid() ile): okuma dakikada 120, yazma dakikada 30. `_rate_limit` istemci rollerine kapalı olduğu için
-- bu ince sarmalayıcı SECURITY DEFINER'dır; çağıran kimliği yine `auth.uid()`'dir (oturumsuz çağrı sessizce geçmez: kimlik yoksa hata).
create or replace function public.api_me_throttle(p_write boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_write then perform public._rate_limit('api_me_write', 30, interval '1 minute');
  else perform public._rate_limit('api_me_read', 120, interval '1 minute'); end if;
end $$;

revoke all on function public.api_me_profile() from public, anon;
revoke all on function public.api_me_prompts(integer, timestamptz, uuid, text) from public, anon;
revoke all on function public.api_me_prompt(uuid) from public, anon;
revoke all on function public.api_me_saved(integer, timestamptz, uuid) from public, anon;
revoke all on function public.api_me_throttle(boolean) from public, anon;
grant execute on function public.api_me_profile() to authenticated;
grant execute on function public.api_me_prompts(integer, timestamptz, uuid, text) to authenticated;
grant execute on function public.api_me_prompt(uuid) to authenticated;
grant execute on function public.api_me_saved(integer, timestamptz, uuid) to authenticated;
grant execute on function public.api_me_throttle(boolean) to authenticated;
