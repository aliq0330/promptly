-- Haftalık tema ("Haftanın teması"): moderatörün belirlediği, etiket tabanlı topluluk teması.
--
-- Katılım = o etiketle paylaşılan içerik (ayrı bir "katılım" tablosu yok; mevcut etiket sistemi
-- kullanılır). Aktif tema `starts_at <= şimdi < ends_at` olan, arşivlenmemiş en yeni temadır;
-- ana sayfada ve Keşfet'te bir bant olarak görünür, "Katıl" oluşturma formunu etiketi seçili açar.
--
--   * `weekly_challenges`: herkes OKUR (RLS, yalnızca arşivlenmemişler); hiçbir yazma politikası
--     YOK — yazma yalnızca aşağıdaki moderatör RPC'leriyle olur (`_admin_guard()`).
--   * Silme yerine ARŞİVLEME (`archived`): geçmiş korunur; arşivlenen tema artık hiçbir yerde görünmez.
--   * Etiket, adıyla verilir ve `get_or_create_tag` ile mevcut etiket sistemine eklenir (aynı
--     normalizasyon ve doğrulama).
--   * İki dilli: her tema TR + EN başlık/açıklama taşır; arayüz kullanıcının diline göre seçer.

create table if not exists public.weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  title_tr text not null check (char_length(title_tr) between 1 and 80),
  title_en text not null check (char_length(title_en) between 1 and 80),
  description_tr text not null default '' check (char_length(description_tr) <= 300),
  description_en text not null default '' check (char_length(description_en) <= 300),
  tag_slug text not null references public.tags (slug) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint weekly_challenges_window check (ends_at > starts_at)
);

create index if not exists weekly_challenges_starts_at_idx on public.weekly_challenges (starts_at desc);
create index if not exists weekly_challenges_tag_slug_idx on public.weekly_challenges (tag_slug);

alter table public.weekly_challenges enable row level security;

create policy "Anyone can read live weekly challenges"
  on public.weekly_challenges for select
  using (not archived);

create or replace function public.admin_save_challenge(
  p_id uuid,
  p_title_tr text,
  p_title_en text,
  p_description_tr text,
  p_description_en text,
  p_tag_label text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title_tr text := btrim(coalesce(p_title_tr, ''));
  v_title_en text := btrim(coalesce(p_title_en, ''));
  v_desc_tr text := btrim(coalesce(p_description_tr, ''));
  v_desc_en text := btrim(coalesce(p_description_en, ''));
  v_tag public.tags;
  v_id uuid;
begin
  perform public._admin_guard();

  if char_length(v_title_tr) not between 1 and 80 or char_length(v_title_en) not between 1 and 80 then
    raise exception 'Başlık 1-80 karakter olmalı.';
  end if;
  if char_length(v_desc_tr) > 300 or char_length(v_desc_en) > 300 then
    raise exception 'Açıklama en fazla 300 karakter olabilir.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Bitiş, başlangıçtan sonra olmalı.';
  end if;

  v_tag := public.get_or_create_tag(p_tag_label);

  if p_id is null then
    insert into public.weekly_challenges (title_tr, title_en, description_tr, description_en, tag_slug, starts_at, ends_at, created_by)
    values (v_title_tr, v_title_en, v_desc_tr, v_desc_en, v_tag.slug, p_starts_at, p_ends_at, auth.uid())
    returning id into v_id;
  else
    update public.weekly_challenges
    set title_tr = v_title_tr, title_en = v_title_en, description_tr = v_desc_tr, description_en = v_desc_en,
        tag_slug = v_tag.slug, starts_at = p_starts_at, ends_at = p_ends_at
    where id = p_id and not archived
    returning id into v_id;
    if v_id is null then
      raise exception 'Tema bulunamadı.';
    end if;
  end if;

  perform public._admin_log('save_challenge', null, jsonb_build_object('challenge_id', v_id, 'tag', v_tag.slug));
  return v_id;
end;
$$;

create or replace function public.admin_archive_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._admin_guard();
  update public.weekly_challenges set archived = true where id = p_id and not archived returning id into v_id;
  if v_id is null then
    raise exception 'Tema bulunamadı.';
  end if;
  perform public._admin_log('archive_challenge', null, jsonb_build_object('challenge_id', v_id));
end;
$$;

revoke all on function public.admin_save_challenge(uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_save_challenge(uuid, text, text, text, text, text, timestamptz, timestamptz) to authenticated;
revoke all on function public.admin_archive_challenge(uuid) from public, anon;
grant execute on function public.admin_archive_challenge(uuid) to authenticated;
