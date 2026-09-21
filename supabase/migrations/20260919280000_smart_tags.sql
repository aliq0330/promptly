-- Gelişmiş, akıllı ve canlı etiket sistemi (CLAUDE.md Bölüm 9.23) — mevcut
-- `tags`/`prompt_tags`/`prompt_request_tags` tabloları (bkz.
-- 20260919120200_prompts_and_requests.sql) genişletiliyor, ikinci/paralel
-- bir etiket altyapısı KURULMUYOR. `tags` daha önce yalnızca curated,
-- kullanıcı tarafından hiç oluşturulamayan sabit bir katalogdu (yalnızca bir
-- SELECT RLS politikası vardı, hiç INSERT politikası yoktu) — bu migration
-- kullanıcı tarafından güvenli, doğrulanmış, tekilleştirilmiş şekilde gerçek
-- yeni etiket oluşturmayı (`get_or_create_tag` RPC'si üzerinden, doğrudan
-- INSERT izni asla verilmeden) ve gerçek kullanım istatistiklerini
-- (denormalize sayaçlar, `like_count`/`item_count` ile aynı desen) ekliyor.

-- === tags: kimlik/istatistik/köken alanları =================================

alter table public.tags
  add column created_at timestamptz not null default now(),
  add column created_by uuid references public.profiles (id) on delete set null,
  -- Bu migration'dan önce var olan 20 satır (seed katalog) sistem etiketi —
  -- aşağıdaki backfill bunları true işaretliyor. Bundan sonra
  -- get_or_create_tag ile oluşturulan HER satır is_system=false.
  add column is_system boolean not null default false,
  add column prompt_usage_count integer not null default 0 check (prompt_usage_count >= 0),
  add column request_usage_count integer not null default 0 check (request_usage_count >= 0);

alter table public.tags
  add column usage_count integer generated always as (prompt_usage_count + request_usage_count) stored;

-- Bu migration'dan önce var olan her satır (seed katalogdaki 20 etiket)
-- gerçek bir sistem etiketidir — geriye dönük olarak işaretleniyor.
update public.tags set is_system = true where is_system = false;

create index tags_usage_count_idx on public.tags (usage_count desc);
create index tags_created_at_idx on public.tags (created_at desc);
create index tags_label_lower_idx on public.tags (lower(label));

-- === prompt_tags / prompt_request_tags: kaynak izleme =======================

-- "Bu etiket bu içeriğe otomatik mi yoksa elle mi eklendi" — CLAUDE.md §8/§18
-- (canlı analiz asla mevcut etiketleri sıfırlamamalı, kaynağı izlenmeli).
-- İzin/RLS değişmiyor — sahiplik zaten var olan "for all" politikalarıyla
-- (author_id = auth.uid()) korunuyor, bu yalnızca ek bir sütun.
alter table public.prompt_tags
  add column source text not null default 'manual' check (source in ('manual', 'automatic'));

alter table public.prompt_request_tags
  add column source text not null default 'manual' check (source in ('manual', 'automatic'));

-- === normalize_tag_name: sunucu tarafı normalizasyon =========================

-- Frontend'in `normalizeTagLabel()` (src/lib/tag-normalize.ts) fonksiyonuyla
-- BİREBİR AYNI kuralları uygulamalı (CLAUDE.md §10: "frontend ve backend
-- aynı normalizasyon kurallarını kullanmalı") — kırp, Türkçe karakterleri
-- ASCII'ye çevir (ç/ğ/ı/ö/ş/ü — anlamlarını asla karıştırmadan, yalnızca
-- karşılaştırma/slug amacıyla), küçük harfe çevir, harf/rakam olmayan her
-- diziyi tek bir tireye indirger, baştaki/sondaki tireleri kırp.
create or replace function public.normalize_tag_name(p_label text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          trim(p_label),
          'çÇğĞıİöÖşŞüÜ',
          'cCgGiIoOsSuU'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- === get_or_create_tag: tek, doğrulanmış, tekilleştirilmiş yazma yolu =======

-- `tags` tablosunun hâlâ hiç doğrudan INSERT/UPDATE/DELETE RLS politikası
-- YOK (aşağıda da eklenmiyor) — kullanıcı tarafından yeni bir etiket
-- oluşturmanın TEK yolu bu, SECURITY DEFINER fonksiyon. Normalize edilmiş
-- slug üzerinde `on conflict do nothing` ile idempotent (Bölüm 9.22'nin
-- `ensure_default_collection`'ıyla birebir aynı "bul ya da oluştur" deseni)
-- — eşzamanlı iki kullanıcı "aynı" etiketi oluşturmaya çalışsa bile tekil
-- `slug` PK'sı sayesinde tam olarak bir satır kalır.
create or replace function public.get_or_create_tag(p_label text)
returns public.tags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := trim(p_label);
  v_slug text;
  v_row public.tags;
begin
  if auth.uid() is null then
    raise exception 'Etiket oluşturmak için giriş yapmalısın.';
  end if;

  if v_label = '' or char_length(v_label) > 60 then
    raise exception 'Etiket adı 1-60 karakter arasında olmalı.';
  end if;

  -- Kontrol karakterleri / HTML'e benzer içerik reddedilir (basit bir
  -- güvenlik/spam kontrolü — CLAUDE.md §24).
  if v_label ~ '[<>]' or v_label ~ '[[:cntrl:]]' then
    raise exception 'Etiket adı geçersiz karakterler içeriyor.';
  end if;

  v_slug := public.normalize_tag_name(v_label);
  if v_slug = '' then
    raise exception 'Etiket adı geçerli bir etikete dönüştürülemedi.';
  end if;

  insert into public.tags (slug, label, created_by, is_system)
  values (v_slug, v_label, auth.uid(), false)
  on conflict (slug) do nothing;

  select * into v_row from public.tags where slug = v_slug;
  return v_row;
end;
$$;

revoke all on function public.get_or_create_tag(text) from public;
grant execute on function public.get_or_create_tag(text) to authenticated;

-- === kullanım sayaçları: gerçek, tetikleyiciyle güncellenen istatistikler ===

-- `like_count`/`comment_count`/`collections.item_count` ile aynı desen —
-- yalnızca YAYINLANMIŞ bir prompta eklenen bir etiket sayılır (bugün her
-- prompt oluşturulduğu anda zaten her zaman 'published' oluyor — bkz.
-- create-prompt-form.tsx'in hiç taslak akışı sunmaması — bu yüzden bu kontrol
-- bugün pratikte hiçbir zaman farklı davranmıyor, ama bir taslak akışı
-- ileride eklenirse bir taslağın etiketinin genel popülerlik sayısını
-- şişirmesini baştan engelliyor, CLAUDE.md §17/§24'ün "yalnızca erişilebilir/
-- geçerli içerikten say" kuralı).
create or replace function public.handle_prompt_tag_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.prompts p where p.id = new.prompt_id and p.status = 'published') then
      update public.tags set prompt_usage_count = prompt_usage_count + 1 where slug = new.tag_slug;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.tags set prompt_usage_count = greatest(prompt_usage_count - 1, 0) where slug = old.tag_slug;
    return old;
  end if;
  return null;
end;
$$;

create trigger prompt_tags_usage_count
  after insert or delete on public.prompt_tags
  for each row
  execute function public.handle_prompt_tag_change();

-- Requests'in taslak/draft kavramı hiç yok (Bölüm 9.9'un dokümante ettiği
-- gibi her istek her zaman herkese açık) — bu yüzden burada bir status
-- kontrolüne gerek yok, her ekleme sayılır.
create or replace function public.handle_request_tag_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.tags set request_usage_count = request_usage_count + 1 where slug = new.tag_slug;
    return new;
  elsif tg_op = 'DELETE' then
    update public.tags set request_usage_count = greatest(request_usage_count - 1, 0) where slug = old.tag_slug;
    return old;
  end if;
  return null;
end;
$$;

create trigger prompt_request_tags_usage_count
  after insert or delete on public.prompt_request_tags
  for each row
  execute function public.handle_request_tag_change();

-- Mevcut tüm satırları geriye dönük olarak say (bu migration'dan önce
-- oluşturulmuş etiketler için sayaçları sıfırdan doğru değere getirir —
-- yukarıdaki trigger'lar yalnızca BUNDAN SONRAKİ değişiklikleri yakalar).
update public.tags t set prompt_usage_count = coalesce((
  select count(*) from public.prompt_tags pt
  join public.prompts p on p.id = pt.prompt_id
  where pt.tag_slug = t.slug and p.status = 'published'
), 0);

update public.tags t set request_usage_count = coalesce((
  select count(*) from public.prompt_request_tags rt
  where rt.tag_slug = t.slug
), 0);

-- === trending_tags: gerçek, zaman-pencereli kullanım artışı =================

-- CLAUDE.md §14: "yükselen etiketler yalnızca gerçek zaman-pencereli
-- veriden hesaplanmalı, yeterli gerçek veri yoksa sahte bir trend yüzdesi
-- UYDURULMAMALI." Bu fonksiyon yalnızca GERÇEK sayıları (son p_window_days
-- içindeki kullanım vs. ondan önceki eşit uzunluktaki pencere) döndürür —
-- yorumlama/yüzdeleme istemciye bırakılıyor, ve istemci hiçbir gerçek sinyal
-- yoksa (recent_count = 0 olan hiçbir satır dönmüyor zaten) bölümü hiç
-- göstermiyor. `security invoker` — yalnızca zaten herkese açık olan
-- (status='published' prompt, her zaman açık request) satırları görüyor,
-- ekstra bir yetki genişletmesi yok.
create or replace function public.trending_tags(p_limit integer default 12, p_window_days integer default 7)
returns table (
  slug text,
  label text,
  recent_count bigint,
  previous_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent_prompt as (
    select pt.tag_slug, count(*) as c
    from public.prompt_tags pt
    join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published' and p.created_at >= now() - make_interval(days => p_window_days)
    group by pt.tag_slug
  ),
  previous_prompt as (
    select pt.tag_slug, count(*) as c
    from public.prompt_tags pt
    join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published'
      and p.created_at >= now() - make_interval(days => p_window_days * 2)
      and p.created_at < now() - make_interval(days => p_window_days)
    group by pt.tag_slug
  ),
  recent_request as (
    select rt.tag_slug, count(*) as c
    from public.prompt_request_tags rt
    join public.prompt_requests r on r.id = rt.request_id
    where r.created_at >= now() - make_interval(days => p_window_days)
    group by rt.tag_slug
  ),
  previous_request as (
    select rt.tag_slug, count(*) as c
    from public.prompt_request_tags rt
    join public.prompt_requests r on r.id = rt.request_id
    where r.created_at >= now() - make_interval(days => p_window_days * 2)
      and r.created_at < now() - make_interval(days => p_window_days)
    group by rt.tag_slug
  ),
  combined as (
    select
      t.slug,
      t.label,
      coalesce((select c from recent_prompt where recent_prompt.tag_slug = t.slug), 0)
        + coalesce((select c from recent_request where recent_request.tag_slug = t.slug), 0) as recent_count,
      coalesce((select c from previous_prompt where previous_prompt.tag_slug = t.slug), 0)
        + coalesce((select c from previous_request where previous_request.tag_slug = t.slug), 0) as previous_count
    from public.tags t
  )
  select slug, label, recent_count, previous_count
  from combined
  where recent_count > 0
  order by (recent_count - previous_count) desc, recent_count desc, label asc
  limit p_limit;
$$;

grant execute on function public.trending_tags(integer, integer) to anon, authenticated;
