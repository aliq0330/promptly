-- Moderatör: hesabı ve tüm içeriğini kalıcı silme (CLAUDE.md Bölüm 9.140).
-- Yıkıcı ifadeler içerdiğinden ana migration'dan ayrıldı.

-- Hesabı ve tüm içeriğini kalıcı siler. Başkalarının içeriği korunur: kullanıcının
-- isteklerine verilmiş yanıtlar normal paylaşıma dönüşür, yorumlarına verilen yanıtlar üst seviye olur.
create or replace function public.admin_delete_user(p_user_id uuid, p_confirm_username text)
returns void language plpgsql security definer set search_path = public as $$
declare v_username text;
begin
  perform public._admin_check_target(p_user_id);
  select username into v_username from public.profiles where id = p_user_id;
  if v_username is distinct from p_confirm_username then raise exception 'Kullanıcı adı eşleşmiyor.'; end if;
  perform public._admin_log('delete_user', p_user_id, jsonb_build_object('username', v_username,
    'email', (select email from auth.users where id = p_user_id)));

  -- Başkalarının yanıtları / yorumları silinmesin.
  update public.prompts set origin_type = 'original', request_id = null
    where origin_type = 'request_response' and request_id in (select id from public.prompt_requests where author_id = p_user_id);
  update public.prompt_requests set selected_response_prompt_id = null, status = 'closed', closed_by_owner = true
    where selected_response_prompt_id in (select id from public.prompts where author_id = p_user_id);
  update public.prompt_comments set parent_id = null
    where parent_id in (select id from public.prompt_comments where author_id = p_user_id) and author_id <> p_user_id;

  -- Koruyucu trigger'lar bu silmeyi iptal etmesin (transaction'la birlikte geri alınır).
  alter table public.prompt_comments disable trigger prompt_comments_before_delete_protect_replies;
  alter table public.collections disable trigger collections_before_delete;
  delete from auth.users where id = p_user_id;
  alter table public.prompt_comments enable trigger prompt_comments_before_delete_protect_replies;
  alter table public.collections enable trigger collections_before_delete;
end $$;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;
