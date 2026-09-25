-- Promptly — Generator Local sayfasına Kullanıcı Sonuçları entegrasyonu.
--
-- === AŞAMA 0 denetimi (bu migration'ı yazmadan önce yapıldı) ================
-- Görevin kendi §22 kuralı: TEK sonuç sistemi, iki paralel sistem YOK.
-- `prompt_results` (20260919410000) zaten `prompt_id` üzerinden bir "hangi
-- içeriğin altında" ilişkisi taşıyordu — bu migration YENİ bir
-- `generator_results` tablosu KURMUYOR, aynı tabloyu genişletiyor:
--   - `prompt_id` artık nullable (önceden `not null`).
--   - Yeni, nullable `generator_id` eklendi.
--   - "Tam olarak bir kaynak" CHECK'i (`prompt_likes`/`prompt_comments`'ın
--     zaten kullandığı "exactly one target" deseninin birebir aynısı).
--   - Değişiklik alanları (`has_modification`/`modification_summary`/
--     `modified_prompt_text`) şimdi veritabanı seviyesinde de yalnızca
--     `prompt_id is not null` iken dolu olabiliyor — §5/§23'ün "Generator
--     sonuçlarında prompt değişikliği YOK" kuralı yalnızca frontend'de
--     gizlenmiyor, CHECK kısıtıyla da zorunlu kılınıyor (bu projenin
--     "frontend'de butonu gizlemek güvenlik olarak yeterli değildir"
--     ilkesiyle aynı titizlik).
--
-- Değişmeyenler (bilinçli olarak dokunulmadı):
--   - `prompt_likes`/`prompt_comments`'ın kendi `result_id` kolonu/CHECK'i/
--     sayaç trigger'ları (20260919410000) zaten `result_id`'yi opak bir id
--     olarak ele alıyor — bir sonucun kendi `prompt_id` mi `generator_id`
--     mi taşıdığını hiç bilmelerine gerek yok, hiçbiri değişmedi.
--   - `notify_comment_reply`/`notify_comment_like` de aynı sebeple hiç
--     değişmedi.
--   - Storage (`result-media` bucket'ı) — medya yükleme yolu zaten
--     `{user_id}/{result_id}-...` şeklinde, kaynağın prompt mı generator mı
--     olduğuyla hiç ilgilenmiyor.
--   - `prompt_comments`'ın SELECT/INSERT RLS'indeki `result_id` kolu
--     DEĞİŞMEK ZORUNDA — eskisi yalnızca `r.prompt_id` üzerinden bir join
--     yapıyordu, `prompt_id` null olan (generator kökenli) bir sonucun
--     yorumlarını artık YANLIŞLIKLA hiç görünür/yazılabilir kılmazdı. Bu
--     migration bu iki politikayı, hem prompt hem generator kökenini
--     kapsayacak şekilde düzeltiyor.

-- === prompt_results: ikinci, nullable bir kaynak (generator_id) ==============
alter table public.prompt_results
  alter column prompt_id drop not null,
  add column generator_id uuid references public.generators (id) on delete cascade;

alter table public.prompt_results
  add constraint prompt_results_exactly_one_source check (
    (prompt_id is not null)::int + (generator_id is not null)::int = 1
  );

-- §4/§5/§23: değişiklik alanları yalnızca prompt kökenli bir sonuçta dolu
-- olabilir — bir generator sonucunda `has_modification` veritabanı
-- seviyesinde de asla `true` olamaz.
alter table public.prompt_results drop constraint prompt_results_modification_shape;
alter table public.prompt_results add constraint prompt_results_modification_shape check (
  (has_modification = false and modification_summary is null and modified_prompt_text is null)
  or (has_modification = true and prompt_id is not null and (modification_summary is not null or modified_prompt_text is not null))
);

create index prompt_results_generator_id_idx on public.prompt_results (generator_id, created_at desc) where generator_id is not null;

-- RLS: `prompt_media`/`prompt_comments`'ın generator koluyla BİREBİR AYNI
-- görünürlük kuralı ("sahibiyse her zaman, değilse yalnızca yayınlanmış +
-- public/unlisted") — prompt kolu hiç değişmedi.
drop policy "Prompt results are readable wherever their prompt is readable" on public.prompt_results;
create policy "Prompt results are readable wherever their prompt or generator is readable"
  on public.prompt_results for select
  using (
    (prompt_id is not null and exists (
      select 1 from public.prompts p
      where p.id = prompt_results.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    ))
    or (generator_id is not null and exists (
      select 1 from public.generators g
      where g.id = prompt_results.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    ))
  );

drop policy "Authenticated users can share a result for a published prompt" on public.prompt_results;
create policy "Authenticated users can share a result for a visible prompt or generator"
  on public.prompt_results for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and (
      (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_id and p.status = 'published'))
      or (generator_id is not null and exists (
        select 1 from public.generators g
        where g.id = generator_id
          and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
      ))
    )
  );

-- === prompt_comments: `result_id` görünürlüğü artık iki kaynağı da kapsıyor =
drop policy "Comments are readable wherever their target is readable" on public.prompt_comments;
create policy "Comments are readable wherever their target is readable"
  on public.prompt_comments for select
  using (
    (prompt_id is not null and exists (
      select 1 from public.prompts p
      where p.id = prompt_comments.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    ))
    or (request_id is not null)
    or (generator_id is not null and exists (
      select 1 from public.generators g
      where g.id = prompt_comments.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    ))
    or (result_id is not null and exists (
      select 1 from public.prompt_results r
      where r.id = prompt_comments.result_id
        and (
          (r.prompt_id is not null and exists (
            select 1 from public.prompts p where p.id = r.prompt_id and (p.status = 'published' or p.author_id = auth.uid())
          ))
          or (r.generator_id is not null and exists (
            select 1 from public.generators g where g.id = r.generator_id and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
          ))
        )
    ))
  );

drop policy "Authenticated users can comment on visible targets" on public.prompt_comments;
create policy "Authenticated users can comment on visible targets"
  on public.prompt_comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      (prompt_id is not null and exists (
        select 1 from public.prompts p
        where p.id = prompt_comments.prompt_id
          and (p.status = 'published' or p.author_id = auth.uid())
      ))
      or (request_id is not null)
      or (generator_id is not null and exists (
        select 1 from public.generators g
        where g.id = prompt_comments.generator_id
          and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
      ))
      or (result_id is not null and exists (
        select 1 from public.prompt_results r
        where r.id = prompt_comments.result_id
          and (
            (r.prompt_id is not null and exists (
              select 1 from public.prompts p where p.id = r.prompt_id and (p.status = 'published' or p.author_id = auth.uid())
            ))
            or (r.generator_id is not null and exists (
              select 1 from public.generators g where g.id = r.generator_id and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
            ))
          )
      ))
    )
  );

-- === Bildirim: yeni sonuç → generator sahibine de bildirim ===================
-- Prompt dalı hiç değişmedi (kendine bildirim yok kuralı dahil); yalnızca
-- generator dalı eklendi.
create or replace function public.notify_new_prompt_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
  v_message text;
begin
  if new.prompt_id is not null then
    select author_id, title into v_owner_id, v_title from public.prompts where id = new.prompt_id;
    v_message := 'Promptun için bir sonuç paylaştı: "' || public.truncate_preview(coalesce(v_title, '')) || '"';
  else
    select creator_id, title into v_owner_id, v_title from public.generators where id = new.generator_id;
    v_message := 'Generatorun için bir sonuç paylaştı: "' || public.truncate_preview(coalesce(v_title, '')) || '"';
  end if;

  if v_owner_id is null or v_owner_id = new.creator_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_owner_id, new.creator_id, 'prompt_result_shared', v_message, '/results/local?id=' || new.id);
  return new;
end;
$$;
