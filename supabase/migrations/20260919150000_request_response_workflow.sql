-- Promptly — Prompt İstekleri / Yanıt Sistemi sağlamlaştırması.
--
-- Bölüm 9/10/21 Faz 5 zaten şunları gerçek yapmıştı: istek oluşturma, gerçek
-- bir isteğe gerçek bir prompt olarak yanıt verme (origin_type =
-- 'request_response'), yanıt seçme/kaldırma, ve manuel kapat/aç. Bu
-- migration üç gerçek boşluğu kapatıyor:
--
--   1. Kapalı/yanıtlanmış bir isteğe yeni yanıt eklenmesi yalnızca
--      istemci tarafında (buton gizleme) engelleniyordu — sunucu tarafında
--      hiçbir kontrol yoktu. Artık bir BEFORE INSERT trigger'ı bunu
--      veritabanı seviyesinde reddediyor.
--   2. `selected_response_prompt_id` doğrudan bir UPDATE ile herhangi bir
--      UUID'ye ayarlanabiliyordu — o UUID'nin gerçekten bu isteğin bir
--      yanıtı olup olmadığı hiç doğrulanmıyordu. Artık bir BEFORE UPDATE
--      trigger'ı bunu zorluyor, ve yanıt seçme/değiştirme/kaldırma artık
--      tek, atomik bir RPC fonksiyonu (`select_prompt_request_response`)
--      üzerinden yapılıyor.
--   3. Manuel "İsteği kapat" ile seçim sonucu otomatik kapanma birbirine
--      karışıyordu: bir isteği manuel kapattıktan sonra bir yanıt seçilip
--      sonra o seçim kaldırılırsa, istek yanlışlıkla tekrar "Açık" oluyordu.
--      Yeni `closed_by_owner` kolonu bu iki kapanma nedenini ayırıyor.
--
-- Ayrıca: yeni bir yanıt geldiğinde istek sahibine, bir yanıt seçildiğinde
-- yanıt sahibine gerçek bildirim üreten iki SECURITY DEFINER trigger
-- eklendi (Bölüm 19'dan beri `notifications` tablosuna client'tan insert
-- izni kasıtlı olarak yok — bu yüzden bildirimler ancak sunucu tarafı
-- trigger'larla üretilebilir, tıpkı sayaç trigger'ları gibi).

-- === Yeni kolonlar ========================================================

-- Bir yanıtın (origin_type = 'request_response' olan bir prompt) normal
-- profil/akış/keşfet sorgularında görünüp görünmeyeceği — istek yanıtları
-- arasında ve kendi detay sayfasında HER ZAMAN görünür kalır, bu yalnızca
-- "normal gönderi" görünürlüğünü kontrol eder. Orijinal/remix promptlar
-- için anlamsız, her zaman true kalır.
alter table public.prompts
  add column show_on_profile boolean not null default true;

-- Bir isteğin sahibi tarafından "İsteği kapat" ile manuel kapatılıp
-- kapatılmadığı — bir yanıt seçildiğinde otomatik oluşan 'answered'
-- durumundan ayrı tutulur, böylece seçim kaldırıldığında manuel kapatma
-- yanlışlıkla açığa çevrilmez (bkz. select_prompt_request_response).
alter table public.prompt_requests
  add column closed_by_owner boolean not null default false;

-- Durum ile seçili yanıt arasında tek, tutarlı bir ilişki zorunlu kılınır:
-- bir yanıt seçiliyse durum yalnızca 'answered' olabilir; seçili yanıt
-- yoksa durum yalnızca 'open' veya 'closed' olabilir. Bu, uygulama
-- kodundaki bir hatanın (ya da PostgREST'e doğrudan yapılan bir isteğin)
-- durumu sessizce tutarsız bırakmasını veritabanı seviyesinde imkansız
-- kılar.
alter table public.prompt_requests
  add constraint prompt_requests_status_shape check (
    (selected_response_prompt_id is not null and status = 'answered')
    or (selected_response_prompt_id is null and status in ('open', 'closed'))
  );

-- === Kapalı/yanıtlanmış bir isteğe yeni yanıt eklenmesini reddet =========

create or replace function public.validate_prompt_response_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if new.origin_type = 'request_response' then
    select status into v_status from public.prompt_requests where id = new.request_id;
    if v_status is null then
      raise exception 'Yanıt verilen istek bulunamadı.';
    elsif v_status <> 'open' then
      raise exception 'Bu istek kapandı, artık yeni yanıt kabul edilmiyor.';
    end if;
  end if;
  return new;
end;
$$;

create trigger prompts_before_insert_validate_response
  before insert on public.prompts
  for each row
  execute function public.validate_prompt_response_target();

-- === Seçilen yanıtın gerçekten bu isteğe ait olduğunu zorla ==============

create or replace function public.validate_selected_response()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.selected_response_prompt_id is not null
     and new.selected_response_prompt_id is distinct from old.selected_response_prompt_id then
    if not exists (
      select 1 from public.prompts
      where id = new.selected_response_prompt_id
        and request_id = new.id
        and origin_type = 'request_response'
    ) then
      raise exception 'Seçilen yanıt bu isteğe ait değil.';
    end if;
  end if;
  return new;
end;
$$;

create trigger prompt_requests_before_update_validate_selection
  before update on public.prompt_requests
  for each row
  execute function public.validate_selected_response();

-- === Atomik yanıt seçme / değiştirme / kaldırma ===========================
--
-- security invoker (varsayılan) — RLS'nin "yalnızca sahibi güncelleyebilir"
-- politikası (aşağıdaki UPDATE'te) normal şekilde uygulanmaya devam eder;
-- buradaki auth.uid() kontrolü ek bir savunma katmanı ve sahiplik
-- ihlalinde RLS'nin sessizce "0 satır etkilendi" dönmesi yerine anlaşılır
-- bir hata vermek için. Kasıtlı olarak `for update` KULLANMIYOR: Postgres
-- RLS, `FOR UPDATE`/`FOR SHARE` ile satır kilitleyen bir SELECT'e SELECT
-- politikasının yanında o tablonun UPDATE politikasını da uygular — bu
-- yüzden sahibi olmayan biri satırı `for update` ile hiç GÖREMEZ (0 satır
-- döner), ve aşağıdaki "sahip değilsin" hata mesajı hiç tetiklenmeden
-- yanıltıcı bir "istek bulunamadı" hatası alınırdı (test sırasında fiilen
-- gözlemlendi). Düz bir SELECT (herkese açık okuma politikası sayesinde
-- satırı her zaman buluyor) + kendi sahiplik kontrolümüz doğru mesajı
-- veriyor; asıl güvenlik garantisi zaten aşağıdaki UPDATE'in kendi RLS
-- politikasından geliyor, bu yalnızca daha iyi bir hata mesajı için.
create or replace function public.select_prompt_request_response(
  p_request_id uuid,
  p_response_prompt_id uuid default null
)
returns public.prompt_requests
language plpgsql
set search_path = public
as $$
declare
  v_request public.prompt_requests;
  v_new_status text;
begin
  select * into v_request from public.prompt_requests where id = p_request_id;
  if not found then
    raise exception 'İstek bulunamadı.';
  end if;
  if v_request.author_id <> auth.uid() then
    raise exception 'Yalnızca isteğin sahibi bir yanıt seçebilir.';
  end if;

  if p_response_prompt_id is not null then
    if not exists (
      select 1 from public.prompts
      where id = p_response_prompt_id
        and request_id = p_request_id
        and origin_type = 'request_response'
    ) then
      raise exception 'Seçilen yanıt bu isteğe ait değil.';
    end if;
    v_new_status := 'answered';
  else
    v_new_status := case when v_request.closed_by_owner then 'closed' else 'open' end;
  end if;

  update public.prompt_requests
  set selected_response_prompt_id = p_response_prompt_id,
      status = v_new_status
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.select_prompt_request_response(uuid, uuid) from public;
grant execute on function public.select_prompt_request_response(uuid, uuid) to authenticated;

-- === Bildirimler ===========================================================
-- SECURITY DEFINER: sayaç trigger'larıyla aynı gerekçe (Bölüm 19) — bir
-- kullanıcının eylemi BAŞKA bir kullanıcının notifications satırına yazmak
-- zorunda, ve `notifications` tablosuna hiçbir zaman client'tan insert
-- politikası verilmedi (bir kullanıcının başkası adına keyfi bildirim
-- oluşturmasını önlemek için) — bu yüzden gerçek bildirim üretimi ancak
-- böyle bir sunucu tarafı trigger ile mümkün.

create or replace function public.notify_new_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_author uuid;
  v_request_title text;
begin
  if new.origin_type <> 'request_response' then
    return new;
  end if;

  select author_id, title into v_request_author, v_request_title
    from public.prompt_requests where id = new.request_id;

  if v_request_author is null or v_request_author = new.author_id then
    return new; -- istek bulunamadı (FK zaten engeller) ya da kendi isteğine kendi yanıtı
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_request_author,
    new.author_id,
    'request_response',
    'İsteğine yeni bir yanıt geldi: "' || coalesce(v_request_title, '') || '"',
    '/requests/local?id=' || new.request_id
  );

  return new;
end;
$$;

create trigger prompts_after_insert_notify_request_response
  after insert on public.prompts
  for each row
  execute function public.notify_new_request_response();

create or replace function public.notify_selected_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response_author uuid;
begin
  if new.selected_response_prompt_id is null
     or new.selected_response_prompt_id is not distinct from old.selected_response_prompt_id then
    return new;
  end if;

  select author_id into v_response_author
    from public.prompts where id = new.selected_response_prompt_id;

  if v_response_author is null or v_response_author = new.author_id then
    return new; -- yanıt bulunamadı ya da kendi isteğine kendi yanıtını seçti
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_response_author,
    new.author_id,
    'request_response',
    'Yanıtın "' || new.title || '" isteği için seçildi!',
    '/requests/local?id=' || new.id
  );

  return new;
end;
$$;

create trigger prompt_requests_after_update_notify_selection
  after update on public.prompt_requests
  for each row
  execute function public.notify_selected_response();
