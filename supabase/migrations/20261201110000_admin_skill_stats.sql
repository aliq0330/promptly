-- Moderatör istatistiği: Skill sayıları (docs/history/395-*). `admin_site_stats` (çok sürümlü, büyük bir jsonb işlevi) DEĞİŞTİRİLMEDİ; Skill için ayrı,
-- yalnızca ekleyici bir RPC: toplam/yayında/taslak/özel, paketli, sürüm, alıntı, kullanım, açık Skill şikâyeti. Yalnız moderatör (`_admin_guard`).
create or replace function public.admin_skill_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  return (
    select jsonb_build_object(
      'total', count(*),
      'published', count(*) filter (where s.status = 'published'),
      'draft', count(*) filter (where s.status = 'draft'),
      'private', count(*) filter (where s.visibility = 'private'),
      'with_package', count(*) filter (where exists (select 1 from public.skill_versions v where v.skill_id = s.id)),
      'quotes', coalesce(sum(s.quote_count), 0),
      'uses', coalesce(sum(s.use_count), 0),
      'versions', (select count(*) from public.skill_versions),
      'reports_open', (select count(*) from public.reports r where r.target_type = 'skill' and r.status = 'open')
    ) from public.skills s
  );
end;
$$;
revoke all on function public.admin_skill_stats() from public, anon;
grant execute on function public.admin_skill_stats() to authenticated;
