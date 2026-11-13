-- Yorum sabitleme (docs/history/385-*) — YALNIZ EKLEYİCİ (expand): hiçbir sütun/fonksiyon silinmez ya da yeniden adlandırılmaz.
--
-- İçeriğin sahibi (prompt / istek / workflow / hazır ayar yazarı) o içeriğin altındaki TEK bir üst düzey yorumu sabitleyebilir; sabit yorum
-- hangi sıralama seçilirse seçilsin listenin başında durur. Kurallar:
--   1) `prompt_comments.pinned_at` yalnız `set_comment_pinned` RPC'siyle değişir (yazar kendi yorumunu sabitleyemesin diye BEFORE INSERT/UPDATE bekçisi).
--   2) Hedef başına en çok BİR sabit yorum: RPC öncekini kaldırır, kısmi benzersiz dizinler yarışta da garanti eder.
--   3) Yalnız silinmemiş, üst düzey (yanıt olmayan) yorum sabitlenir; içerik sahibi dışındaki herkes `pin_not_allowed` alır.
-- Topluluk gönderisi / Space / alıntı / kullanıcı sonucu yorumları sabitlenmez (sahiplik kuralı ayrı; bilerek kapsam dışı).

alter table public.prompt_comments add column if not exists pinned_at timestamptz;

create unique index if not exists prompt_comments_one_pin_prompt on public.prompt_comments (prompt_id) where pinned_at is not null and prompt_id is not null;
create unique index if not exists prompt_comments_one_pin_request on public.prompt_comments (request_id) where pinned_at is not null and request_id is not null;
create unique index if not exists prompt_comments_one_pin_workflow on public.prompt_comments (workflow_id) where pinned_at is not null and workflow_id is not null;
create unique index if not exists prompt_comments_one_pin_preset on public.prompt_comments (preset_id) where pinned_at is not null and preset_id is not null;

-- İstemci `pinned_at`'i doğrudan yazamaz: yeni satırda her zaman boş, güncellemede yalnız RPC'nin koyduğu işlem-yerel işaretle değişir.
create or replace function public.prompt_comments_pin_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.pinned_at := null;
    return new;
  end if;
  -- Silinen yorum (yanıtı olanlarda soft-delete: `deleted_at` dolar, satır durur) sabit kalmaz.
  if new.deleted_at is not null and old.deleted_at is null then
    new.pinned_at := null;
    return new;
  end if;
  if new.pinned_at is distinct from old.pinned_at and coalesce(current_setting('promptly.comment_pin', true), '') <> 'on' then
    raise exception 'pin_not_allowed';
  end if;
  return new;
end;
$$;
revoke all on function public.prompt_comments_pin_guard() from public, anon, authenticated;

drop trigger if exists prompt_comments_pin_guard on public.prompt_comments;
create trigger prompt_comments_pin_guard
  before insert or update on public.prompt_comments
  for each row execute function public.prompt_comments_pin_guard();

-- Yorumu sabitle / sabitlemeyi kaldır. Yalnız içeriğin sahibi; hedef başına tek sabit yorum (öncekinin sabitlemesi kalkar).
create or replace function public.set_comment_pinned(p_comment_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.prompt_comments%rowtype;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.prompt_comments where id = p_comment_id for update;
  if not found then raise exception 'comment_not_found'; end if;

  if c.prompt_id is not null then
    select author_id into v_owner from public.prompts where id = c.prompt_id;
  elsif c.request_id is not null then
    select author_id into v_owner from public.prompt_requests where id = c.request_id;
  elsif c.workflow_id is not null then
    select creator_id into v_owner from public.workflows where id = c.workflow_id;
  elsif c.preset_id is not null then
    select creator_id into v_owner from public.presets where id = c.preset_id;
  end if;
  if v_owner is null or v_owner <> v_uid then raise exception 'pin_not_allowed'; end if;

  if p_pinned then
    if c.parent_id is not null then raise exception 'pin_top_level_only'; end if;
    if c.deleted_at is not null then raise exception 'comment_deleted'; end if;
  end if;

  perform set_config('promptly.comment_pin', 'on', true);
  if p_pinned then
    update public.prompt_comments set pinned_at = null
    where pinned_at is not null and id <> c.id
      and prompt_id is not distinct from c.prompt_id and request_id is not distinct from c.request_id
      and workflow_id is not distinct from c.workflow_id and preset_id is not distinct from c.preset_id;
    update public.prompt_comments set pinned_at = now() where id = c.id;
  else
    update public.prompt_comments set pinned_at = null where id = c.id and pinned_at is not null;
  end if;
  perform set_config('promptly.comment_pin', 'off', true);
end;
$$;
revoke all on function public.set_comment_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_comment_pinned(uuid, boolean) to authenticated;
