-- Promptly — yanıtsız örnek (demo) hesap isteklerini kapatma betiği (docs/history/224-*). ELLE ÇALIŞTIRILIR; migration DEĞİLDİR.
--
-- Sorun: seed'den gelen, hiç yanıtı olmayan açık istekler gerçek bir kullanıcıya "cevap bekleyen" izlenimi verir, ama o isteği açan
-- hesap gerçek biri değildir; "Yanıtla" çağrısı karşılıksız kalır. Bu betik, YALNIZCA örnek hesapların (`profiles.is_demo`) açtığı, hiç
-- yanıtı olmayan ve `p_older_than` günden eski açık istekleri "kapalı" yapar (silmez; geri açmak için `status = 'open'` yeter).
--
-- 1) Önce neyin etkileneceğine bak (salt-okunur):
--      select r.id, r.title, r.created_at from public.prompt_requests r join public.profiles p on p.id = r.author_id
--      where p.is_demo and r.status = 'open' and r.created_at < now() - interval '14 days'
--        and not exists (select 1 from public.prompts x where x.request_id = r.id);
-- 2) Beğendiysen aşağıyı çalıştır (tek işlem; etkilenen satır sayısını döndürür).
begin;
with closed as (
  update public.prompt_requests r
     set status = 'closed', closed_by_owner = true
    from public.profiles p
   where p.id = r.author_id
     and p.is_demo
     and r.status = 'open'
     and r.created_at < now() - interval '14 days'
     and not exists (select 1 from public.prompts x where x.request_id = r.id)
  returning r.id
)
select count(*) as closed_requests from closed;
commit;
