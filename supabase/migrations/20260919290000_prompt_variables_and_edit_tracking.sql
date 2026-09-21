-- Promptly — Prompt değişken sistemi + düzenleme geçmişi/bildirimi.
--
-- === Aşama 1 denetimi (bu migration'ı yazmadan önce yapıldı) ===============
-- Dört "gönderi türü"nün gerçek karşılığı: Prompt/Remix/İstek Yanıtı üçü de
-- aynı `public.prompts` satırı (`origin_type` ile ayrışıyor — Bölüm 18),
-- Prompt İsteği ise ayrı `public.prompt_requests` tablosu. Değişken sistemi
-- yalnızca `prompts.prompt_text` alanına bağlanıyor (istekte ayrı bir "prompt
-- metni" alanı hiç yok, yalnızca `description`) — bu bilinçli bir kapsam
-- kararı, CLAUDE.md'nin "gerçek yapıda olmayanı varmış gibi kabul etme"
-- kuralına uyuyor.
--
-- KRİTİK BULGU: bu uygulamada hiçbir "prompt düzenleme" özelliği YOKTU
-- (`src/types/index.ts`'in kendi yorumu: "this app has no 'edit prompt'
-- feature at all"), ve RLS (Bölüm 19) `prompts`/`prompt_requests` UPDATE'ini
-- yalnızca `author_id = auth.uid()` ile sınırlıyor — yani "başka bir yetkili
-- kullanıcı düzenledi" senaryosu bu mimaride YAPISAL OLARAK MÜMKÜN DEĞİL
-- (ortak düzenleme/moderatör sistemi hiç yok, Bölüm 22 henüz başlamadı).
-- Görev talimatı açıkça "ortak düzenleme sistemi yoksa sırf bildirim için
-- herkese açık düzenleme yetkisi uydurma" diyor — bu yüzden burada YENİ bir
-- "herkes düzenleyebilir" yetkisi İCAT EDİLMEDİ. Bunun yerine: (1) gerçek bir
-- "kendi içeriğini düzenleme" akışı ilk kez kuruluyor (bu görevin kendi
-- gereksinimi), (2) düzenleme kaydı + bildirim üretimi genel/doğru şekilde
-- `editor_id <> owner_id` koşuluna bağlanıyor — bugünkü tek-sahip modelinde
-- bu koşul kendi kendini düzenlemede hiç sağlanamaz (doğru davranış: kendine
-- bildirim gitmemeli), ama altyapı gerçek ve ileride bir ortak-düzenleme
-- özelliği eklenirse hiçbir değişiklik gerekmeden doğru çalışır.
--
-- Meaningful-edit tespiti İSTEMCİYE GÜVENMİYOR: aşağıdaki trigger'lar OLD/NEW
-- değerlerini veritabanı seviyesinde karşılaştırıyor, yalnızca gerçekten
-- değişen metin alanları varsa (title/description/prompt_text/tool veya
-- request eşdeğerleri) bir düzenleme kaydı/bildirim üretiyor — beğeni/yorum/
-- remix sayaçlarının veya `status`/`response_count`/`selected_response_
-- prompt_id`'nin güncellenmesi (ki bunlar da aynı satırda ayrı UPDATE'lerle
-- oluşuyor) asla "prompt düzenlendi" saydırmıyor.

-- === prompt_variables =======================================================
-- Yalnızca `prompt_variables` — `prompt_requests` için ayrı bir değişken
-- tablosu YOK (yukarıdaki kapsam kararı). `{isim}` token söz dizimini asla
-- bozmasın diye isimde süslü parantez/boşluk YASAK (Türkçe harfler serbest —
-- örnek şartnamedeki "ışık_stili" gibi isimler çalışsın diye ASCII'ye
-- kısıtlanmadı); istemci tarafı ayrıca boşlukları alt çizgiye çeviriyor.
create table public.prompt_variables (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name !~ '[{}[:space:]]'),
  default_value text not null default '',
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, name)
);

create trigger prompt_variables_set_updated_at
  before update on public.prompt_variables
  for each row
  execute function public.set_updated_at();

alter table public.prompt_variables enable row level security;
create index prompt_variables_prompt_id_idx on public.prompt_variables (prompt_id);

-- RLS: prompt_media/prompt_tags ile BİREBİR AYNI desen (Bölüm 19).
create policy "Prompt variables are readable wherever their prompt is readable"
  on public.prompt_variables for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_variables.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy "Prompt authors manage their own prompt variables"
  on public.prompt_variables for all
  to authenticated
  using (
    exists (select 1 from public.prompts p where p.id = prompt_variables.prompt_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.prompts p where p.id = prompt_variables.prompt_id and p.author_id = auth.uid())
  );

-- === content_edits ==========================================================
-- Salt-okunur bir denetim/geçmiş kaydı — `merge_requests`'in `audit_log`'uyla
-- (Bölüm 9.14) aynı ilke: istemciden HİÇBİR şekilde yazılamaz, yalnızca
-- aşağıdaki trigger'lar tarafından dolduruluyor. `previous_values` yalnızca
-- GERÇEKTEN değişen alanların eski değerlerini tutuyor — tam önceki metni
-- herkese açık etmemek için okuma da yalnızca sahibine/düzenleyene açık.
create table public.content_edits (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('prompt', 'prompt_request')),
  content_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  editor_id uuid not null references public.profiles (id) on delete cascade,
  changed_fields text[] not null,
  previous_values jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.content_edits enable row level security;
create index content_edits_content_idx on public.content_edits (content_type, content_id, created_at desc);

create policy "Owners and editors can read their own edit history"
  on public.content_edits for select
  using (auth.uid() = owner_id or auth.uid() = editor_id);

-- === notifications.type — iki yeni değer ====================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'remix', 'request_response',
    'message', 'message_request', 'system',
    'merge_request_received', 'merge_request_accepted', 'merge_request_rejected',
    'merge_request_withdrawn', 'merge_request_cancelled',
    'prompt_edited', 'request_edited'
  ));

-- === Prompt düzenleme takibi =================================================
create or replace function public.record_prompt_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.prompt_text is distinct from new.prompt_text then
    v_changed := array_append(v_changed, 'prompt_text');
    v_previous := v_previous || jsonb_build_object('prompt_text', old.prompt_text);
  end if;
  if old.tool is distinct from new.tool then
    v_changed := array_append(v_changed, 'tool');
    v_previous := v_previous || jsonb_build_object('tool', old.tool);
  end if;

  -- Yalnızca beğeni/yorum/remix sayaçları, status, show_on_profile gibi
  -- ilgisiz kolonlar değiştiyse (ör. bir beğeni bu satırın UPDATE'ini
  -- tetiklediyse) burada hiçbir şey üretilmiyor — "sadece kaydet butonuna
  -- basılmış olması yetmemeli" kuralı istemciye değil, buraya bağlı.
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;

  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('prompt', new.id, new.author_id, v_editor, v_changed, v_previous);

  -- Sahip kendi içeriğini düzenlediğinde (bugün RLS altında TEK mümkün
  -- durum) kendine bildirim ÜRETİLMİYOR — bkz. dosya başındaki not.
  if v_editor <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.author_id, v_editor, 'prompt_edited',
      'Promptunu düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/prompts/local?id=' || new.id || '&hl=post:' || new.id
    );
  end if;

  return new;
end;
$$;

create trigger prompts_record_edit
  after update on public.prompts
  for each row
  execute function public.record_prompt_edit();

-- === İstek düzenleme takibi ==================================================
create or replace function public.record_request_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.creative_direction is distinct from new.creative_direction then
    v_changed := array_append(v_changed, 'creative_direction');
    v_previous := v_previous || jsonb_build_object('creative_direction', old.creative_direction);
  end if;
  if old.preferred_tool is distinct from new.preferred_tool then
    v_changed := array_append(v_changed, 'preferred_tool');
    v_previous := v_previous || jsonb_build_object('preferred_tool', old.preferred_tool);
  end if;

  -- status/response_count/selected_response_prompt_id/closed_by_owner
  -- değişiklikleri (istek yönetim aksiyonları — Bölüm 9.2) bilinçli olarak
  -- BURAYA dahil değil: bunlar zaten kendi bildirimlerine sahip
  -- (notify_selected_response/notify_request_closed) ve "prompt içeriği
  -- düzenlemesi" değil.
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;

  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('prompt_request', new.id, new.author_id, v_editor, v_changed, v_previous);

  if v_editor <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.author_id, v_editor, 'request_edited',
      'Prompt isteğini düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/requests/local?id=' || new.id || '&hl=request:' || new.id
    );
  end if;

  return new;
end;
$$;

create trigger prompt_requests_record_edit
  after update on public.prompt_requests
  for each row
  execute function public.record_request_edit();
