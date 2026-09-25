-- Prompt İsteği beğenisi (CLAUDE.md "PROMPT İSTEĞİ ETKİLEŞİM VE MENÜ
-- SİSTEMİ EŞİTLEME" görevi) — bir Prompt İsteği artık `prompts`/
-- `generators` ile BİREBİR AYNI beğeni sistemini paylaşıyor. Yeni bir like
-- sistemi YAZILMADI: Bölüm 9.34/9.35'in `prompt_likes`'a `generator_id`
-- eklerken kurduğu desen (nullable hedef sütunu + "tam olarak bir hedef"
-- CHECK'i + partial unique index + cross-user sayaç trigger'ı) burada
-- üçüncü bir nullable `request_id` ile genişletiliyor.
--
-- Var olan RLS politikaları ("Likes are publicly readable" / "Authenticated
-- users can like prompts for themselves" / "Users can remove their own
-- likes") hiçbir hedef sütununa (`prompt_id`/`generator_id`) referans
-- vermiyor — `auth.uid() = user_id` yeterli, bu yüzden hiç değişmedi.
--
-- Bildirim üretimi (notify_prompt_like/cleanup_prompt_like_notification)
-- BİLİNÇLİ OLARAK genişletilmedi: bu görev yalnızca gerçek beğeni/yorum/
-- menü paritesini istedi, yeni bir bildirim türü şartnamede hiç istenmedi.
-- Bu iki fonksiyon zaten `new.prompt_id`/`old.prompt_id` null olduğunda
-- sessizce no-op oluyor (generator beğenisinde de aynı şekilde hiç
-- tetiklenmiyorlardı) — request_id eklenmesi onları hiç etkilemiyor.

alter table public.prompt_requests
  add column like_count integer not null default 0 check (like_count >= 0);

alter table public.prompt_likes
  add column request_id uuid references public.prompt_requests (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes
  add constraint prompt_likes_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (request_id is not null)::int = 1
  );

create unique index prompt_likes_request_user_uidx on public.prompt_likes (request_id, user_id) where request_id is not null;
create index prompt_likes_request_id_idx on public.prompt_likes (request_id) where request_id is not null;

-- `security definer` + sabit `search_path` korunuyor — bu, Bölüm 19'un
-- zaten uyardığı, cross-user bir sayaç güncellemesinin RLS'in UPDATE
-- politikasına (yalnızca ilgili tablonun sahibi) takılıp sessizce 0 satır
-- etkilemesi tuzağına karşı gerekli.
create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    elsif new.generator_id is not null then
      update public.generators set like_count = like_count + 1 where id = new.generator_id;
    else
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.generator_id is not null then
      update public.generators set like_count = like_count - 1 where id = old.generator_id;
    else
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
