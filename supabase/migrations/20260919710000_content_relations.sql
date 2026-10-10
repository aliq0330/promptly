-- Promptly — İlişki Haritası (Relationship Map)
--
-- İki ayrı, bilinçli olarak küçük parça:
--
--  1) MANUEL ilişkiler → yeni `content_relations` tablosu. Haritadaki diğer her
--     ilişki (workflow adımları, generator→prompt, istek→sonuç, kabul edilmiş
--     öneri) mevcut tablolardan OKUNARAK türetilir ve buraya KOPYALANMAZ.
--     DNA benzerliği ise hiçbir yerde "onaylı kayıt" olarak saklanmaz; her
--     seferinde mevcut DNA bölümlerinden önerilir.
--
--  2) DNA benzerliği için ÖN HESAPLAMA: `prompt_dna_sections.tokens` (katlanmış
--     anahtar sözcükler, trigger'la tutulur) + GIN indeksi + `dna_similar_
--     candidates()`. Böylece her istekte tüm promptlar taranıp karşılaştırılmaz;
--     yalnızca ortak sözcüğü olan küçük bir aday kümesi dönüp istemcide
--     puanlanır. Algılama/AI/dış servis yok.

-- === 1) DNA token ön hesaplaması =============================================

-- Türkçe karakterleri ASCII'ye indirip küçük harfe çevirir (src/lib/prompt-dna/
-- text.ts `foldText` ile aynı fikir; yalnızca ADAY çağırmak için, kesin
-- puanlama istemcide yapılır).
create or replace function public.fold_tr(p text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(coalesce(p, ''),
    'İIıÇçĞğÖöŞşÜüÂâÎîÛû',
    'iiiccggoossuuaaiiuu'))
$$;

create or replace function public.dna_tokens(p text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from regexp_split_to_table(public.fold_tr(p), '[^[:alnum:]]+') as t
  where char_length(t) >= 3
    and t <> all (array['and','the','bir','ile','for','with','from','this','that','icin','ama','veya','olan','gibi','daha','cok'])
$$;

alter table public.prompt_dna_sections add column if not exists tokens text[] not null default '{}'::text[];

create or replace function public.set_dna_tokens()
returns trigger
language plpgsql
as $$
begin
  new.tokens := public.dna_tokens(new.content);
  return new;
end;
$$;

drop trigger if exists prompt_dna_sections_set_tokens on public.prompt_dna_sections;
create trigger prompt_dna_sections_set_tokens
  before insert or update of content on public.prompt_dna_sections
  for each row
  execute function public.set_dna_tokens();

-- Mevcut satırlar için geri doldurma (idempotent).
update public.prompt_dna_sections set tokens = public.dna_tokens(content) where tokens = '{}'::text[];

create index if not exists prompt_dna_sections_tokens_idx on public.prompt_dna_sections using gin (tokens);

-- Aday çağırma: aynı TÜRDE ortak sözcüğü olan, görülebilir (RLS + yayında +
-- herkese açık) başka promptlar, ortak bölüm sayısına göre. `security invoker`
-- olduğundan `prompts`/`prompt_dna_sections` RLS'i çağıran için geçerlidir.
-- p_sections: [{ "type": "lighting", "tokens": ["neon","isik"] }, …]
create or replace function public.dna_similar_candidates(p_exclude uuid, p_sections jsonb, p_limit integer default 40)
returns table (prompt_id uuid, hits integer)
language sql
stable
security invoker
set search_path = public
as $$
  select s.prompt_id, count(*)::integer as hits
  from public.prompt_dna_sections s
  join jsonb_to_recordset(
         case when jsonb_typeof(p_sections) = 'array' and jsonb_array_length(p_sections) <= 30 then p_sections else '[]'::jsonb end
       ) as m(type text, tokens text[])
    on m.type = s.type and s.tokens && m.tokens
  join public.prompts p on p.id = s.prompt_id
  where s.prompt_id <> p_exclude
    and p.status = 'published'
    and p.visibility = 'public'
    and p.deleted_at is null
  group by s.prompt_id
  order by hits desc, s.prompt_id
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

revoke all on function public.dna_similar_candidates(uuid, jsonb, integer) from public;
grant execute on function public.dna_similar_candidates(uuid, jsonb, integer) to anon, authenticated;

-- === 2) Manuel ilişkiler ======================================================

create table public.content_relations (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('prompt', 'generator', 'workflow', 'request')),
  source_id uuid not null,
  target_type text not null check (target_type in ('prompt', 'generator', 'workflow', 'request')),
  target_id uuid not null,
  -- Yalnızca elle kurulabilen türler. `dna_similar`, `workflow_step`, `uses_generator`,
  -- `request_result`, `accepted_suggestion` türetilir, asla burada saklanmaz.
  --   similar / alternative → yönsüz   ·   inspired_by → yönlü (source, target'tan esinlendi)
  relation_type text not null check (relation_type in ('similar', 'alternative', 'inspired_by')),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint content_relations_no_self check (not (source_type = target_type and source_id = target_id))
);

create index content_relations_source_idx on public.content_relations (source_type, source_id);
create index content_relations_target_idx on public.content_relations (target_type, target_id);
create index content_relations_creator_idx on public.content_relations (created_by);

-- Yinelenen ilişki: yönsüz türlerde A–B ile B–A aynı sayılır, yönlüde yön önemli.
create unique index content_relations_undirected_uniq on public.content_relations (
  relation_type,
  least(source_type || ':' || source_id::text, target_type || ':' || target_id::text),
  greatest(source_type || ':' || source_id::text, target_type || ':' || target_id::text)
) where relation_type in ('similar', 'alternative');

create unique index content_relations_directed_uniq on public.content_relations (
  relation_type, source_type, source_id, target_type, target_id
) where relation_type = 'inspired_by';

-- İçerik görünürlüğü / sahipliği — `security invoker`: çağıranın kendi RLS'i
-- geçerli, yani özel içerik başkası için "görünmez".
create or replace function public.content_is_visible(p_type text, p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.deleted_at is null and x.status = 'published')
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.deleted_at is null and not x.is_draft)
    when 'generator' then exists (select 1 from public.generators x where x.id = p_id and x.status = 'published')
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.status = 'published')
    else false
  end
$$;

create or replace function public.content_is_mine(p_type text, p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.author_id = auth.uid())
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.author_id = auth.uid())
    when 'generator' then exists (select 1 from public.generators x where x.id = p_id and x.creator_id = auth.uid())
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.creator_id = auth.uid())
    else false
  end
$$;

grant execute on function public.content_is_visible(text, uuid) to anon, authenticated;
grant execute on function public.content_is_mine(text, uuid) to anon, authenticated;

alter table public.content_relations enable row level security;

-- Okuma: iki uç da çağıran için görülebiliyorsa.
create policy "Relations are readable when both ends are visible"
  on public.content_relations for select
  using (
    public.content_is_visible(source_type, source_id)
    and public.content_is_visible(target_type, target_id)
  );

-- Ekleme: yalnızca KENDİ içeriğinden (source) başka, görebildiği bir içeriğe.
create policy "Owners create relations from their own content"
  on public.content_relations for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.content_is_mine(source_type, source_id)
    and public.content_is_visible(source_type, source_id)
    and public.content_is_visible(target_type, target_id)
  );

-- Silme: ilişkiyi kuran VEYA iki uçtan birinin sahibi.
create policy "Creators and endpoint owners can remove relations"
  on public.content_relations for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.content_is_mine(source_type, source_id)
    or public.content_is_mine(target_type, target_id)
  );

-- Kaynak başına makul bir üst sınır (spam / aşırı büyük harita).
create or replace function public.limit_content_relations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.content_relations
        where source_type = new.source_type and source_id = new.source_id) >= 40 then
    raise exception 'Bu içerik için en fazla 40 elle ilişki kurulabilir.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger content_relations_limit
  before insert on public.content_relations
  for each row
  execute function public.limit_content_relations();

-- İçerik silinince ona işaret eden ilişkiler de gider (polimorfik uç → FK yok).
-- `security definer`: silinen satır artık yokken sahiplik RLS'i geçmezdi.
create or replace function public.cleanup_content_relations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := tg_argv[0];
begin
  delete from public.content_relations
  where (source_type = v_type and source_id = old.id)
     or (target_type = v_type and target_id = old.id);
  return old;
end;
$$;

create trigger prompts_cleanup_relations after delete on public.prompts
  for each row execute function public.cleanup_content_relations('prompt');
create trigger generators_cleanup_relations after delete on public.generators
  for each row execute function public.cleanup_content_relations('generator');
create trigger workflows_cleanup_relations after delete on public.workflows
  for each row execute function public.cleanup_content_relations('workflow');
create trigger prompt_requests_cleanup_relations after delete on public.prompt_requests
  for each row execute function public.cleanup_content_relations('request');
