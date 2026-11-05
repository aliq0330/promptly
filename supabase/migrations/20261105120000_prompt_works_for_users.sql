-- "Çalıştı mı?" oyunun yorumda ve sonuç kartında rozet olarak görünmesi (docs/history/341-*).
--
-- Yalnızca ekleyicidir (expand): tek yeni okuma RPC'si; tablo/sütun/politika değişmez, oy ve sayaç mantığına dokunulmaz.
--   * `prompt_works_for_users(p_prompt_id, p_user_ids)` — verilen kişilerin O PROMPTTAKİ oyunu döndürür (rozet = yazarın o anki oyunun salt
--     okunur yansıması; yorumun/sonucun içine yazılmaz, oy değişirse rozet de değişir, geri alınırsa kaybolur).
--
-- Gizlilik (oy tablosu istemciye kapalıydı ve öyle kalır): çağıranın verdiği kimlik listesi bir sızıntı kapısı olmasın diye bir oy YALNIZ o kişinin
-- bu promptta SİLİNMEMİŞ bir yorumu ya da paylaştığı bir sonucu varsa döner — yani kişi zaten bu promptun altında görünür biridir; hiç yorum/sonuç
-- bırakmamış birinin oyu hiçbir yoldan okunamaz. Okunamayan prompt (özel/taslak/topluluk/silinmiş/yok) boş döner, varlığı sızmaz.
-- Engel iki yönlü uygulanır (oturumlu çağıran ile engel ilişkisi olan kişinin oyu görünmez); ziyaretçiye de açıktır (yorumlar ve sonuçlar da ziyaretçiye açık).
-- Tek çağrıda en çok 100 kimlik (istemci parçalar); fazlası `too_many_ids`.

create or replace function public.prompt_works_for_users(p_prompt_id uuid, p_user_ids uuid[])
returns table (user_id uuid, works boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_user_ids, 1) > 100 then
    raise exception 'too_many_ids';
  end if;

  if not exists (
    select 1 from public.prompts p
    where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null
  ) then
    return;
  end if;

  return query
  select v.user_id, v.works
  from public.prompt_works_votes v
  where v.prompt_id = p_prompt_id
    and v.user_id = any (p_user_ids)
    and (
      exists (select 1 from public.prompt_comments c where c.prompt_id = p_prompt_id and c.author_id = v.user_id and c.deleted_at is null)
      or exists (select 1 from public.prompt_results r where r.prompt_id = p_prompt_id and r.creator_id = v.user_id)
    )
    and (v_me is null or v.user_id = v_me or not public.is_blocked(v_me, v.user_id));
end $$;
revoke all on function public.prompt_works_for_users(uuid, uuid[]) from public;
grant execute on function public.prompt_works_for_users(uuid, uuid[]) to anon, authenticated;
