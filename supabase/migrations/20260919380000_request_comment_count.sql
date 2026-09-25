-- Prompt İsteği aksiyon satırı son düzenlemesi (CLAUDE.md "PROMPTLY —
-- PROMPT İSTEĞİ AKSİYON SATIRI SON DÜZENLEME" görevi) — yeni bir yorum
-- sistemi YAZILMADI: `prompt_comments.request_id` (Bölüm 9.2'den beri) ve
-- `handle_prompt_comment_change()` (Bölüm 19/9.34) zaten gerçek yorum
-- eklemeyi/silmeyi ele alıyordu, yalnızca bir isteğin yorum SAYISINI
-- kalıcı tutan bir sayaç hiç yoktu (yorumlar zaten gerçekti, sayaç
-- eksikti). Bu, `prompts`/`generators`'ın kendi `comment_count`
-- kolonlarıyla BİREBİR AYNI desen — üçüncü, `request_id` dalı eklenerek.

alter table public.prompt_requests
  add column comment_count integer not null default 0 check (comment_count >= 0);

-- Bir isteğe yapılan yorumlar Bölüm 9.2'den beri zaten gerçekti — yalnızca
-- sayaç yeni. Yeni kolon `default 0` ile geliyor, bu yüzden bu migration'dan
-- ÖNCE var olan gerçek yorumlar backfill edilmeden "0 yorum" gibi yanlış
-- görünürdü ("sayfa yenilendiğinde doğru gelmeli" gereksinimini karşılamak
-- için tek seferlik, idempotent bir düzeltme).
update public.prompt_requests r
set comment_count = (
  select count(*) from public.prompt_comments c where c.request_id = r.id
);

-- `security definer` + sabit `search_path` korunuyor — Bölüm 19'un zaten
-- uyardığı, cross-user bir sayaç güncellemesinin RLS'in UPDATE
-- politikasına (yalnızca ilgili tablonun sahibi) takılıp sessizce 0 satır
-- etkilemesi tuzağına karşı gerekli.
create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    elsif new.generator_id is not null then
      update public.generators set comment_count = comment_count + 1 where id = new.generator_id;
    else
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.generator_id is not null then
      update public.generators set comment_count = comment_count - 1 where id = old.generator_id;
    else
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;
