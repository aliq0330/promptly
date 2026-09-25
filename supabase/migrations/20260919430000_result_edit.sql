-- Promptly — Kullanıcı Sonuçlarını gerçekten düzenleyebilme.
--
-- Önceki migration'ın (20260919410000) bilinçli kapsam kararı ("bir sonuç
-- düzenlenemiyor, yalnızca eklenip silinebiliyor") kullanıcının açık
-- isteğiyle tersine çevrildi: bir sonucun kendi sahibi artık "Araç/Model",
-- (yalnızca metin/diğer türde) metin içeriğini, ve (yalnızca prompt
-- kökenli bir sonuçta) "Promptu değiştirdin mi?" alanlarını gerçekten
-- düzenleyebiliyor.
--
-- Yeni bir sistem KURULMADI — yalnızca `prompt_results`'e gerçek bir UPDATE
-- RLS politikası + hangi kolonların değişebileceğini veritabanı seviyesinde
-- zorlayan bir BEFORE UPDATE trigger eklendi (CLAUDE.md §19/§23'ün
-- "frontend'de gizlemek yeterli değil" ilkesiyle aynı titizlik): medya
-- dosyasının kendisi (media_type/media_url/thumbnail_url/width/height) ve
-- kaynağın kimliği (prompt_id/generator_id/creator_id) HİÇBİR ZAMAN
-- değiştirilemiyor — yalnızca metadata alanları düzenlenebiliyor. Sayaç
-- trigger'larının (`handle_prompt_like_change`/`handle_prompt_comment_
-- change`) kendi `like_count`/`comment_count` güncellemeleri bu guard'ın
-- hiç kapsamadığı kolonlar olduğundan etkilenmiyor.

create policy "Creators can edit their own result"
  on public.prompt_results for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create or replace function public.prompt_results_before_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prompt_id is distinct from old.prompt_id
    or new.generator_id is distinct from old.generator_id
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

create trigger prompt_results_before_update_guard_trigger
  before update on public.prompt_results
  for each row
  execute function public.prompt_results_before_update_guard();
