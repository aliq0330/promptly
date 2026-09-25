-- Promptly — Prompt Düzenleme Önerisi + Sürüm Geçmişi.
--
-- === AŞAMA 0 denetimi (bu migration'ı yazmadan önce yapıldı) ================
-- Görevin kendi §1/§14 kuralı gereği bu ASLA bir remix/fork sistemi değil —
-- öneri sahibi kendi promptunu/kopyasını hiç oluşturmuyor, yalnızca hedef
-- promptun GERÇEK sahibine bir metin öner sunuyor; kabul edilirse AYNI
-- `prompts` satırı güncelleniyor (yeni bir satır/ağaç asla oluşmuyor).
--
-- Var olan ilgili sistemler incelendi:
--   - `content_edits` (20260919290000) — yalnızca hangi ALANLARIN
--     değiştiğini (title/description/prompt_text/tool) ve OLD değerlerini
--     tutan, sahibine/düzenleyene özel bir DENETİM kaydı. §8'in istediği
--     "her sürümün ayrı, karşılaştırılabilir, herkese açık bir snapshot'ı"
--     gereksinimini KARŞILAMIYOR (ne "v1/v2" numarası var ne herkese açık
--     okunabilir) — bu yüzden burada dokunulmadan bırakıldı, paralel bir
--     ikinci "denetim" sistemi kurulmadı, yalnızca EKSİK OLAN gerçek
--     kapasite (`prompt_versions`, tam snapshot + herkese açık) eklendi.
--   - `record_prompt_edit()` trigger'ı (aynı migration) — HİÇ değiştirilmedi,
--     kendi amacı (content_edits + prompt_edited bildirimi) için olduğu
--     gibi çalışmaya devam ediyor; bu görev AYRI bir AFTER UPDATE trigger
--     (`record_prompt_version`) ekliyor, ikisi de aynı UPDATE'te bağımsız
--     çalışır, birbirine hiç bakmaz.
--   - Eski `prompt_versions`/`merge_requests` (20260919250000) — Bölüm
--     9.39'da kullanıcının kendi talebiyle TAMAMEN kaldırıldı (remix'e bağlı
--     olduğu için). Buradaki YENİ `prompt_versions` o eski tabloyla AYNI
--     ADI taşıyor ama tamamen bağımsız, daha küçük bir şema — remix/merge
--     kavramına hiç referans vermiyor, yalnızca "bu promptun kendi
--     zamanındaki gerçek içerik geçmişi".
--   - `notifications` sistemi (Bölüm 19/9.6/9.12) — yeniden kullanılıyor,
--     yeni bir bildirim mimarisi kurulmadı; yalnızca 3 yeni `type` değeri.
--   - RLS (Bölüm 19: "Authors can update their own prompts") — bir öneriyi
--     KABUL ETMEK dahi normal bir client UPDATE ile YAPILAMIYOR (öneri
--     sahibinin promptu hiçbir zaman doğrudan değiştirememesi + "prompt
--     sahibi olmayan kullanıcı promptu doğrudan değiştiremez" kuralı, §11/
--     §15) — bu yüzden kabul/red yalnızca iki `SECURITY DEFINER` RPC
--     üzerinden, atomik olarak yapılıyor (bu projenin `select_prompt_
--     request_response`/`accept_merge_request` (eski) RPC'leriyle birebir
--     aynı, kanıtlanmış deseni).

-- === prompt_versions =========================================================
-- Bir promptun gerçek, tam içerik geçmişi — `content_edits`'in aksine HER
-- ZAMAN dört alanın (title/description/prompt_text/tool) TAM bir snapshot'ı,
-- herkese açık (promptun kendisi görülebiliyorsa) okunabilir. İstemciden
-- hiçbir INSERT/UPDATE/DELETE izni yok — yalnızca aşağıdaki trigger/RPC'ler
-- (`SECURITY DEFINER`) yazıyor.
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  prompt_text text not null,
  tool text,
  source text not null check (source in ('initial', 'owner_edit', 'edit_suggestion_accepted')),
  -- `prompt_edit_suggestions` henüz tanımlı değil (aşağıda) — döngüsel FK'yi
  -- önlemek için burada düz bir uuid, gerçek referans en altta ekleniyor.
  suggestion_id uuid,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (prompt_id, version_number)
);

alter table public.prompt_versions enable row level security;
create index prompt_versions_prompt_id_idx on public.prompt_versions (prompt_id, version_number desc);

create policy "Prompt versions are readable wherever their prompt is readable"
  on public.prompt_versions for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_versions.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

-- === prompt_edit_suggestions =================================================
-- §17'nin istediği alanların birebir karşılığı. `owner_id` istemciden asla
-- güvenilmiyor — aşağıdaki BEFORE INSERT trigger promptun GERÇEK
-- `author_id`'sinden dolduruyor, ne gönderilirse gönderilsin.
create table public.prompt_edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  suggestion_text text not null check (char_length(trim(suggestion_text)) between 1 and 2000),
  -- Kullanıcı isterse tam bir "önerilen yeni prompt metni" de yazabilir
  -- (§17/§18) — opsiyonel; boşsa öneri yalnızca bir metin notu olarak
  -- kalır, sahip kabul ederken kendi metnini yazar (bkz. aşağıdaki RPC).
  -- ASLA sistem tarafından otomatik/AI ile üretilmiyor (bu projede genel
  -- amaçlı bir metin-yeniden-yazma AI entegrasyonu yok — §18'in "AI
  -- entegrasyonu yokken varmış gibi davranma" kuralına uyularak icat
  -- edilmedi); yalnızca öneriyi gönderen kişinin kendi yazdığı, isteğe
  -- bağlı bir metin.
  proposed_prompt_text text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  accepted_version_id uuid references public.prompt_versions (id) on delete set null
);

alter table public.prompt_edit_suggestions enable row level security;
create index prompt_edit_suggestions_prompt_id_idx on public.prompt_edit_suggestions (prompt_id, created_at desc);
create index prompt_edit_suggestions_owner_idx on public.prompt_edit_suggestions (owner_id, status);
create index prompt_edit_suggestions_proposer_idx on public.prompt_edit_suggestions (proposer_id);

-- §16 — aynı kullanıcının aynı prompta ikinci bir BEKLEYEN öneri
-- göndermesini veritabanı seviyesinde imkânsız kılan gerçek garanti
-- (istemci tarafı ön-kontrol yalnızca dostane bir mesaj için, bkz.
-- src/lib/supabase/prompt-edit-suggestions.ts).
create unique index prompt_edit_suggestions_one_pending_per_pair
  on public.prompt_edit_suggestions (prompt_id, proposer_id)
  where status = 'pending';

alter table public.prompt_versions
  add constraint prompt_versions_suggestion_id_fkey
  foreign key (suggestion_id) references public.prompt_edit_suggestions (id) on delete set null;

-- RLS — §15: yalnızca gönderen VEYA sahip okuyabilir (bir başkasının
-- öneri kutusu kimseye açık değil); yazma yalnızca "kendi adına öneri
-- oluştur" ile sınırlı, kabul/red client'tan asla doğrudan UPDATE ile
-- yapılamıyor (aşağıdaki iki RPC dışında hiçbir UPDATE/DELETE politikası
-- yok).
create policy "Proposers and owners can read their own edit suggestions"
  on public.prompt_edit_suggestions for select
  using (auth.uid() = proposer_id or auth.uid() = owner_id);

create policy "Authenticated users can propose an edit for themselves"
  on public.prompt_edit_suggestions for insert
  to authenticated
  with check (auth.uid() = proposer_id);

-- BEFORE INSERT — gerçek yetkilendirme kapısı (§11/§15): `owner_id` istemciden
-- ne gelirse gelsin promptun GERÇEK yazarından dolduruluyor; hedef prompt
-- yayınlanmış değilse veya öneri sahibi kendi promptunaysa reddediliyor.
-- Yayınlanmış bir prompt zaten herkese açık okunabilir olduğundan (Bölüm 19)
-- `security invoker` (varsayılan) yeterli — ekstra bir yetki yükseltmeye
-- gerek yok.
create or replace function public.prompt_edit_suggestions_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_status text;
begin
  select author_id, status into v_owner_id, v_status
  from public.prompts where id = new.prompt_id;

  if v_owner_id is null then
    raise exception 'Prompt bulunamadı.';
  end if;
  if v_status <> 'published' then
    raise exception 'Bu prompt için düzenleme önerisi gönderilemez.';
  end if;
  if new.proposer_id <> auth.uid() then
    raise exception 'Yalnızca kendi adına öneri gönderebilirsin.';
  end if;
  if new.proposer_id = v_owner_id then
    raise exception 'Kendi promptuna düzenleme önerisi gönderemezsin.';
  end if;

  new.owner_id := v_owner_id;
  new.status := 'pending';
  new.resolved_at := null;
  new.accepted_version_id := null;
  return new;
end;
$$;

create trigger prompt_edit_suggestions_before_insert_trigger
  before insert on public.prompt_edit_suggestions
  for each row
  execute function public.prompt_edit_suggestions_before_insert();

-- === Bildirim: öneri sahibine gönderildi =====================================
create or replace function public.notify_edit_suggestion_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prompt_title text;
begin
  select title into v_prompt_title from public.prompts where id = new.prompt_id;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    new.owner_id, new.proposer_id, 'edit_suggestion_received',
    'Promptun için bir düzenleme önerdi: "' || public.truncate_preview(new.suggestion_text) || '"',
    '/prompts/local?id=' || new.prompt_id || '&hl=suggestion:' || new.id
  );
  return new;
end;
$$;

create trigger prompt_edit_suggestions_after_insert_notify
  after insert on public.prompt_edit_suggestions
  for each row
  execute function public.notify_edit_suggestion_received();

-- === Sürüm oluşturma — HEM sahibin kendi normal düzenlemesi (updateRealPrompt)
--     HEM aşağıdaki kabul RPC'sinin kendi UPDATE'i için TEK, paylaşılan trigger
--     (§13: "ayrı bir sistem kurma, varsa mevcut mekanizmayı kullan" — burada
--     ikisi için de aynı trigger kullanılarak bu tekrar önleniyor). Yalnızca
--     title/description/prompt_text/tool GERÇEKTEN değiştiğinde çalışır —
--     `record_prompt_edit`'in kendi guard'ıyla birebir aynı mantık, bu yüzden
--     bir beğeni/yorum sayacı güncellemesi asla yeni bir "sürüm" üretmez.
create or replace function public.record_prompt_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
  v_next_version integer;
  v_source text;
  v_suggestion_id uuid;
  v_editor uuid := auth.uid();
begin
  v_changed := (old.title is distinct from new.title)
    or (old.description is distinct from new.description)
    or (old.prompt_text is distinct from new.prompt_text)
    or (old.tool is distinct from new.tool);

  if not v_changed then
    return new;
  end if;

  -- Bu promptun İLK gerçek versiyon kaydı — bu trigger var olmadan önce
  -- geçmişte yapılmış hiçbir değişikliğin gerçek bir snapshot'ı yok
  -- (dürüstçe belirtilmesi gereken bir sınır); "v1" burada bu ÖZEL
  -- UPDATE'ten HEMEN ÖNCEKİ gerçek içerik olarak tanımlanıyor — uydurulmuş
  -- bir geçmiş değil, elde olan en doğru başlangıç noktası.
  if not exists (select 1 from public.prompt_versions where prompt_id = new.id) then
    insert into public.prompt_versions (prompt_id, version_number, title, description, prompt_text, tool, source, created_by, created_at)
    values (new.id, 1, old.title, old.description, old.prompt_text, old.tool, 'initial', new.author_id, old.created_at);
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.prompt_versions where prompt_id = new.id;

  -- `accept_prompt_edit_suggestion` bu iki oturum-yerel (transaction-local)
  -- ayarı kendi UPDATE'inden hemen önce yazıyor — istemcinin gönderdiği
  -- hiçbir alana güvenmeden, bu trigger'ın "bu değişiklik bir öneri kabulü
  -- mü yoksa düz bir sahip düzenlemesi mi" ayrımını güvenle yapmasını
  -- sağlıyor.
  v_source := coalesce(nullif(current_setting('promptly.version_source', true), ''), 'owner_edit');
  v_suggestion_id := nullif(current_setting('promptly.version_suggestion_id', true), '')::uuid;

  insert into public.prompt_versions (prompt_id, version_number, title, description, prompt_text, tool, source, suggestion_id, created_by, created_at)
  values (new.id, v_next_version, new.title, new.description, new.prompt_text, new.tool, v_source, v_suggestion_id, coalesce(v_editor, new.author_id), now());

  return new;
end;
$$;

create trigger prompts_record_version
  after update on public.prompts
  for each row
  execute function public.record_prompt_version();

-- === Kabul et — TEK atomik yol, §6/§11/§12 =====================================
-- Öneri sahibi ASLA promptu doğrudan değiştiremez; yalnızca bu RPC (yalnızca
-- gerçek sahip çağırabilir) prompt içeriğini gerçekten güncelliyor. Son
-- metin `p_final_prompt_text` — sahip, önerilen metni (varsa) olduğu gibi
-- kabul edebilir YA DA kendi düzenleyerek gönderebilir (§18: AI/öneri metni
-- asla körü körüne "bu artık promptun tamamı" sayılmıyor, sahip her zaman
-- son hâli görüp onaylıyor).
create or replace function public.accept_prompt_edit_suggestion(p_suggestion_id uuid, p_final_prompt_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion public.prompt_edit_suggestions;
  v_prompt_title text;
  v_final text := trim(coalesce(p_final_prompt_text, ''));
begin
  select * into v_suggestion from public.prompt_edit_suggestions where id = p_suggestion_id for update;
  if v_suggestion.id is null then
    raise exception 'Öneri bulunamadı.';
  end if;
  if v_suggestion.owner_id <> auth.uid() then
    raise exception 'Bu öneriyi yalnızca prompt sahibi kabul edebilir.';
  end if;
  if v_suggestion.status <> 'pending' then
    raise exception 'Bu öneri zaten karara bağlanmış.';
  end if;
  if char_length(v_final) = 0 then
    raise exception 'Prompt metni boş olamaz.';
  end if;

  perform set_config('promptly.version_source', 'edit_suggestion_accepted', true);
  perform set_config('promptly.version_suggestion_id', p_suggestion_id::text, true);

  update public.prompts set prompt_text = v_final where id = v_suggestion.prompt_id
  returning title into v_prompt_title;

  perform set_config('promptly.version_source', '', true);
  perform set_config('promptly.version_suggestion_id', '', true);

  update public.prompt_edit_suggestions
    set status = 'accepted',
        resolved_at = now(),
        accepted_version_id = (
          select id from public.prompt_versions
          where prompt_id = v_suggestion.prompt_id
          order by version_number desc
          limit 1
        )
    where id = p_suggestion_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_suggestion.proposer_id, auth.uid(), 'edit_suggestion_accepted',
    'Düzenleme önerini kabul etti: "' || public.truncate_preview(coalesce(v_prompt_title, '')) || '"',
    '/prompts/local?id=' || v_suggestion.prompt_id || '&hl=post:' || v_suggestion.prompt_id
  );
end;
$$;

revoke all on function public.accept_prompt_edit_suggestion(uuid, text) from public;
grant execute on function public.accept_prompt_edit_suggestion(uuid, text) to authenticated;

-- === Reddet — §10: prompt hiç değişmez, yalnızca durum güncellenir ===========
create or replace function public.reject_prompt_edit_suggestion(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion public.prompt_edit_suggestions;
  v_prompt_title text;
begin
  select * into v_suggestion from public.prompt_edit_suggestions where id = p_suggestion_id for update;
  if v_suggestion.id is null then
    raise exception 'Öneri bulunamadı.';
  end if;
  if v_suggestion.owner_id <> auth.uid() then
    raise exception 'Bu öneriyi yalnızca prompt sahibi reddedebilir.';
  end if;
  if v_suggestion.status <> 'pending' then
    raise exception 'Bu öneri zaten karara bağlanmış.';
  end if;

  update public.prompt_edit_suggestions
    set status = 'rejected', resolved_at = now()
    where id = p_suggestion_id;

  select title into v_prompt_title from public.prompts where id = v_suggestion.prompt_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_suggestion.proposer_id, auth.uid(), 'edit_suggestion_rejected',
    'Düzenleme önerini reddetti: "' || public.truncate_preview(coalesce(v_prompt_title, '')) || '"',
    '/prompts/local?id=' || v_suggestion.prompt_id
  );
end;
$$;

revoke all on function public.reject_prompt_edit_suggestion(uuid) from public;
grant execute on function public.reject_prompt_edit_suggestion(uuid) to authenticated;

-- === notifications.type — üç yeni değer ======================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'request_response',
    'message', 'message_request', 'system',
    'prompt_edited', 'request_edited', 'generator_edited',
    'edit_suggestion_received', 'edit_suggestion_accepted', 'edit_suggestion_rejected'
  ));
