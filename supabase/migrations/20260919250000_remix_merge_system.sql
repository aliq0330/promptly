-- Promptly — Remix Dallanma Haritası + Merge (birleştirme) sistemi.
--
-- AŞAMA 1-4 denetim bulguları (önce mevcut mimari incelendi, şartnamenin
-- kendi talimatı gereği):
--   - Remix ilişkisi (`prompts.source_prompt_id`/`root_prompt_id`/
--     `origin_type`) Bölüm 18'den beri ZATEN tam olarak şartnamenin 1.
--     bölümünün istediği şekilde modellenmiş durumda — yeni bir alan
--     GEREKMİYOR. `fetchRemixesOf`/`fetchRemixChain` (src/lib/supabase/
--     prompts.ts) bu ilişkiyi zaten gerçek sorgularla okuyor.
--   - Remix silme güvenliği (Bölüm 11/12'nin "alt remixler otomatik
--     silinmez, kaynak 'silinmiş' olarak işaretlenir" kuralı) Bölüm
--     9.7'nin `handle_prompt_delete` trigger'ıyla ZATEN, HERHANGİ bir
--     zincir derinliğinde (yalnızca kök değil) tam olarak bu şekilde
--     çalışıyor — buraya dokunulmadı.
--   - Bildirim altyapısı (SECURITY DEFINER trigger'lar, `hl=<tür>:<id>`
--     hedefleme deseni, `NOTIFICATION_ICONS`, kategori filtreleri) Bölüm
--     9.6/9.12'den beri olgun ve genişletilebilir durumda — yeni merge
--     bildirimleri bu ile BİREBİR AYNI deseni kullanıyor.
--   - `notify_new_remix` zaten "remix oluşturuldu → kaynak sahibine
--     bildirim, kendine bildirim yok" kuralını uyguluyor (şartnamenin 14.
--     bölümünün "remix_created" isteği) — YENİDEN YAZILMADI.
--
-- Bu migration'ın GERÇEK yeni işi yalnızca: sürüm geçmişi (`prompt_
-- versions`) ve merge talepleri (`merge_requests`) — şartnamenin ayrı bir
-- "merge_contributions" tablosu önerdiği bilgi (kaynak, hedef, katkı
-- sahibi, katkı içeriği) zaten `merge_requests` (source/target/requester)
-- + `prompt_versions` (merge_request_id, created_by, content) alanlarının
-- BİRLEŞİMİYLE tam olarak temsil ediliyor — üçüncü, yinelenen bir tablo
-- BİLİNÇLİ OLARAK oluşturulmadı (şartnamenin kendi "eşdeğer mevcut
-- yapılar varsa gereksiz tekrar oluşturma" kuralına uyarak).

-- === prompt_versions ========================================================
-- Bir prompt'un merge ile kabul edilmiş içerik geçmişi. Yalnızca merge
-- kabul edildiğinde yazılır (aşağıdaki RPC'ler) — düz bir "düzenle"
-- işlemi (mevcut `CreatePromptForm`'un hiç sahip olmadığı bir özellik)
-- burada versiyon ÜRETMEZ; bu bilinçli bir kapsam sınırı (şartname
-- yalnızca merge bağlamında sürüm istiyor).
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  prompt_text text not null,
  tool text,
  change_summary text,
  merge_request_id uuid, -- FK aşağıda, merge_requests tablosu oluşturulduktan sonra ekleniyor (iki tablo birbirine referans veriyor)
  previous_version_id uuid references public.prompt_versions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (prompt_id, version_number)
);

alter table public.prompt_versions enable row level security;
create index prompt_versions_prompt_id_idx on public.prompt_versions (prompt_id, version_number desc);

-- Okuma: promptun kendisi görülebiliyorsa (yayınlanmış + silinmemiş —
-- `prompts`'ın kendi SELECT politikasıyla BİREBİR aynı görünürlük kuralı)
-- sürüm geçmişi de görülebilir. Yazma politikası YOK — tüm satırlar
-- yalnızca aşağıdaki SECURITY DEFINER RPC'ler tarafından oluşturuluyor;
-- bir istemcinin sahte sürüm geçmişi "uydurması" yapısal olarak imkansız.
-- `deleted_at` deliberately NOT checked here — matches the base "Published
-- prompts are public, drafts are author-only" policy's own philosophy
-- (Bölüm 9.7): a soft-deleted prompt's ROW stays selectable (its content
-- is just cleared), so its version history — proof that a merge really
-- happened before the prompt was later deleted — stays visible too.
create policy "Prompt versions are visible wherever the prompt itself is"
  on public.prompt_versions for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_versions.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

-- === merge_requests ==========================================================
create table public.merge_requests (
  id uuid primary key default gen_random_uuid(),
  source_prompt_id uuid not null references public.prompts (id) on delete cascade,
  target_prompt_id uuid not null references public.prompts (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'cancelled')),
  contribution_summary text not null check (char_length(contribution_summary) between 1 and 500),
  description text check (description is null or char_length(description) <= 2000),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  resulting_version_id uuid references public.prompt_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merge_requests_no_self_target check (source_prompt_id <> target_prompt_id)
);

alter table public.prompt_versions
  add constraint prompt_versions_merge_request_id_fkey
    foreign key (merge_request_id) references public.merge_requests (id) on delete set null;

alter table public.merge_requests enable row level security;
create index merge_requests_source_idx on public.merge_requests (source_prompt_id);
create index merge_requests_target_idx on public.merge_requests (target_prompt_id);
create index merge_requests_requester_idx on public.merge_requests (requester_id);

-- Aynı kaynak→hedef çifti için asla birden fazla BEKLEYEN talep olamaz
-- (şartname §6 "aynı talebin tekrar tekrar oluşturulmasını engelle") —
-- veritabanı seviyesinde, yarış durumuna kapalı bir kısıtlama (kısmi
-- unique index, yalnızca pending durumundaki satırlara uygulanıyor).
create unique index merge_requests_one_pending_per_pair
  on public.merge_requests (source_prompt_id, target_prompt_id)
  where status = 'pending';

create trigger merge_requests_set_updated_at
  before update on public.merge_requests
  for each row
  execute function public.set_updated_at();

-- Okuma: taraflardan biri (talep sahibi/hedef sahibi) HER ZAMAN görebilir;
-- ayrıca kaynak VE hedef promptların ikisi de yayınlanmışsa (draft
-- değilse) başka biri de görebilir — haritanın "bekleyen/kabul edilmiş/
-- reddedilmiş/İPTAL EDİLMİŞ merge" göstergesini HERKESE göstermesi
-- gerektiği için (şartname §10, "harita gerçek backend verisinden
-- oluşturulmalı"), gizli (draft) içerik üzerindeki bir talep sızdırılmadan.
-- `deleted_at` BİLİNÇLİ OLARAK kontrol edilmiyor — tıpkı `prompts`'ın
-- kendi temel görünürlük politikası gibi (Bölüm 9.7): soft-deleted bir
-- prompt hâlâ "yayınlanmış" sayılıyor (yalnızca içeriği boşalmış), bu
-- yüzden ona bağlı geçmiş bir merge talebi de (örn. "reddedilmiş, hedefi
-- artık silinmiş") haritada görünmeye devam edebiliyor — tam olarak
-- şartnamenin "silinmiş kaynak: içerik kaldırılmış, ilişki kaydı
-- korunuyor" lejant maddesinin gerektirdiği davranış. Yazma politikası
-- YOK — tüm durum geçişleri yalnızca aşağıdaki RPC'ler üzerinden,
-- SECURITY DEFINER ile.
create policy "Merge requests are visible to participants or via two visible prompts"
  on public.merge_requests for select
  using (
    auth.uid() = requester_id
    or auth.uid() = target_owner_id
    or (
      exists (select 1 from public.prompts p where p.id = merge_requests.source_prompt_id and p.status = 'published')
      and exists (select 1 from public.prompts p where p.id = merge_requests.target_prompt_id and p.status = 'published')
    )
  );

-- === Merge bildirim tipleri ==================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'remix', 'request_response',
    'message', 'message_request', 'system',
    'merge_request_received', 'merge_request_accepted', 'merge_request_rejected',
    'merge_request_withdrawn', 'merge_request_cancelled'
  ));

-- === Ortak dahili fonksiyon: bir merge talebini fiilen kabul etmek =========
-- Hem `accept_merge_request` (hedef sahibi normal onay akışıyla) HEM
-- `create_merge_request`'in "kendi içeriğine talep" kısayolu (şartname
-- §5'in "gereksiz onay akışı oluşturma" talimatı — bir kullanıcı zaten
-- hem kaynağın hem hedefin sahibiyse, talep hiç 'pending' durumuna
-- girmeden ANINDA kabul edilmiş sayılır) tarafından çağrılıyor — TEK bir
-- yerde, iki ayrı kod yolu değil.
create or replace function public._perform_merge_acceptance(p_request_id uuid, p_decided_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_source record;
  v_target record;
  v_next_version int;
  v_prev_version_id uuid;
  v_new_version_id uuid;
begin
  -- Satırı kilitleyip GERÇEKTEN hâlâ pending olduğunu doğrula — eşzamanlı
  -- iki kabul denemesinde ikincisi burada güvenle reddediliyor (şartname
  -- §16 "yarış koşulları ele alınmalı", senaryo 6).
  select * into v_req from public.merge_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Merge talebi bulunamadı.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Bu talep zaten karara bağlanmış.';
  end if;

  select * into v_source from public.prompts where id = v_req.source_prompt_id;
  select * into v_target from public.prompts where id = v_req.target_prompt_id;
  if v_source.id is null or v_source.deleted_at is not null then
    raise exception 'Kaynak içerik artık mevcut değil.';
  end if;
  if v_target.id is null or v_target.deleted_at is not null then
    raise exception 'Hedef içerik artık mevcut değil.';
  end if;

  select max(version_number) into v_next_version from public.prompt_versions where prompt_id = v_target.id;
  select id into v_prev_version_id from public.prompt_versions
    where prompt_id = v_target.id order by version_number desc limit 1;

  -- Hedefin bugüne kadar hiç sürümü yoksa, merge öncesi HÂLİHAZIRDAKİ
  -- içeriği ilk sürüm (v1) olarak geriye dönük kaydet — "A'nın önceki
  -- sürümü sürüm geçmişinde korunur" (şartname §8) tam olarak bunu
  -- gerektiriyor: kaybolmaması gereken "önceki sürüm" merge'den ÖNCEKİ
  -- canlı içerik.
  if v_next_version is null then
    insert into public.prompt_versions
      (prompt_id, version_number, title, description, prompt_text, tool, change_summary, created_by)
    values
      (v_target.id, 1, v_target.title, v_target.description, v_target.prompt_text, v_target.tool,
       'İlk sürüm (merge öncesi mevcut içerik)', v_target.author_id)
    returning id into v_prev_version_id;
    v_next_version := 1;
  end if;

  -- Yeni sürüm — kabul edilen katkının (kaynak remixin) içeriği.
  insert into public.prompt_versions
    (prompt_id, version_number, title, description, prompt_text, tool, change_summary,
     merge_request_id, previous_version_id, created_by)
  values
    (v_target.id, v_next_version + 1, v_source.title, v_source.description, v_source.prompt_text, v_source.tool,
     coalesce(v_req.contribution_summary, 'Merge ile kabul edilen katkı'),
     p_request_id, v_prev_version_id, v_req.requester_id)
  returning id into v_new_version_id;

  -- Hedefin CANLI içeriği yeni sürüme geçiyor — "merge, mevcut orijinalin
  -- üzerine SESSİZCE yazmıyor" çünkü önceki hâl artık v_prev_version_id
  -- ile kalıcı olarak sürüm geçmişinde duruyor; bu, görünür bir sürüm
  -- geçişi, sessiz bir üzerine-yazma değil.
  update public.prompts
    set title = v_source.title,
        description = v_source.description,
        prompt_text = v_source.prompt_text,
        tool = v_source.tool
    where id = v_target.id;

  update public.merge_requests
    set status = 'accepted',
        decided_by = p_decided_by,
        decided_at = now(),
        resulting_version_id = v_new_version_id
    where id = p_request_id;

  -- Katkı sahibine bildirim — kendi kendine merge durumunda (self-target)
  -- requester_id = target_owner_id = p_decided_by olduğundan bu dal hiç
  -- tetiklenmiyor (kendi kendine bildirim yok, şartname §14).
  if v_req.requester_id <> p_decided_by then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_req.requester_id, p_decided_by, 'merge_request_accepted',
      'Merge talebini kabul etti: ' || public.truncate_preview(v_target.title, 60),
      '/prompts/local?id=' || v_target.id || '&hl=merge:' || p_request_id
    );
  end if;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, previous_state, new_state)
  values (
    p_decided_by, 'merge_request', p_request_id, 'accepted',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'accepted', 'resulting_version_id', v_new_version_id)
  );

  return v_new_version_id;
end;
$$;

revoke all on function public._perform_merge_acceptance(uuid, uuid) from public;

-- === create_merge_request ====================================================
create or replace function public.create_merge_request(
  p_source_prompt_id uuid,
  p_target_prompt_id uuid,
  p_contribution_summary text,
  p_description text default null
)
returns table (request_id uuid, request_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_source record;
  v_target_owner uuid;
  v_target_deleted timestamptz;
  v_cursor uuid;
  v_guard int := 0;
  v_found boolean := false;
  v_new_id uuid;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan merge talebi oluşturulamaz.';
  end if;
  if trim(coalesce(p_contribution_summary, '')) = '' then
    raise exception 'Katkı özeti boş olamaz.';
  end if;

  select id, author_id, deleted_at, origin_type, source_prompt_id, root_prompt_id
    into v_source
    from public.prompts where id = p_source_prompt_id;
  if v_source.id is null or v_source.deleted_at is not null then
    raise exception 'Kaynak içerik artık mevcut değil.';
  end if;
  if v_source.author_id <> v_self then
    raise exception 'Yalnızca kendi içeriğin için merge talebi oluşturabilirsin.';
  end if;
  if v_source.origin_type <> 'remix' then
    raise exception 'Yalnızca bir remix, kaynağına merge talebi gönderebilir.';
  end if;

  if p_source_prompt_id = p_target_prompt_id then
    raise exception 'Bir içerik kendisine merge talebi gönderemez.';
  end if;

  select author_id, deleted_at into v_target_owner, v_target_deleted
    from public.prompts where id = p_target_prompt_id;
  if v_target_owner is null or v_target_deleted is not null then
    raise exception 'Hedef içerik artık mevcut değil.';
  end if;

  -- Hedef, GERÇEKTEN bu remixin kaynak zincirinde olmalı (kök orijinal,
  -- doğrudan kaynak, veya aradaki herhangi bir ata) — şartname §5/§16'nın
  -- "yalnızca geçerli, uygun hedefler" ve "döngü/sahte kaynak" korumaları.
  -- Bu kontrol aynı zamanda döngüyü de yapısal olarak imkansız kılıyor:
  -- hedef yalnızca bir ATA olabilir, asla bir torun ya da ilgisiz içerik.
  if v_source.root_prompt_id = p_target_prompt_id then
    v_found := true;
  end if;
  if not v_found then
    v_cursor := v_source.source_prompt_id;
    while v_cursor is not null and v_guard < 20 loop
      if v_cursor = p_target_prompt_id then
        v_found := true;
        exit;
      end if;
      select source_prompt_id into v_cursor from public.prompts where id = v_cursor;
      v_guard := v_guard + 1;
    end loop;
  end if;
  if not v_found then
    raise exception 'Hedef, bu içeriğin kaynak zincirinde değil.';
  end if;

  if exists (
    select 1 from public.merge_requests mr
    where mr.source_prompt_id = p_source_prompt_id and mr.target_prompt_id = p_target_prompt_id and mr.status = 'pending'
  ) then
    raise exception 'Bu kaynak-hedef çifti için zaten bekleyen bir talep var.';
  end if;

  insert into public.merge_requests
    (source_prompt_id, target_prompt_id, requester_id, target_owner_id, contribution_summary, description, status)
  values
    (p_source_prompt_id, p_target_prompt_id, v_self, v_target_owner, trim(p_contribution_summary), p_description, 'pending')
  returning id into v_new_id;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, previous_state, new_state)
  values (v_self, 'merge_request', v_new_id, 'created', null, jsonb_build_object('status', 'pending'));

  -- Kendi içeriğine talep — şartname §5'in "gereksiz onay akışı oluşturma"
  -- ürün kararı: hedefin sahibi zaten talebi gönderen kişiyse (aynı
  -- kullanıcı hem kaynağa hem hedefe sahip), onay bekletmeden ANINDA kabul
  -- ediliyor — dokümante edilmiş, bilinçli bir davranış (bkz. CLAUDE.md).
  if v_target_owner = v_self then
    perform public._perform_merge_acceptance(v_new_id, v_self);
    return query select v_new_id, 'accepted'::text;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_target_owner, v_self, 'merge_request_received',
    'Sana bir merge talebi gönderdi: ' || public.truncate_preview(trim(p_contribution_summary), 60),
    '/prompts/local?id=' || p_target_prompt_id || '&hl=merge:' || v_new_id
  );

  return query select v_new_id, 'pending'::text;
end;
$$;

revoke all on function public.create_merge_request(uuid, uuid, text, text) from public;
grant execute on function public.create_merge_request(uuid, uuid, text, text) to authenticated;

-- === accept_merge_request ====================================================
create or replace function public.accept_merge_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_owner uuid;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan karar verilemez.';
  end if;
  select target_owner_id into v_owner from public.merge_requests where id = p_request_id;
  if v_owner is null then
    raise exception 'Merge talebi bulunamadı.';
  end if;
  if v_owner <> v_self then
    raise exception 'Yalnızca hedef içeriğin sahibi bu talebi kabul edebilir.';
  end if;
  return public._perform_merge_acceptance(p_request_id, v_self);
end;
$$;

revoke all on function public.accept_merge_request(uuid) from public;
grant execute on function public.accept_merge_request(uuid) to authenticated;

-- === reject_merge_request ====================================================
create or replace function public.reject_merge_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_req record;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan karar verilemez.';
  end if;
  select * into v_req from public.merge_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Merge talebi bulunamadı.';
  end if;
  if v_req.target_owner_id <> v_self then
    raise exception 'Yalnızca hedef içeriğin sahibi bu talebi reddedebilir.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Bu talep zaten karara bağlanmış.';
  end if;

  update public.merge_requests
    set status = 'rejected', decided_by = v_self, decided_at = now(), decision_reason = p_reason
    where id = p_request_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_req.requester_id, v_self, 'merge_request_rejected',
    'Merge talebini reddetti.',
    '/prompts/local?id=' || v_req.target_prompt_id || '&hl=merge:' || p_request_id
  );

  insert into public.audit_log (actor_id, entity_type, entity_id, action, previous_state, new_state)
  values (v_self, 'merge_request', p_request_id, 'rejected',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'rejected', 'reason', p_reason));
end;
$$;

revoke all on function public.reject_merge_request(uuid, text) from public;
grant execute on function public.reject_merge_request(uuid, text) to authenticated;

-- === withdraw_merge_request ==================================================
create or replace function public.withdraw_merge_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_req record;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan işlem yapılamaz.';
  end if;
  select * into v_req from public.merge_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Merge talebi bulunamadı.';
  end if;
  if v_req.requester_id <> v_self then
    raise exception 'Yalnızca talebi oluşturan kişi geri çekebilir.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Yalnızca bekleyen bir talep geri çekilebilir.';
  end if;

  update public.merge_requests
    set status = 'withdrawn', withdrawn_at = now()
    where id = p_request_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_req.target_owner_id, v_self, 'merge_request_withdrawn',
    'Sana gönderdiği merge talebini geri çekti.',
    '/prompts/local?id=' || v_req.target_prompt_id || '&hl=merge:' || p_request_id
  );

  insert into public.audit_log (actor_id, entity_type, entity_id, action, previous_state, new_state)
  values (v_self, 'merge_request', p_request_id, 'withdrawn',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'withdrawn'));
end;
$$;

revoke all on function public.withdraw_merge_request(uuid) from public;
grant execute on function public.withdraw_merge_request(uuid) to authenticated;

-- === Kaynak silinince bekleyen merge taleplerinin iptali ====================
-- Bir promptun `deleted_at`i null'dan doluya geçtiğinde (gerçek silme veya
-- Bölüm 9.7'nin soft-delete'i fark etmeksizin — ikisi de aynı UPDATE
-- şeklinde gözlemleniyor), o promptun KAYNAK olduğu bekleyen talepler
-- artık karar bekleyen anlamlı bir katkıya işaret etmiyor — 'cancelled'
-- yapılıyor (şartname §7'nin "cancelled" durumu tam olarak bu senaryo
-- için var). Hedef sahibine bilgi veriliyor (aksiyon gerektirmeyen bir
-- bilgilendirme, spam olmaması için yalnızca gerçekten pending olan
-- talepler için tetikleniyor).
create or replace function public.handle_prompt_soft_delete_cancels_merges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    for v_req in
      select * from public.merge_requests
      where source_prompt_id = new.id and status = 'pending'
    loop
      update public.merge_requests
        set status = 'cancelled', decided_at = now()
        where id = v_req.id;

      insert into public.notifications (recipient_id, actor_id, type, message, target_href)
      values (
        v_req.target_owner_id, new.author_id, 'merge_request_cancelled',
        'Beklediğin bir merge talebinin kaynağı artık mevcut değil.',
        '/prompts/local?id=' || v_req.target_prompt_id
      );

      insert into public.audit_log (actor_id, entity_type, entity_id, action, previous_state, new_state)
      values (new.author_id, 'merge_request', v_req.id, 'cancelled',
        jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled', 'reason', 'source_deleted'));
    end loop;
  end if;
  return new;
end;
$$;

create trigger prompts_after_update_cancel_pending_merges
  after update on public.prompts
  for each row
  when (new.deleted_at is distinct from old.deleted_at)
  execute function public.handle_prompt_soft_delete_cancels_merges();

-- === audit_log ================================================================
-- Şartname §16/§21'in "audit/history kaydı" isteği — bu projede daha önce
-- genel amaçlı bir audit tablosu yoktu (yalnızca `reports`/`blocks` gibi
-- konuya özel tablolar vardı, Bölüm 18); merge sistemi için minimal, salt-
-- okunur (istemciden hiç yazılamayan, yalnızca yukarıdaki SECURITY
-- DEFINER fonksiyonların yazdığı) bir tablo eklendi. Genel bir moderasyon
-- audit sistemi kurmak (her tabloyu kapsayan) bu görevin kapsamı dışında
-- bırakıldı — yalnızca merge_request eylemleri kaydediliyor.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

-- Yalnızca ilgili taraflar (talebi oluşturan/hedef sahibi) kendi merge
-- talepleriyle ilgili geçmişi görebilir — genel, herkese açık bir
-- moderasyon paneli değil.
create policy "Participants can view their own merge request audit history"
  on public.audit_log for select
  using (
    entity_type = 'merge_request'
    and exists (
      select 1 from public.merge_requests mr
      where mr.id = audit_log.entity_id
        and (mr.requester_id = auth.uid() or mr.target_owner_id = auth.uid())
    )
  );

-- === fetch_remix_graph ========================================================
-- Remix Dallanma Haritasının veri kaynağı — tüm ağacı (kökten aşağı,
-- HERHANGİ bir derinlikte) TEK bir sorguda getiriyor; `fetchRemixChain`'in
-- yaptığı gibi düğüm başına bir istemci-tarafı fetch YOK (şartname §3'ün
-- "performanslı çizim... gereksiz sorgu yığmama" gereksinimi). `security
-- invoker` (varsayılan) — RLS, çağıran kullanıcının bağlamında HER SATIRA
-- normal şekilde uygulanıyor (bir başkasının draft'ı asla sızmıyor); ekstra
-- güvenlik katmanına gerek yok çünkü zaten `public.prompts`'un kendi
-- politikasından geçiyor. `status = 'published'` filtresi RLS'in ÜZERİNE
-- ikinci bir güvenlik ağı — taslaklar haritada hiç görünmüyor (silinmiş
-- ama bir zamanlar yayınlanmış promptlar `deleted_at` dolu olsa bile
-- `status` hâlâ 'published' kaldığından — Bölüm 9.7 — burada GÖRÜNMEYE
-- devam ediyor, tam olarak "silinmiş kaynak düğümü" göstermek için gerekli).
create or replace function public.fetch_remix_graph(p_root_id uuid)
returns table (
  id uuid, title text, author_id uuid, origin_type text,
  source_prompt_id uuid, root_prompt_id uuid, deleted_at timestamptz,
  remix_count int, created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with recursive tree as (
    select p.id, p.title, p.author_id, p.origin_type, p.source_prompt_id, p.root_prompt_id,
           p.deleted_at, p.status, p.remix_count, p.created_at
    from public.prompts p
    where p.id = p_root_id
    union all
    select c.id, c.title, c.author_id, c.origin_type, c.source_prompt_id, c.root_prompt_id,
           c.deleted_at, c.status, c.remix_count, c.created_at
    from public.prompts c
    join tree t on c.source_prompt_id = t.id
  )
  select tree.id, tree.title, tree.author_id, tree.origin_type, tree.source_prompt_id,
         tree.root_prompt_id, tree.deleted_at, tree.remix_count, tree.created_at
  from tree
  where tree.status = 'published';
$$;

revoke all on function public.fetch_remix_graph(uuid) from public;
grant execute on function public.fetch_remix_graph(uuid) to authenticated, anon;

-- === Gerçek zamanlı senkronizasyon ===========================================
-- Harita ve merge talebi listesinin, sayfa yenilenmeden güncellenebilmesi
-- için (şartname §15) — Bölüm 21 Faz C/9.10'un `messages`/
-- `message_reactions` için zaten kurduğu AYNI mekanizma.
alter publication supabase_realtime add table public.merge_requests;
alter publication supabase_realtime add table public.prompt_versions;
